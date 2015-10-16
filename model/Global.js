var mongoose = require('mongoose')
var Schema = mongoose.Schema

var Global = new Schema({
	key: {
		type: String
	}
	,value: {
		type: {}
	}
	,lastModified: {
		type: Date
	}
})

Global.pre('save', function(next) {
	this.lastModified = new Date
	next()
})

module.exports = mongoose.model('Global', Global)