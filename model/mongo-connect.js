var mongoose = require('mongoose')
var mongo = require('../config').mongo

mongoose.connect(mongo.connect, mongo.db)

var con = mongoose.connection;
con.on('error', console.error.bind(console, 'connection error:'));
con.once('open', function callback () {
	console.log('connected to mongo')
})
