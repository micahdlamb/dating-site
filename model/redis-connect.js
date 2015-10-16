var redis = require('redis')
var config = require('../config').redis

var client
if (LOCAL)
	client = redis.createClient()
else {
	client = redis.createClient(config.port, config.client)
	client.auth(config.auth, function (err) {
		if (err) return console.log('redis auth failed', err)
		console.log('redis auth succeeded')
	})
}

client.on('error', function (err) {
	console.log("redis error: ", err)
})

client.on("ready", function(){
	console.log('redis is ready')
	client.ready = true
})

module.exports = client