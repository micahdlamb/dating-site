//-------------------------------------------------------------------------------------------------
function init(config){
	window.config = config
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Angular ////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

app = angular.module('App', ['ui.bootstrap', 'ngAnimate', 'ngTouch', 'luegg.directives', 'angularMoment', 'angular-bootstrap-select', 'geolocation', 'ngMap'])

app.constant('angularMomentConfig', {

})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Directives /////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////
// Model //////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
app.factory('io', function($q){
  var socket = io.connect(location.protocol+'//'+location.hostname+':'+config.port.websocket)
  socket.on('connect', function(){
    socket.emit('ready')
  })
  socket.on('notify', function(msg){
    Notify.inform(msg)
  })
  // TODO return io after its ready...
  return socket
})

app.factory('model', function($q, $http, io){
  var cache = {}

  //-----------------------------------------------------------------------------------------------
  function get(url, kwds){
    var results = []
    var defer = $q.defer()
 
    $http.post(url, unpopulate(kwds))
    .success(function(items, status, headers, config){
      var promises = []
      angular.forEach(items, function(item, i){
        var cached = cache[item._id]
        if (cached)
          angular.extend(cached, item)
        else
          cache[item._id] = cached = item
        results.push(cached)
        promises.push(populate(cached))
      })
      $q.all(promises).then(function(){
        defer.resolve(results)
      })
    })
    .error(function(err, status, headers, config){
      console.error('error', err)
      defer.reject(err)
    })
  
    results.promise = defer.promise
    return results
  }
  
  //-----------------------------------------------------------------------------------------------
  function getOne(url, kwds){
    var defer = $q.defer()
 
    $http.post(url, unpopulate(kwds))
    .success(function(item, status, headers, config){
      var cached = cache[item._id]
      if (cached)
        angular.extend(cached, item)
      else
        cache[item._id] = cached = item

      populate(cached).then(function(){
        defer.resolve(cached)
      })
    })
    .error(function(err, status, headers, config){
      defer.reject(err)
    })
  
    return defer.promise
    // Can't support returning immediate because no way to know if cached or not until obj returned
  }
  
  //-----------------------------------------------------------------------------------------------
  function create(url, kwds){
    var obj = {}
    var defer = $q.defer()
    
    $http.post(url, unpopulate(kwds))
    .success(function(result, status, headers, config){
      angular.extend(obj, result)
      cache[obj._id] = obj
      populate(obj).then(function(){
        defer.resolve(obj)
      })
    })
    .error(function(data, status, headers, config){
      defer.reject(data)
    })
  
    obj.promise = defer.promise
    return obj
  }
  
  //-----------------------------------------------------------------------------------------------
  function del(url, obj){
    var defer = $q.defer()
    var _id = obj._id
    $http.post(url, {_id: _id})
    .success(function(result, status, headers, config){
      delete cache[_id]
      defer.resolve(result)
    })
    .error(function(data, status, headers, config){
      defer.reject(data)
    })
  
    return defer.promise
  }
  
  //-----------------------------------------------------------------------------------------------
  function save(url, obj){
    var defer = $q.defer()

    $http.post(url, unpopulate(obj))
    .success(function(result, status, headers, config){
      angular.extend(obj, result)
      populate(obj).then(function(){
        defer.resolve(obj)
      })
    })
    .error(function(err, status, headers, config){
      defer.reject(err)
    })
  
    return defer.promise
  }
  
  //-----------------------------------------------------------------------------------------------
  function getById(type, id){
    var defer = $q.defer()
    var cached = cache[id]
    if (!cached){
      cache[id] = cached = {}
      cached.promise = defer.promise
      var kwds = {}
      kwds[id] = type
      $http.post('/model/resolveIds', kwds)
      .success(function(results, status, headers, config){
        var result = results[id]
        angular.extend(cached, result)
        populate(cached).then(function(){
          defer.resolve(cached)
        })
      })
      .error(function(data, status, headers, config){
        defer.reject(data)
      })
    }
    else {
      if (!cached.promise)
        cached.promise = $q.when(cached)
    }
    
    return cached
  }

  //-----------------------------------------------------------------------------------------------
  function populate(obj){
    var defer = $q.defer()
    var todos = {}
    angular.forEach(obj, function(value, field){
      if (angular.isArray(value) && value[0] == '->'){
        var type = value[1]
        var id   = value[2]
        if (cache[id])
          obj[field] = cache[id]
        else {
          obj[field] = cache[id] = {}
          todos[id] = type
        }
      }
    })

    if (angular.equals(todos, {}))
      return $q.when()

    $http.post('/model/resolveIds', todos)
    .success(function(results, status, headers, config){
      var promises = []
      angular.forEach(results, function(result, id){
        var cached = cache[id]
        angular.extend(cached, result)
        promises.push(populate(cached))
      })
      $q.all(promises).then(function(){
        defer.resolve()
      })
    })
    .error(function(data, status, headers, config){
      defer.reject()
    })

    return defer.promise
  }
  
  //-----------------------------------------------------------------------------------------------
  function unpopulate(obj){
    var copy = angular.extend({}, obj)
    angular.forEach(copy, function(value, key){
      if (value && value._id)
        copy[key] = value._id
    })

    return copy
  }
  
  //-----------------------------------------------------------------------------------------------
  var slots = {}
  function connect(event){
    function emit(data){
      var sluts = slots[event]
      if (!sluts) return
      for (var i in sluts)
        sluts[i](data)
    }
  
    io.on(event, function(data){
      if (data && data._id){
        var cached = cache[data._id]
        if (cached)
          angular.extend(cached, data)
        else
          cached = cache[data._id] = data
        populate(cached).then(function(){
          emit(cached)
        })
      }
      else
        emit(data)
    })
  }
  
  function on(event, callback){
    if (!slots[event]){
      slots[event] = []
      connect(event)
    }
    slots[event].push(callback)
  }
  
  
  function emit(event, data){
    io.emit(event, data)
  }

  var model = {
    get: get
    ,getOne: getOne
    ,getById: getById
    ,create: create
    ,delete: del
    ,save:   save
    ,on: on
    ,emit: emit
    ,cache: cache
  }
  
  //errrr not sure how to make this automatic
  model.on('user-modified', function(){})
  
  return model
})

app.factory('geocoder', function(){
  var geocoder = new google.maps.Geocoder()
  geocoder.getLocationName = function(lat, lng, next){
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
      
      var name = location.city + ', ' + location.region_code + ' ' + location.country
      
      next(null, name)
    })
  }

  return geocoder
})

app.factory('userLib', function($http){
  
  function create(name, password){
    $http.post('/user/create', {name: name, password: password}).then(
      function(user){
        window.location = '/profile'
      },
      function(err){
        Notify.error(err)
      }
    )
  }
  
  function login(name, password){
    $http.post('/user/login', {name: name, password: password}).then(
      function(){
        window.location = '/'
      },
      function (err){
        Notify.error(err)
      }
    )
  }
  
  function logout(){
    $http.post('/user/logout').then(function(){
      window.location = '/'
    })
  }

  return {create: create, login: login, logout: logout}
})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Controllers ////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
app.controller('CarouselCtrl', function($scope){
  $scope.slides = [
  {
    image: 'img/chest.jpg'
    ,text: 'Volume rendering of a body'
  }
  ,{
    image: 'img/tree.jpg'
    ,text: 'Volume rendering of a plant'
  }
  ,{
    image: 'img/water-reflection.jpg'
    ,text: 'Reflecting water'
  }
  ]
})

//-------------------------------------------------------------------------------------------------
app.controller("NavCtrl", function($scope, $attrs, $http, model, userLib){
  $scope.user = model.getById('User', $attrs.userid)
  $scope.logout = userLib.logout
})

//-------------------------------------------------------------------------------------------------
app.controller("CreateUserCtrl", function($scope, $http, model, userLib){

  $scope.submit = function(){
    if (!$scope.name || !$scope.password) return
    userLib.create($scope.name, $scope.password)
  }
  
  $scope.startDemo = function(){
    userLib.login('micah', 'asdf')
  }
})

//-------------------------------------------------------------------------------------------------
app.controller("LoginCtrl", function($scope, model, userLib){
  $scope.login = function(){
    userLib.login($scope.name, $scope.password)
  }
})

//-------------------------------------------------------------------------------------------------
app.controller("HomeCtrl", function($scope, $attrs, model){
  $scope.user = model.getById('User', $attrs.userid)
  $scope.messages = model.get('/user/getBroadcastedMessages', {})
  model.on('message-broadcasted', function(msg){
    Notify.inform("<img src='" + msg.from.pic + "'> " + msg.text)
    $scope.messages.push(msg)
  })
  $scope.broadcast = function(){
    if ($scope.text != ''){
      model.create('/user/broadcastMessage', {text: $scope.text})
      $scope.text = ''
    }
  }
})

//-------------------------------------------------------------------------------------------------
app.controller("ProfileCtrl", function($scope, $attrs, model, geolocation, geocoder){
  var user = model.getById('User', $attrs.userid)
  $scope.ages = _.range(18, 65)
  user.promise.then(function(user){
    $scope.edituser = angular.copy(user)
    $scope.user = user
  })
  
  $scope.updateLocation = function(){
    geolocation.getLocation().then(function(data){
      var lat = data.coords.latitude
         ,lng = data.coords.longitude
         
      geocoder.getLocationName(lat, lng, function(err, name){
        if (err) return console.error(err)
        $scope.edituser.lat = data.coords.latitude
        $scope.edituser.lng = data.coords.longitude
        $scope.edituser.locationName = name
        $scope.save()
      })
    })
  }

  $scope.save = function(){
    if ($scope.myform.$invalid) return
    if (angular.equals($scope.edituser, user)) return
    model.save('/user/save', $scope.edituser).then(
    function(obj){
      Notify.success('saved')
      //angular.copy(obj, user)
    }
    ,function(err){
      Notify.error(err)
      angular.copy(user, $scope.edituser) // revert changes since server failed
    })
  }
  
  $scope.pics = model.get('/user/getPics')
  model.on('file-created', function(file){
    $scope.pics.push(file)
  })
  
  // Gallery
  // initial image index
  $scope._index = 0

  // if a current image is the same as requested image
  $scope.isActive = function (index) {
    return $scope._index === index
  }

  // show prev image
  $scope.showPrev = function () {
    $scope._index = ($scope._index > 0) ? --$scope._index : $scope.pics.length - 1
  }

  // show next image
  $scope.showNext = function () {
    $scope._index = ($scope._index < $scope.pics.length - 1) ? ++$scope._index : 0
  }

  // show a certain image
  $scope.showPic = function (index) {
    $scope._index = index
  }
  
  $scope.makePicPrimary = function(){
    var pic = $scope.pics[$scope._index]
    if (!pic) return
    user.pic = pic.url
    model.save('/user/save', user).then(
    function(obj){
      Notify.success('saved')
      $scope.edituser.pic = user.pic
    }
    ,function(err){
      Notify.error(err)
    })
  }
  
  $scope.deletePic = function(){
    var pic = $scope.pics[$scope._index]
    model.delete('user/deletePic', pic).then(
    function(obj){
      Notify.success('deleted')
    }
    ,function(err){
      Notify.error(err)
    })
  }
  
  model.on('file-deleted', function(id){
    $scope.pics.removeById(id)
  })
  
})

//-------------------------------------------------------------------------------------------------
app.controller("ViewUserCtrl", function($scope, $rootScope, $attrs, model){
  var user = model.getById('User', $attrs.userid)
  user.promise.then(function(user){
    $scope.user = angular.copy(user)
    $scope.user.pics = model.get('/user/getPics', {user: $attrs.userid})
  })
  
  $scope.startConvo = function(){
    $rootScope.$broadcast('start-convo', user)
  }
})

//-------------------------------------------------------------------------------------------------
app.controller("SearchCtrl", function($scope, model){
  $scope.ages = _.range(18, 65)
  $scope.didSearch = false
  
  $scope.query = {
    isa: ['man', 'woman', 'couple']
    ,olderThan: 18
    ,youngerThan: 32
    ,withinKm: 20
    ,requireImage: true
    ,useCurrentLocation: true
  }
  
  $scope.results = []
  
  $scope.search = function(){
    model.get('/user/search', $scope.query).promise.then(function(results){
      $scope.results = results
      $scope.didSearch = true
    })
  }
  
  $scope.search()
})

//-------------------------------------------------------------------------------------------------
app.controller("ChatBarCtrl", function($scope, $rootScope, $attrs, $scope, model){
  var user = model.getById('User', $attrs.userid)
  var convoMap = {}

  $scope.allConvos = []
  model.get('/user/getConvos', {}).promise.then(function(convos){
    angular.forEach(convos, function(convo, i){
      addConvo(convo)
    })
  })
  
  $scope.activeConvos = []
  
  function addConvo(convo){
    convoMap[convo.other._id] = convo
    convo.active = false
    convo.minimized = false
    convo.messages = null
    convo.text = ''
    $scope.allConvos.push(convo)
    return convo
  }

  $scope.send = function(convo){
    if (convo.text == "") return
    var msg = model.create('/user/createMessage', {
      to: convo.other,
      text: convo.text
    })
    
    convo.text = ""
  }

  $scope.activate = function(convo){
    if (convo.active) return convo.messages.promise
    convo.active = true
    convo.glued = true
    $scope.activeConvos.remove(convo)
    $scope.activeConvos.push(convo)
    if ($scope.activeConvos.length > 3)
      $scope.deactivate($scope.activeConvos[0])
    if (convo.messages == null)
      convo.messages = model.get('/user/getMessages', {other: convo.other})
    return convo.messages.promise
  }
  
  $scope.deactivate = function(convo){
    convo.active = false
    // TODO could delete messages since they will be reretrieved when reactivated anyway
    $scope.activeConvos.remove(convo)
  }
  
  $scope.toggle = function(convo){
    convo.active ? $scope.deactivate(convo) : $scope.activate(convo)
  }
  
  function startConvo(other, msg){
    var convo = convoMap[other._id]
    if (convo){
      if (msg && convo.messages != null)
        convo.messages.push(msg)
      $scope.activate(convo)
    }
    else
      model.create('/user/createConvo', {other:other})
  }
  
  $scope.$on('start-convo', function(event, other){
    startConvo(other)}
  )
  
  model.on('convo-created', function(convo){
    addConvo(convo)
    $scope.activate(convo)
  })
  
  model.on('message-created', function(msg){
    var other = msg.from._id == $attrs.userid ? msg.to : msg.from
    Notify.inform("<img src='" + msg.from.pic + "'> " + msg.text)
    console.log(other.name)
    startConvo(other, msg)
  })
})

//-------------------------------------------------------------------------------------------------
app.controller("AccountCtrl", function($scope, $attrs, model){
  $scope.user = model.getById('User', $attrs.userid)
  
  $scope.updatePassword = function(){
    model.save('/user/updatePassword', {
      oldPassword: $scope.oldPassword,
      newPassword: $scope.newPassword
    }).then(
      function(obj){
        Notify.success("password updated")
      },
      function(err){
        Notify.error(err)
      }
    )
  }
  
})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Filters ////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
app.filter('reversed', function() {
  return function(items) {
    return items.slice().reverse()
  }
})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Old style initialization ///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

//-------------------------------------------------------------------------------------------------
init.profile = function(){
  $("#pic-uploader").fileinput({
    uploadUrl: '/user/uploadPics',
    uploadAsync: true,
    maxFileCount: 5,
    previewFileType: "image",
    browseClass: "btn btn-success",
    browseLabel: "Pick Image",
    browseIcon: '<i class="glyphicon glyphicon-picture"></i>',
    removeClass: "btn btn-danger",
    removeLabel: "Delete",
    removeIcon: '<i class="glyphicon glyphicon-trash"></i>',
    uploadClass: "btn btn-info",
    uploadLabel: "Upload",
    uploadIcon: '<i class="glyphicon glyphicon-upload"></i>',
  })

}

//-------------------------------------------------------------------------------------------------
init.search = function(){
	//-----------------------------------------------------------------------------------------------

  // Setup Map //////////////////////////////////////////////////////////////////////////////////////
	
	var centerPos = new google.maps.LatLng(59.327383, 18.06747)
	var pos2 = new google.maps.LatLng(59.326507, 18.1054943)
	
	//-----------------------------------------------------------------------------------------------
	function initializeMap(){
		var geocoder = new google.maps.Geocoder()
		
		var options = {
			center: centerPos,
			zoom: 13,
			mapTypeId: google.maps.MapTypeId.TERRAIN
		}
		
		map = new google.maps.Map(document.getElementById("map-canvas"), options)

		//---------------------------------------------------------------------------------------------
		function addMarker(position, img){
			var marker = new google.maps.Marker({
				map: map,
				draggable: true,
				animation: google.maps.Animation.DROP,
				position: position
			})

			var infoWindow = new google.maps.InfoWindow({
				content: "<h4>Date me</h4>" +
								 '<img src="'+img+'">'
			})

			google.maps.event.addListener(marker, 'click', function onMarkerClick(){
				if (infoWindow.getMap()){
				//if (infoWindow.isOpen()){
					infoWindow.close()
					marker.setAnimation(null)
				} else {
					infoWindow.open(map, marker)
					marker.setAnimation(google.maps.Animation.BOUNCE)
				}
			})
			
			google.maps.event.addListener(infoWindow,'closeclick', function(){
				marker.setAnimation(null)
			})
		}

		addMarker(centerPos, "/img/gaycar.jpg")
		addMarker(pos2, "/img/wienercar.jpg")
		
		// Goto Location Form /////////////////////////////////////////////////////////////////////////
		var searchForm = $('#gotoLocation')
		var searchInput = $('#gotoLocation input')
		searchForm.submit(function(){
			var address = $.trim(searchInput.val())
			if (address)
				geocoder.geocode({address: address}, function(results, status){
					if (status != google.maps.GeocoderStatus.OK)
						return error('Search failed... ' + status)
					var latLng = results[0].geometry.location
					map.panTo(latLng)
				})
				
			return false
		})
	}
	
	google.maps.event.addDomListener(window, 'load', initializeMap)
	
	!function handleMapResizingBullshit(){
		var mapTab = $('a[href="#map-view"]')
		function onResize(){
			var center = map.getCenter()
			google.maps.event.trigger(map, "resize")
			map.setCenter(center)
		}
		
		function onShow(){
			onResize()
			google.maps.event.addDomListener(window, "resize", onResize)
		}
		mapTab.on('shown.bs.tab', onShow)
	}()
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// HELPERS ////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
function initializeSideNavToggle(){
		$('[data-toggle="offcanvas"]').click(function () {
			$('.row-offcanvas').toggleClass('active')
		})
}