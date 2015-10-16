var _ = require('underscore')
var emailer = require('emailjs')
var q = require('q')
var User = require('../model/User')
var gm = require('gm')
var File = require('../model/File')
var URL = require('url')
var request = require('request')
var cheerio = require('cheerio')
var ent = require('ent')
var http = require('http')
var email = require('emailjs')
var fs = require('fs')
var jade = require('jade')
var traverse = require('traverse')

//resolve all promises in the objects tree in place
exports.resolve = function(root){
	if (q.isPromise(root)) return root
	var defer = q.defer()
	var promises = []
	var references = []
	var failed = []
	traverse(root).forEach(function(o){
		if (q.isPromise(o)){
			promises.push(o)
			references.push({parent: this.parent ? this.parent.node : null, key: this.key})
		}
	})

	q.allResolved(promises).then(function(promises){
		for (var i in promises){
			ref = references[i]
			ref.parent[ref.key] = promises[i].valueOf()
			if (!promises[i].isFulfilled())
				failed.push(ref)
		}
		defer.resolve(failed.length ? failed : null)
	})
	
	return defer.promise
}

//cause a loop over an objects keys to be in order
exports.sortKeys = function(o){
	var keys = _.keys(o)
	keys.sort()
	var r = {}
	for (var i in keys)
		r[keys[i]] = o[keys[i]]
	return r
}

//generate a thumbnail of an image and receive its url in next func
exports.thumb = function(id, w, h, next){
	File.findById(id, function(err, file){
		if (err) return next(err)
		if (!file) return next('no file')
		var url = '/thumbs/'+id
		gm(file)
		.resize(w, h)
		.write(ROOT+'public'+url, function(err){
			if (err) return next(err)
			next(null, url)
		})
	})
}

String.prototype.capitalize = function() {
	return this.charAt(0).toUpperCase() + this.slice(1)
}

exports.getWebsiteInfo = function(url){
	var defer = q.defer()
	
	request(url, function(err, resp, body){
		if (err || resp.statusCode != 200){
			console.log('getWebsitePic request failing', err || resp.statusCode)
			return defer.resolve({})
		}
		
		function getPic($){
			//msapplication-TileImage
			var image_src = $("link[rel='image_src']").attr('href')
			if (image_src) return URL.resolve(url, image_src)
			
			var tileImage = $("meta[name='msapplication-TileImage']").attr('content')
			if (tileImage) return URL.resolve(url, tileImage)
			
			var apple = $("link[rel='apple-touch-icon']").attr('href')
			if (apple) return URL.resolve(url, apple)
			
			var facebook = $("meta[property='og:image']").attr('content')
			if (facebook) return URL.resolve(url, facebook)
			
			var favicon = $("link[rel='shortcut icon']").attr('href') || $("link[rel='icon']").attr('href')
			if (favicon) return URL.resolve(url, favicon)

			var furl = URL.resolve(url, '/favicon.ico')
			var pic = q.defer()
			request({
				url: furl
				,method: 'HEAD'
				,followRedirect: false
			}, function(err, resp, body){
				if (err) return pic.resolve(null)
				pic.resolve(resp.statusCode == 200 ? furl : null)
			})
			return pic.promise
		}
		
		function getTitle($){
			console.log('title', $('title').html())
			return $('title').html() || '???'
		}
		
		function getDescription($){
			var desc = $("meta[name='description']").attr('content')
			if (desc) return desc
			desc = $('h1').html()
			if (desc) return desc
			desc = $('h2').html()
			if (desc) return desc
			return ''
		}
		var $ = cheerio.load(body)
		
		q.when(getPic($), function(pic){
			defer.resolve({
				pic: pic
				,title: ent.decode(getTitle($), '')
				,description: ent.decode(getDescription($), '')
			})
		}).done()
	})
	
	return defer.promise
}

exports.sendEmail = function(subject, template, data, from, to, defer){
	defer = defer || q.defer()

	fs.readFile(__dirname + '/emails/' + template + '.jade', 'utf8', function(err, template){
		if (err) return defer.reject(err)

		try {
			var html = jade.compile(template)(data)
		} catch (err){
			return defer.reject(err)
		}
		var server = email.server.connect({
			user: from.user
			,password: from.password
			,host: from.host
			,ssl: from.ssl
			//,domain: from.domain
		})
		console.log('sending email from ' + from.name + ' to ' + to)

		server.send({
			from: from.name
			,to: to
			,subject: subject
			,text: "message attached as html"
			,attachment:
			[
				{data:html, alternative:true}
			]
		}, function(err, msg){
			if (err) console.log('email error', err)
			if (err) return defer.reject(err)
			defer.resolve(msg)
		})
	})

	return defer.promise
}

exports.getattr = function(obj, attr, d3fault){
	var path = attr.split('.')
	var mover = obj
	for (var i=0; i < path.length; i++){
		if (mover[path[i]] == undefined)
			return d3fault
		mover = mover[path[i]]
	}
	return mover
}

exports.setattr = function(obj, attr, value){
	var path = attr.split('.')
	var mover = obj
	for (var i=0; i < path.length-1; i++){
		if (!mover[path[i]])
			mover[path[i]] = {}
		mover = mover[path[i]]
	}
	
	mover[path[path.length-1]] = value
}
