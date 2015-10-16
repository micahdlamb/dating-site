var Router = require('express').Router

var path = require('path')
var passport = require('passport')
var _ = require('underscore')

var config = require('./config')
var util = require('./lib/util')
var eh = require('./lib/global')('editable-html')
var settings = require('./lib/global')('settings')

var model = require('./controllers/model')
var user = require('./controllers/user')

var File = require('./model/File')

// Settings ///////////////////////////////////////////////////////////////////////////////////////
exports.views = {
	engine: 'jade'
	,dir: ROOT + 'views/'
}

// Data Controllers ///////////////////////////////////////////////////////////////////////////////
var controllers = {
	'user': user
  ,'model': model
}

//-------------------------------------------------------------------------------------------------
exports.router = function(){
	var router = Router()
	//serve files
	router.get('/mongo-file/:id', File.serve)
	router.get('/thumb/:id/:w/:h', File.thumb)

	//initialize req.user
  require('./passport')
	router.all('*', passport.initialize(), passport.session())
	
	//url to login using facebook
	router.get('/auth/facebook', function(req, res, next){
		req.session.redirect = req.query.redirect
		passport.authenticate('facebook')(req, res, next)
	})
	
	//url called by facebook after user logs in
	router.get('/auth/facebook/callback'
		,passport.authenticate('facebook',{ failureRedirect: '/'})
		,function(req, res, next){
			res.redirect(req.session.redirect || '/')
			delete req.session.redirect
		}
	)

	//everything else
	router.all(/^\/((?:\/?[^\/])*)/, defaultRoute)

	return router
}

//-------------------------------------------------------------------------------------------------
function defaultRoute(req, res, next){
	var reqPath = req.params[0].split('/')

	// Data Controller Call /////////////////////////////////////////////////////////////////////////
	var controller = controllers[reqPath[0]]
	if (controller){
		var func = controller[reqPath[1]]
		if (!func) return next()//404
		
    var requiresLogin = controller.requiresLogin || {}
    if (!req.user && requiresLogin[reqPath[1]] !== false)
      return res.send(401, 'login required')
    
		function success(data){
			res.json(data || 'success')
		}
		
		function error(err){
			if (err.toString)
				err = err.toString()
			res.status(418).send(err)
		}
		
    var kwds = _.extend(req.body || {}, req.query || {})
    try {
      func(req, kwds, success, error)
    } catch (err){
      error(err)
    }
    
		return
	}

	// View Controller Call /////////////////////////////////////////////////////////////////////////
	var dir = _.initial(reqPath).join('/')
	if (dir) dir += '/'
	var template = _.last(reqPath)
	if (!template)
		template = req.user ? 'home' : 'index'
				
	//render template if it exists
	path.exists(exports.views.dir + dir + template + '.' + exports.views.engine, function(exists){
		if (!exists)
			return next()//404
			
		//give all templates access to certain data
		var commonData = {
			req: req
			,config: config
			,eh: eh.get()
			,settings: settings.get()
			,user: req.user
			//move to server.js
			,template: template
			,_: _
			,util: util
		}

		function render(data){
			res.render(dir + template, _.extend(commonData, data || {}))
		}
		
		var dataFuncs = require(exports.views.dir + dir + 'data.js')
		var func = dataFuncs[template]
		func ? func(req, res, render) : render({})
	})
}

//404 middleware
exports['404'] = function(req, res, next){
	res.status('404')
	res.render('404', {req: req, title: '404'})
}