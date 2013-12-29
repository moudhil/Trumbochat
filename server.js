var http 	= require('http'),
	io		= require('socket.io'),
	md5		= require('MD5'),
	escape 	= require('escape-html');

httpServer = http.createServer(function(req, res){
	res.end('Connected');
});

httpServer.listen(1337);
io = io.listen(httpServer);


/**
 * Global vars
 */
var messages 		= [],
	messagesLimit	= 30,
	users 			= {},
	countUsers		= 0;

var urlMatcher		= /((http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?)/gim;


io.sockets.on('connection', function(socket){
	var user = false;


	for(var k in users)
		socket.emit('newusr', users[k]);

	for(var k in messages)
		socket.emit('newmsg', messages[k]);


	socket.on('login', function(userInfos){
		var md5Mail = md5(userInfos.email.toLowerCase()),
			error = null;

		if(user)
			return false;

		for(var k in users){
			if(k == md5Mail)
				error = "This email address was already used";
			else if(users[k].username.toLowerCase().trim() == userInfos.username.toLowerCase().trim())
				error = "This username already used";
		}

		if(error !== null){
			socket.emit('logerr', error);
		} else {
			user = {
				id 			: md5Mail,
				username 	: escape(userInfos.username),
				avatar 		: 'https://gravatar.com/avatar/' + md5Mail,
				dateConn	: new Date(),
				state 		: 'online'
			};

			users[user.id] = user;

			socket.emit('logged', {
				user		: user
			});

			io.sockets.emit('srvmsg', {
				time 		: getTime(),
				message		: '<i>' + user.username + '</i> join the room'
			});

			socket.broadcast.emit('newusr', user);
		}
	});

	socket.on('iswriting', function(writing){
		socket.broadcast.emit('iswriting', {
			user 	: user,
			writing : writing
		});
	});

	socket.on('chgState', function(state){
		user.state = state;
		
		if(users[user.id])
			users[user.id].state = state;

		socket.broadcast.emit('chgState', {
			user 	: user,
			state 	: state
		});
	});

	socket.on('newmsg', function(msg){
		if(/\S/.test(msg)){
			message = {
				user 	: user,
				time 	: getTime(),
				_time 	: (new Date()).getTime(),
				message : parseMessage(msg)
			};

			io.sockets.emit('newmsg', message);

			messages.push(message);
			if(messages.length > messagesLimit)
				messages.shift();
		}
	});

	socket.on('disconnect', function(){
		if(!user)
			return;

		delete users[user.id];

		io.sockets.emit('srvmsg', {
			time 	: getTime(),
			message	: '<i>' + user.username + '</i> has left'
		});

		io.sockets.emit('disusr', user);
	});
});


function getTime(){
	var date = new Date(),
		h = date.getHours(),
		m = date.getMinutes();

	return (h < 10 ? "0" : "") + h + ':' + (m < 10 ? "0" : "") + m;
}
function parseMessage(message){
	message = escape(message);

	message = message.replace(urlMatcher, '<a href="$1" target="_blank">$1</a>');

	return message;
}
