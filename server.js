// GLOBALS /////////////////////////////////////////////////////////////////////////////////////////
ROOT = __dirname + '/'
LOCAL = process.env.HOSTNAME == 'micah-pc'
APP = null
IO = null

// Imports ////////////////////////////////////////////////////////////////////////////////////////
var path = require('path')
var mongoose = require('mongoose')
var express = require('express')
var logger = require('morgan')
var methodOverride = require('method-override')
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var session = require('express-session')
var bodyParser = require('body-parser')
var errorhandler = require('errorhandler')
var middleware = require('./middleware')
var lessMiddleware = require('less-middleware')
var multer = require('multer')
var routes = require('./routes')
require('./lib/url-utils')//extends url lib with normalize and equals functions

//connect to databases
var mongo = require('./model/mongo-connect')

//create app
var config = require('./config')
var MongoStore = require('connect-mongo')(session)
var sessionStore = new MongoStore({mongoose_connection: mongoose.connection})

APP = express()
var server = require('http').Server(APP)

// Middleware /////////////////////////////////////////////////////////////////////////////////////
APP.set('views', routes.views.dir)
APP.set('view engine', routes.views.engine);
//app.use(express.favicon());
APP.use(lessMiddleware(__dirname + '/public'))
APP.use(middleware.stylus)
APP.use(express.static(path.join(__dirname, 'public')))
APP.use(logger('dev'))
APP.use(methodOverride())
APP.use(cookieParser(config.secret))
APP.use(session({store: sessionStore, secret: config.secret, saveUninitialized: true, resave: true}))
APP.use(multer())
APP.use(bodyParser.json())

APP.use(routes.router())
APP.use(routes['404'])

// Local Debug Settings ///////////////////////////////////////////////////////////////////////////
if (LOCAL){
	APP.set('view options', { pretty: true })
	APP.use(errorhandler({showStack: true, dumpExceptions: true}))
	mongoose.set('debug', true)

// Live Debug Settings ////////////////////////////////////////////////////////////////////////////
} else {
	APP.use(errorhandler({}))
}

// socket.io //////////////////////////////////////////////////////////////////////////////////////
IO = require('socket.io')(server)
IO.use(middleware.ioPassport(sessionStore))
IO.on('connection', function(socket){
  var User = require('./model/User')
  var req = socket.request
  // Map user to their connected sockets so they can recieve model change events
  if (req.user)
    User.setOnline(socket, req)
})

// Start Listening ////////////////////////////////////////////////////////////////////////////////
var ip = config.ip
var port = config.port.http
server.listen(port, ip, function() {
	console.log('%s: Node server started on %s:%d ...',
							Date(Date.now() ), ip, port)
})