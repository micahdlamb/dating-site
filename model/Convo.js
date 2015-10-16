var mongoose = require('mongoose')
var Schema = mongoose.Schema
var oid = Schema.Types.ObjectId

var _ = require('underscore')

var Convo = new Schema({
  user: {
		type: oid
		,ref: 'User'
  }
  ,other: {
		type: oid
		,ref: 'User'
  }
  ,unseen: {
    type: Number
    ,default: 0
  }
	,lastModified: {
		type: Date
	}
})

function transform(doc, ret, options){
  ret.user =  ['->', 'User', ret.user]
  ret.other = ['->', 'User', ret.other]
}

Convo.set('toObject', {getters: true, virtuals: true, transform: transform})
Convo.set('toJSON',   {getters: true, virtuals: true, transform: transform})

///////////////////////////////////////////////////////////////////////////////////////////////////
// Mongoose hooks /////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

Convo.pre('save', function(next) {
  this.wasNew = this.isNew
  this.lastModified = new Date
  next()
})

Convo.post('save', function() {
  var User = require('./User')
  if (this.wasNew){
    User.emitTo(this.user, 'convo-created', this)
  }
})

///////////////////////////////////////////////////////////////////////////////////////////////////
// virtual Properties /////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
Convo.virtual('_type').get(function() { return 'Convo' })

///////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = mongoose.model('Convo', Convo)