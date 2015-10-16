var _ = require('underscore')
var q = require('q')

///////////////////////////////////////////////////////////////////////////////////////////////////
// Mongo Schema ///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
var	mongoose = require('mongoose')
var Schema   = mongoose.Schema
var ObjectId = Schema.Types.ObjectId
var Oid      = mongoose.Types.ObjectId

var User = new Schema({
  name: { type: String, required: true }
  ,name_lower: { type: String, lowercase: true, index: { unique: true } }
	,email: { type: String, lowercase: true }
	,password: { type: String }
  
	,isa: { type: String, default: 'man', enum: 'man woman couple'.split(' ') }
	,_pic: { type: String }
	,about: { type: String }
  ,lookingFor: { type: String }
  ,hisAge: { type: Number, default: 18 }
  ,herAge: { type: Number, default: 18 }

  ,locationName: { type: String }
  ,lat: { type: Number, index: true, default: 0 }
  ,lng: { type: Number, index: true, default: 0 }
  
	,loginAttempts: { type: Number, required: true, default: 0 }
	,lockUntil: { type: Number }
  
	,facebook: {type: {}}
	,facebookId: {type: String}
  
	,admin: {type: Number, default: 0}
	,lastModified: Date
	,created: {type: Date, default: Date.now}
})

function transform(doc, ret, options){
  delete ret.password
  delete ret.loginAttempts
  delete ret.lockUntil
  delete ret.facebookId
  delete ret.admin
  delete ret.created
}

User.set('toObject', {getters: true, virtuals: true, transform: transform})
User.set('toJSON',   {getters: true, virtuals: true, transform: transform})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Mongoose hooks /////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
User.pre('save', function(next) {
  var self = this
  self.wasNew = self.isNew
	self.lastModified = new Date
  
  if (!self.name)
    self.name = self.id
  
  self.name_lower = self.name

	// only hash the password if it has been modified (or is new)
	if (!self.isModified('password')) return next();

	// hash the password using our new salt
	bcrypt.hash(self.password, null, null, function (err, hash) {
		if (err) return next(err);

		// set the hashed password back on our user document
		self.password = hash;
		next();
	});

});

User.post('save', function(doc){
  if (!this.wasNew)
    mongoose.model('User').emitTo(this._id, 'user-modified', this)
})

User.pre('remove', function(next){
	require('./File').remove({owner: this._id}).exec()
	require('./Message').remove().or([{from: this._id}, {to: this._id}]).exec()

	next()
})

///////////////////////////////////////////////////////////////////////////////////////////////////
// virtual Properties /////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
User.virtual('_type').get(function() { return 'User' })

User.virtual('locked').get(function() {
	// check for a future lockUntil timestamp
	return !!(this.lockUntil && this.lockUntil > Date.now());
})

User.virtual('online').get(function(){
  return !!IO.nsps['/'].adapter.rooms[this.id]
})

User.virtual('pic').get(function(){
  return this._pic || '/img/no-pic.jpg'
})

User.virtual('pic').set(function(val){
  this._pic = val
})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Methods ////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
User.statics.setOnline = function(socket, req){
  socket.join(req.user.id)
}

User.statics.getAllOnline = function(){
	var defer = q.defer()
	
	var userIds = []
	var rooms = IO.nsps['/'].adapter.rooms
	for (var userId in rooms)
			try {userIds.push(new Oid(userId))}
			catch(e){}

	this.model('User').find()
	.where('_id').in(userIds)
	.exec(function(err, users){
		if (err) return defer.reject(err)
		defer.resolve(users)
	})
	
	return defer.promise
}

User.statics.emitTo = function(id, event, data){
  IO.to(id).emit(event, data)
}

User.statics.emitToAll = function(event, data){
  IO.emit(event, data)
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Password / Login ///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

// Mostly copied from http://devsmash.com/blog/password-authentication-with-mongoose-and-bcrypt
// WARNING: Password should always be updated using User.save so it gets encrypted

var bcrypt = require('bcrypt-nodejs')

// these values can be whatever you want - we're defaulting to a
// max of 5 attempts, resulting in a 2 hour lock
var MAX_LOGIN_ATTEMPTS = 10
var LOCK_TIME = 2 * 60 * 60 * 1000

User.methods.comparePassword = function(candidatePassword, cb) {
	bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
		if (err) return cb(err);
		cb(null, isMatch);
	});
};

User.methods.incLoginAttempts = function(cb) {
	// if we have a previous lock that has expired, restart at 1
	if (this.lockUntil && this.lockUntil < Date.now()) {
		return this.update({
			$set: { loginAttempts: 1 },
			$unset: { lockUntil: 1 }
		}, cb);
	}
	// otherwise we're incrementing
	var updates = { $inc: { loginAttempts: 1 } };
	// lock the account if we've reached max attempts and it's not locked already
	if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.locked) {
		updates.$set = { lockUntil: Date.now() + LOCK_TIME };
	}
	return this.update(updates, cb);
};

// expose enum on the model, and provide an internal convenience reference 
var reasons = User.statics.failedLogin = {
	NOT_FOUND: 0,
	PASSWORD_INCORRECT: 1,
	MAX_ATTEMPTS: 2,
	NO_PASSWORD: 3
};

User.statics.getAuthenticated = function(name, password, cb) {
  name = name.toLowerCase()
	this.findOne()
  .or([{ email: name }, {name_lower: name}])
  .exec(function(err, user) {
		if (err) return cb(err);

		//make sure the user exists
		if (!user) {
			return cb(null, null, reasons.NOT_FOUND);
		}

		//check if the account is currently locked
		if (user.locked) {
			// just increment login attempts if account is already locked
			return user.incLoginAttempts(function(err) {
				if (err) return cb(err);
				return cb(null, null, reasons.MAX_ATTEMPTS);
			});
		}

		//if they are using social login (Facebook, Twitter login etc) and don't have a password
		if (!user.password)
			return cb(null, null, reasons.NO_PASSWORD)
		
		//test for a matching password
		user.comparePassword(password, function(err, isMatch) {
			if (err) return cb(err);

			//check if the password was a match
			if (isMatch) {
				// if there's no lock or failed attempts, just return the user
				if (!user.loginAttempts && !user.lockUntil) return cb(null, user);
				// reset attempts and lock info
				var updates = {
					$set: { loginAttempts: 0 },
					$unset: { lockUntil: 1 }
				};
				return user.update(updates, function(err) {
					if (err) return cb(err);
					return cb(null, user);
				});
			}

			//password is incorrect, so increment login attempts before responding
			user.incLoginAttempts(function(err) {
				if (err) return cb(err);
				return cb(null, null, reasons.PASSWORD_INCORRECT);
			})
		})
	})
}

///////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = mongoose.model('User', User);