var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy
var FacebookStrategy = require('passport-facebook').Strategy
var _ = require('underscore')

var config = require('./config')
var util = require('./lib/util')

var User = require('./model/User')

passport.serializeUser(function(user, done) {
	done(null, user.id)
})

passport.deserializeUser(function(id, done) {
	User.findById(id, function (err, user) {
		done(err, user)
	})
})

passport.use('local', new LocalStrategy({
		usernameField: 'name'
		,passwordField: 'password'
	}, function(name, password, done) {
	
	User.getAuthenticated(name, password, function(err, user, reason) {
		if (err) return done(err)
		
		// login was successful if we have a user
		if (user) return done(null, user)

		// otherwise we can determine why we failed
		var reasons = User.failedLogin;
		var msg
		switch (reason) {
			case reasons.NOT_FOUND:
			msg = 'account with name ' + name + ' does not exist'
			break
			case reasons.PASSWORD_INCORRECT:
			// note: these cases are usually treated the same - don't tell
			// the user *why* the login failed, only that it did
			msg = 'invalid password'
			break
			case reasons.MAX_ATTEMPTS:
			// send email or otherwise notify user that account is
			// temporarily locked
			msg = 'too many failed logins, your account is temporarily locked'
			break
			case reasons.NO_PASSWORD:
			msg = 'no password for this account, use login with social instead'
			break
		}
		done(null, false, {message: msg})
	})
}))

//only call after validating admin status
passport.use('loginAs', new LocalStrategy({
		usernameField: 'name'
		,passwordField: 'password'//unused
	}, function(name, password, done) {
	
	User.findOne({name_lower: name.toLowerCase()}, function(err, user){
		if (err) return done(err)
		done(null, user)
	})
}))

var fbAuth = _.extend(config.facebook, {callbackURL: config.facebook.authCallback, passReqToCallback: true})
passport.use(new FacebookStrategy(fbAuth, function(req, accessToken, refreshToken, profile, done) {
	//profile._json is what we really want? (I forget)
	console.log(profile)
	delete profile._raw
	_.extend(profile, profile._json)
	delete profile._json
	
	var facebookId = profile.id
	
	function next(user){
		//update locally stored information about user
		user.facebook = profile
		user.pic = 'http://graph.facebook.com/'+profile.id+'/picture'
		//user.name = profile.displayName
		//user.bio = profile.bio

		user.save(function(err){
			if (err) return done(err)
			done(null, user)
		})
	}
	
	//if a user is currently logged in
	if (req.user){
		//if user doesnt have a linked facebook account or is same as facebook user
		if (!req.user.facebook || req.user.facebook.id == facebookId)
			return next(req.user)
			
		//continue on and log in as facebook user
	}
		
	//find user with this facebook account already linked
	User.findOne({'facebook.id': facebookId}, function(err, user){
		if (err) return done(err)
		if (user)
			return next(user)
		
		var email = profile.email
		if (!email)
			return done("no email to create account with")
		
		//see if a user exists with same email as facebook user. If so, link account with him
		User.findOne({email: email}, function(err, user){
			if (err) return done(err)
			if (user)
				return next(user)

			//last resort, create new account with facebook user's email
			var newUser = new User({
				email: email
			})
			next(newUser)
		})
	})
}))