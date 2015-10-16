var q = require('q')

var User = require('../model/User')
var Message = require('../model/Message')

exports['index'] = function(req, res, next){
	next()
}

exports.home = function(req, res, next){
	q.spread([User.getAllOnline()], function(onlineUsers){
		next({onlineUsers: onlineUsers})
	})
}

exports.profile = function(req, res, next){
  if (!req.user) return res.redirect('/')
  next()
}