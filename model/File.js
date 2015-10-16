var q = require('q')
var _ = require('underscore')

var gm = require('gm')
var path = require('path')

///////////////////////////////////////////////////////////////////////////////////////////////////
// Mongo Schema ///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
var	mongoose = require('mongoose')
var Schema   = mongoose.Schema
var ObjectId = Schema.Types.ObjectId
var Oid      = mongoose.Types.ObjectId

var File = new Schema({
	user: {
		type: ObjectId
		,ref: 'User'
	}
	,name: {
		type: String
	}
	,description: {
		type: String
	}
	//,type : {
	//	type: String
	//	,required: true
	//}
	,ext: {//extension
		type: String
	}
	,group: {
		type: String
	}
	,binary: {
		type: Buffer
		,required: true
	}
	,lastModified: {
		type: Date
	}
})

function transform(doc, ret, options){
  if (ret.user) ret.user = ['->', 'User', ret.user]
  delete ret.binary
}

File.set('toObject', {getters: true, virtuals: true, transform: transform})
File.set('toJSON',   {getters: true, virtuals: true, transform: transform})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Mongoose hooks /////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
File.pre('save', function(next) {
  this.wasNew = this.isNew
	this.lastModified = new Date
	this.ext = _.last(this.name.split('.'))
	next()
})

File.post('save', function(doc) {
  var User = require('./User')
  if (this.wasNew){
    if (this.user) User.emitTo(this.user, 'file-created', this)
  }
})

File.post('remove', function(doc) {
  var User = require('./User')
  User.emitTo(this.user, 'file-deleted', doc._id)
  User.findById(doc.user, function(err, user){
    if (err) return console.err(err)
    if (!user) return console.err('file deleted from non existant user')
    if (user._pic == doc.url){
      user._pic = null
      // This isn't currently emitted....
      user.save()
    }
  })
})

///////////////////////////////////////////////////////////////////////////////////////////////////
// virtual Properties /////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
File.virtual('_type').get(function() { return 'File' })

File.virtual('url').get(function(){
  return '/mongo-file/' + this._id
})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Methods ////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
function cached(req, res){
	//eventually check whether if-modified-since == last-modified or something?
	if (req.get('If-Modified-Since')){
		res.writeHead(304)
		res.end()
		return true
	}
	return false
}

File.statics.serve = function(req, res, next){
	if (cached(req, res)) return
	
	var id = req.params.id
	module.exports.findById(id, function(err, file){
		if (err) return next(err)
		if (!file) return next()

		res.writeHead(200, {
			"Content-Type": file.type
			,"Last-Modified": file.lastModified
		})
		res.end(file.binary)
	})
}

File.statics.thumb = function(req, res, next){
	if (cached(req, res)) return
	
	var id = req.params.id, w = req.params.w, h = req.params.h
	var filePath = ROOT + 'tmp/' + id + '.png'

	path.exists(filePath, function(exists){
		if (exists)
			return res.sendfile(filePath)
			
		module.exports.findById(id, function(err, file){
			if (err) return next(err)
			if (!file) return next('no file')
			gm(file.binary)
			.resize(w, h)
			.write(filePath, function(err){
				if (err) return next(err)
				res.sendfile(filePath)
			})
			/*
			.stream(function streamOut (err, stdout, stderr){
				if (err) return next(err)
				stdout.pipe(res)
			})
			*/
		})
	})
}

File.statics.url = function(id){
	return '/mongo-file/' + id
}

///////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = mongoose.model('File', File)