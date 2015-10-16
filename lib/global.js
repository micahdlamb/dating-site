/*
Manages global variables persisted in mongo, ignores race conditions
*/
var q = require('q')
var fs = require('fs')
var _ = require('underscore')

var Global = require('../model/Global')
var util = require('./util')

var globals = {}

function Persisted(key){
	var self = this
	var file = __dirname + '/../global-defaults/' + key + '.json'
	
	//----------------------------------------------------------------------------
	this.download = function(){
		var defer = q.defer()
		Global.findOne({key: key}, function(err, global){
			if (err) return defer.reject(err)
			
			if (global){
				self.value = global.value

				//backup on disk, may remove later
				/*
				fs.writeFile(file, JSON.stringify(global.value), function(err){
					if (err) console.log('problem saving global ' + key + ' to disk')
				})
				*/
				return defer.resolve()
			}
			
			//not found in mongo, initialize off disk
			console.log('Global ' + key + ' not found in mongo. Loading from ' + file)
			self.value = require(file)
			
			global = new Global({
				key: key
				,value: self.value
			})
			
			global.save(function(err){
				if (err) return defer.reject(err)
				return defer.resolve()
			})
		})
		
		return defer.promise
	}

	self.download()

	//----------------------------------------------------------------------------
	this.set = function(attr, value){
		var defer = q.defer()
		var update = {}
		if (value === undefined){
			for (var k in self.value) delete self.value[k]
			_.extend(self.value, attr)
			update['value'] = attr
		}
		else {
			util.setattr(self.value, attr, value)
			update['value.' + attr] = value
		}

		Global.update({key: key}, update, function(err, num){
			if (err || !num) return defer.reject(err)
			defer.resolve('global ' + key + ' updated')
		})
		
		return defer.promise
	}
	
	//----------------------------------------------------------------------------
	this.get = function(attr){
		if (attr === undefined)
			return self.value
		else
			return util.getattr(self.value, attr)
	}
}

module.exports = function(key){
	if (globals[key]) return globals[key]
	
	globals[key] = new Persisted(key)
	return globals[key]
}