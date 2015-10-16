// ALL ////////////////////////////////////////////////////////////////////////////////////////////
exports.secret = 's3xyt1me'

exports.facebook = {
	clientID: '896800923666848'
	,clientSecret: 'f1a0ddb235768c24cc637cc178ba647a'
	,scope: ['email', 'user_about_me', 'user_location', 'user_website']
}

// LOCAL //////////////////////////////////////////////////////////////////////////////////////////

if (LOCAL){
	exports.ip = "0.0.0.0"
	exports.port = {
		http: process.env.PORT || 80
		,websocket: process.env.PORT || 80
	}
	
	exports.facebook.authCallback = 'http://local.trovelist.com:8080/auth/facebook/callback'

	exports.mongo = {
		connect: 'localhost'
		,db: 'sex'
	}
// OpenShift //////////////////////////////////////////////////////////////////////////////////////
} else {
	exports.ip = process.env.OPENSHIFT_NODEJS_IP
	exports.port = {
		http: process.env.OPENSHIFT_NODEJS_PORT || 8080
		,websocket: 8000
	}

	exports.facebook.authCallback = 'http://trovelist.com/auth/facebook/callback'

	// default to a 'localhost' configuration:
	var connection_string = '127.0.0.1:27017/YOUR_APP_NAME';
	// if OPENSHIFT env variables are present, use the available connection info:
	if(process.env.OPENSHIFT_MONGODB_DB_PASSWORD){
		connection_string = process.env.OPENSHIFT_MONGODB_DB_USERNAME + ":" +
		process.env.OPENSHIFT_MONGODB_DB_PASSWORD + "@" +
		process.env.OPENSHIFT_MONGODB_DB_HOST + ':' +
		process.env.OPENSHIFT_MONGODB_DB_PORT + '/' +
		process.env.OPENSHIFT_APP_NAME;
	}
	
	exports.mongo = {
		connect: connection_string
	}
}
// ALL ////////////////////////////////////////////////////////////////////////////////////////////

//To be exposed to browser javascript
exports.public = {
	port: exports.port
}