//-------------------------------------------------------------------------------------------------
Notify = {}
Notify.error = function(msg){
	if (typeof msg != 'string') msg = JSON.stringify(msg)
	return $().toastmessage('showErrorToast', msg)
}
Notify.warn = function(msg){
	return $().toastmessage('showWarningToast', msg)
}
Notify.success = function(msg){
	return $().toastmessage('showSuccessToast', msg)
}
Notify.inform = function(msg){
	return $().toastmessage('showNoticeToast', msg)
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Extend JS //////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
Object.defineProperty(Array.prototype, 'remove', {
  value: function(value) {
    var index = this.indexOf(value)
    if (index == -1) return false
    this.splice(index, 1)
    return true
  },
  enumerable: false
})

Object.defineProperty(Array.prototype, 'removeById', {
  value: function(id) {
    for (var i in this){
      if (this[i]._id == id){
        this.splice(i, 1)
        return true
      }
    }
    return false
  },
  enumerable: false
})

//-------------------------------------------------------------------------------------------------
!function removeFacebookAppendedHash() {
	// Remove the ugly Facebook appended hash
	// <https://github.com/jaredhanson/passport-facebook/issues/12>
	if (!window.location.hash || window.location.hash !== '#_=_')
		return;
	if (window.history && window.history.replaceState)
		return window.history.replaceState("", document.title, window.location.pathname);
		// Prevent scrolling by storing the page's current scroll offset
	var scroll = {
		top: document.body.scrollTop,
		left: document.body.scrollLeft
	};
	window.location.hash = "";
	// Restore the scroll offset, should be flicker free
	document.body.scrollTop = scroll.top;
	document.body.scrollLeft = scroll.left;
}();

//-------------------------------------------------------------------------------------------------
$.extend({
	dpost: function(disable, url, data, success){
		if ($.isFunction(data)){
			success = data
			data = {}
		}
		
		if (disable.attr('disabled')) return notify('double submit prevented')
		var label = disable.is('button') ? disable.html() : null
		$.ajax({
			type: 'POST'
			,url: url
			,data: data
			,success: success
			,beforeSend: function(){
				disable.attr('disabled', 'disabled')
				if (label) disable.html(label+'...')
			}
			,complete: function(){
				disable.removeAttr('disabled')
				if (label) disable.html(label)
			}
		})
	}
	,closeOnClickOff: function($off, $close){
		$(window).click(function(ev){
			if ($(ev.target).closest($off).length == 0)
				$close.hide(250)
		})
		$('iframe').click(function(ev){
			if ($(ev.target).closest($off).length == 0)
				$close.hide(250)
		})
	}
	,move: function (array, from, to) {
		if (to >= array.length) {
			var k = to - array.length
			while ((k--) + 1)
				array.push(undefined)
		}
		array.splice(to, 0, array.splice(from, 1)[0])
	}
	,htmlEncode: function(value){
		if (value) {
			return jQuery('<div />').text(value).html();
		} else {
			return '';
		}
	}
	,htmlDecode: function(value) {
		if (value) {
			return $('<div />').html(value).text();
		} else {
			return '';
		}
	}
	,locateIP: function(next){
		$.getJSON('http://freegeoip.net/json/?callback=?', function(result){
			next(result)
		})
	}
	,geolocate: function(next, timeout){
		if (!navigator.geolocation)
			return next("no geolocater")
			
		var movedOn = false//required because of browser idiocy
		navigator.geolocation.getCurrentPosition(function(pos){
			if (movedOn) return
			movedOn = true
			
			var lat = pos.coords.latitude
				,lng = pos.coords.longitude
			var latlng = new google.maps.LatLng(lat, lng)
			geocoder = window.geocoder || new google.maps.Geocoder()
			geocoder.geocode({'latLng': latlng}, function(results, status){
				if (status != google.maps.GeocoderStatus.OK || !results.length)
					return next("google geocode fail")
				
				var location = {}
				//the fuck google?
				_.each(results[0].address_components, function(o){
					if ($.inArray('sublocality', o.types) != -1)
						location.city = o.long_name
					if ($.inArray('locality', o.types) != -1)
						location.city = o.long_name
					if ($.inArray('administrative_area_level_1', o.types) != -1)
						location.region_code = o.short_name
					if ($.inArray('country', o.types) != -1)
						location.country = o.short_name
				})
				
				next(null, location)
			})
		}
		,function(){
			if (movedOn) return
			movedOn = true
			
			next("unknown")
		}
		,timeout ? {timeout: timeout} : null)
		
		if (timeout)
			setTimeout(function(){
				if (movedOn) return
				movedOn = true
				
				next("timeout")
			}, timeout)
	}
	,getLocation: function(next){
		$.geolocate(function(err, location){
			if (err) return $.locateIP(next)
			next(location)
		}, 5000)
	}
	,closePopup: function(){
		$.fancybox.close()
	}
	,onChange: function(obj, handler, recursive, namespace){
		if (!recursive)
			return $(obj).on('change', handler)

		namespace = namespace || '.onChange' + unique++
		
		function block(self, obj){
			return self.circular
			|| !$.isContainer(obj)
			|| $.isDOM(obj)
			|| obj instanceof jQuery
			|| (self.key && self.key.lastIndexOf("jQuery", 0) === 0)
			//|| self.key && self.key.substring(0, 6) == "jQuery"
			//todo: block if already has namespaced events
		}
		
		traverse(obj).forEach(function(obj){
			if (block(this, obj)) return this.block()

			$(obj).off(namespace)
			$(obj).on('_change'+namespace, handler)
			$(obj).on('_change'+namespace, function(evt, object, field, newVal, oldVal){
				traverse(oldVal).forEach(function(obj){
					if (block(this, obj)) return this.block()
					$(obj).off(namespace)
				})
				$.onChange(newVal, handler, true, namespace)
			})
		})
	}
	,change: function(obj, field, val){
		if ($.type(field) === 'object'){
			for (var i in field)
				$.change(obj, i, field[i])
			return
		}
		
		var oldVal = obj[field]
		if (oldVal == val) return
		obj[field] = val

		$(obj).triggerHandler('_change', [obj, field, val, oldVal])
	}
	,isContainer: function(obj){
		return $.type(obj) === 'object' || $.type(obj) === 'array'
	}
	,isDOM: function(o){
		return (
		typeof Node === "object" ? o instanceof Node : 
		o && typeof o === "object" && typeof o.nodeType === "number" && typeof o.nodeName==="string"
		);
	}
	,getattr: function(obj, attr, d3fault){
		var path = attr.split('.')
		var mover = obj
		for (var i=0; i < path.length; i++){
			if (mover[path[i]] == undefined)
				return d3fault
			mover = mover[path[i]]
		}
		return mover
	}

	,setattr: function(obj, attr, value){
		var path = attr.split('.')
		var mover = obj
		for (var i=0; i < path.length-1; i++){
			if (!mover[path[i]])
				mover[path[i]] = {}
			mover = mover[path[i]]
		}
		
		mover[path[path.length-1]] = value
	}
})

$.fn.switchClass = function(from, to){
	this.removeClass(from).addClass(to)
}

//convert form to object
$.fn.objectify = function(){
	var o = {}, a = this.serializeArray()
	for (var i in a)
		o[a[i].name] = a[i].value
	return o
}

$.fn.popup = function(){
	$.fancybox({
		type: 'inline'
		,href: this.selector
		,openEffect: 'fade'
		,closeEffect: 'fade'
		,wrapCSS: 'panel'
		,afterShow: function(){
			this.content.triggerHandler('popup')
		}
	})
}

$.fn.popupForm = function(next){
	var form = this
	form.off('.popup').on('submit.popup', function(ev){
		next(form.objectify())
		$.closePopup()
		return false
	})
	form.popup()
}

$.fn.blinkClass = function(cls, period){
	var that = this
	var TOField = 'blinkTO.' + cls
	if (this.data(TOField))
		clearTimeout(this.data(TOField))
	var to = setInterval(function(){
		that.toggleClass(cls)
	}, period || 600)
	this.data(TOField, to)
}

$.fn.stopBlinkClass = function(cls){
	var TOField = 'blinkTO.' + cls
	if (this.data(TOField))
		clearTimeout(this.data(TOField))
}

String.prototype.capitalize = function() {
	return this.charAt(0).toUpperCase() + this.slice(1)
}

var showErrors = {
	fadeInOut: function(errs, div){
		var msg = ""
		for (e in errs){
			errs[e].input.effect('shake')
			msg += errs[e].msg + '<br>'
		}
		
		div.html(msg)
		div.show()
		clearTimeout(div.data('timeout'))
		div.data('timeout', setTimeout(function(){div.fadeOut(300)}, 3000))
	}
}
