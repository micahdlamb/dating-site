var fs = require('fs')
var oauth = require('oauth')
var request = require('request')
var cheerio = require('cheerio')
var email = require('emailjs')
var jade = require('jade')

var gm = require('gm')
var natural = require('natural')
var URL = require('url')
var ent = require('ent')
var randomstring = require('randomstring')

var passport = require('passport')

var _ = require('underscore')
var q = require('q')

var	mongoose = require('mongoose')
var Oid  = mongoose.Types.ObjectId
var User = require('../model/User')
var Convo = require('../model/Convo')
var Message = require('../model/Message')
var File = require('../model/File')

var util = require('../lib/util')
var google = require('../lib/google')

var config = require('../config')

//-------------------------------------------------------------------------------------------------
exports.requiresLogin = {
  'create': false
  ,'login': false
}

//-------------------------------------------------------------------------------------------------
exports.create = function(req, kwds, success, error){

  user = new User({
    name:      kwds.name
    ,password: kwds.password
  })
  
  user.save(function(err){
    if (err) return error(err)
    req.logIn(user, function(err) {
				if (err) return error(err)
				success(user)
			})
  })
}

//-------------------------------------------------------------------------------------------------
exports.delete = function(req, kwds, success, error){
  req.user.remove(function(err){
    if (err) return error(err)
    success('deleted')
  })
}

//-------------------------------------------------------------------------------------------------
exports.secretdelete = function(req, kwds, success, error){
  //if (!req.user.admin) return error("access denied")
  User.findById(kwds.id, function(err, user){
    if (err) return error(err)
    if (!user) return error("Can't find user to delete")
    user.remove(function(err){
      if (err) return error(err)
      success('deleted')
    })
  })
}

//-------------------------------------------------------------------------------------------------
exports.login = function(req, kwds, success, error){
	passport.authenticate('local', function(err, user, info) {
		if (err)   return error(err)
		if (!user) return error(info.message)
		req.logIn(user, function(err) {
			if (err) return error(err)
			success(user)
		})
	})(req)
}

//-------------------------------------------------------------------------------------------------
exports.logout = function(req, args, success, error){
	req.logout()
	success()
}

//-------------------------------------------------------------------------------------------------
exports.save = function(req, kwds, success, error){
  kwds = _.pick(kwds, 'name', 'isa', 'pic', 'about', 'lookingFor', 'hisAge', 'herAge', 'lat', 'lng', 'locationName')
  _.extend(req.user, kwds)
  req.user.save(function(err){
    if (err) return error(err)
    success(req.user)
  })
}

exports.updatePassword = function(req, kwds, success, error){
  if (req.user.password != kwds.oldPassword)
    return error("wrong password")
    
  req.user.password = kwds.newPassword
  req.user.save(function(err){
    if (err) return error(err)
    success(req.user)
  })
}

//-------------------------------------------------------------------------------------------------
exports.getConvos = function(req, kwds, success, error){
  Convo.find({user: req.user})
  .sort('-lastModified')
  .exec(function(err, convos){
    if (err) return error(err)
    success(convos)
  })
}

//-------------------------------------------------------------------------------------------------
exports.createConvo = function(req, kwds, success, error){
  kwds.user = req.user
  var convo = new Convo(kwds)
  convo.save(function(err){
    if (err) return error(err)
    success(convo)
  })
}

//-------------------------------------------------------------------------------------------------
exports.getMessages = function(req, kwds, success, error){
  Message.find()
  .or([{from: req.user, to: kwds.other}, {from: kwds.other, to: req.user}])
  .sort('time')
  .exec(function(err, messages){
    if (err) return error(err)
    success(messages)
  })
}

//-------------------------------------------------------------------------------------------------
exports.getBroadcastedMessages = function(req, kwds, success, error){
  Message.find({to:null})
  .sort('time')
  .exec(function(err, messages){
    if (err) return error(err)
    success(messages)
  })
}

//-------------------------------------------------------------------------------------------------
exports.createMessage = function(req, kwds, success, error){
  Convo.findOne({user: req.user, other: kwds.to}, function(err, convo){
    if (err) return error(err)
    if (!convo){
      convo = new Convo({
        user: req.user
        ,other: Oid(kwds.to)
        ,unseen: 0
      })
    }
    convo.unseen += 1
    convo.save(function(err){
      if (err) return error(err)
      
      var message = new Message({
        from: req.user
        ,to: Oid(kwds.to)
        ,text: kwds.text
      })
      
      message.save(function(err){
        if (err) return error(err)
        success(message)
      })
    })
  })
}

//-------------------------------------------------------------------------------------------------
exports.broadcastMessage = function(req, kwds, success, error){
  var message = new Message({
    from: req.user
    ,to: null
    ,text: kwds.text
  })
  
  message.save(function(err){
    if (err) return error(err)
    success(message)
  })
}

//-------------------------------------------------------------------------------------------------
exports.search = function(req, kwds, success, error){
  var isa = kwds['isa'];
  var withinKm = kwds.withinKm;
  var withinLat = withinKm / 111
  var withinLng = withinKm / 85 //This is wrong!!! need formula
  var minLat = req.user.lat - withinLat
     ,maxLat = req.user.lat + withinLat
  var minLng = req.user.lng - withinLng
     ,maxLng = req.user.lng + withinLng
  
  var query = User.find()
  .where('isa').in(isa)
  .or([{'lat': {$gte: minLat}}, {'lat': {$lte: maxLat}}])
  .or([{'lng': {$gte: minLng}}, {'lng': {$lte: maxLng}}])
  
  if (kwds.requireImage)
    query.where('_pic').ne(null)
  
  query.exec(function(err, users){
    if (err) return error(err)
    success(users)
  })
}

//-------------------------------------------------------------------------------------------------
exports.uploadPics = function(req, kwds, success, error){

	var promises = []
	for (var i in req.files)
		promises.push(saveFile(req.user, req.files[i], 'pics'))
	
	q.all(promises).then(
    function(files){success(files)},
    function(err)  {error(err)}
  )
}

//-------------------------------------------------------------------------------------------------
exports.getPics = function(req, kwds, success, error){
  var user = kwds.user || req.user._id
  File.find({user: user, group: 'pics'})
  .exec(function(err, pics){
    if (err) return error(err)
    else success(pics)
  })
}

//-------------------------------------------------------------------------------------------------
exports.deletePic = function(req, kwds, success, error){
  var user = kwds.user || req.user._id
  File.findOne({user: user, _id: kwds._id})
  .exec(function(err, file){
    if (err) return error(err)
    if (!file) return error("pic doesn't exist")
    file.remove(function(err){
      if (err) return error(err)
      success('deleted')
    })
  })
}

//-------------------------------------------------------------------------------------------------
function saveFile(user, file, group){
	var defer = q.defer()
	
	fs.readFile(file.path, function (err, buf){
		if (err) return defer.reject(err)
		var f = new File({
			user: user
			,name: file.name
			//,type: file.type
			,binary: buf
			,group: group
		})
		
		f.save(function(err){
			if (err) return defer.reject(err)
			defer.resolve(f)
		})
	})
	
	return defer.promise
}
