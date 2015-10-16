var _ = require('underscore')
var q = require('q')

var	mongoose = require('mongoose')
var Oid  = mongoose.Types.ObjectId

//-------------------------------------------------------------------------------------------------
exports.resolveIds = function(req, kwds, success, error){
  var promises = []
  _.each(req.body, function(collection, id){
    var defer = q.defer()
    mongoose.model(collection).findById(id, function(err, record){
      if (err) return defer.reject(err)
      defer.resolve(record)
    })
    promises.push(defer.promise)
  })

  q.all(promises).then(function(values){
    success(_.indexBy(values, '_id'))
  })
}
/*
//-------------------------------------------------------------------------------------------------
exports.save = function(req, kwds, success, error){
  var type = kwds._type

  if (kwds._id){
    mongoose.model(type).findById(Oid(kwds._id), function(err, obj){
      if (err)  return error(err)
      if (!obj) return error('Invalid id')
      _.extend(obj, kwds)
      obj.save(function(err){
        if (err) return error(err)
        success(obj)
      })
    })
  } else {
    var obj = new mongoose.model(kwds._type)(kwds)
    obj.save(function(err){
      if (err) return error(err)
      success(obj)
    })
  }
}
*/