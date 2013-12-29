var socket 		= false;

try {
	socket 		= io.connect('http://localhost:1337');
} catch(err){
	$('#form-login form').remove();
	$('#form-login').append('<div class="tchat-login-form">\
		<h3 class="tchat-login-title tchat-login-title-middle">Server is Offline</h3>\
	</div>');
}



/**
 * Templating
 */
var msgTpl 		= $('#msg-tpl').html(),
	msgLineTpl 	= $('#msg-line-tpl').html(),
	srvMsgTpl 	= $('#srv-msg-tpl').html(),
	usrTpl 		= $('#usr-tpl').html(),
	usrStatusTpl= $('#usr-status-tpl').html();

$('#tchat-tpl').remove();





/** Vars */
var userInfos 		= false,
	firstLogged 	= true;
var users 			= {};
var writingTimeout 	= null,
	writingDate 	= (new Date()).getTime() - 5000,
	isWriting 		= false;
var lastMessage 	= false;
var hasFocus 		= true;
var nbMsgNotRead 	= 0;
var defaultTitle	= document.title;
var inactiveTime	= false,
	isInactive 		= false;





/**
 * Login events
 */
$('#tchat-connecting').remove();
$('#tchat-login-form').show();
if(localStorage && localStorage['username']){
	$('#login-username').val(localStorage['username']);
	$('#login-email').val(localStorage['email']);
}

function addEventLoginSubmit(){
	$('#form-login form').on('submit', function(e){
		$(this).off();
		e.preventDefault();

		onLoginSubmit();
	});
}
function onLoginSubmit(e){
	userInfos = {
		username : $('#login-username').val(),
		email	 : $('#login-email').val()
	};

	if(localStorage){
		localStorage['username'] 	= userInfos.username;
		localStorage['email']		= userInfos.email;
	}

	socket.emit('login', userInfos);
}
addEventLoginSubmit();

socket.on('logerr', function(message){
	$('#tchat-login-errors').text(message);
	addEventLoginSubmit();
});

socket.on('logged', function(data){
	$('#form-login').remove();
	$('#tchat').show();
	$('#tchat-message').focus();

	$('#logbox-avatar').attr('src', data.user.avatar + '?s=40');
	$('#logbox-username').empty().text(data.user.username);

	if(firstLogged)
		logged();
});

socket.on('newusr', function(user){
	$('#participants').append(Mustache.render(usrTpl, user));
	users[user.id] = user.username;
});

socket.on('disusr', function(user){
	$('#usr-' + user.id).remove();
	delete users[user.id];
});

$('#participants a').on('click', function(e){
	e.preventDefault();
	e.stopPropagation();
	return false;
});


function logged(){
	/**
 	 * Inactive time management
	 */
	function clearInactiveTime(){
		clearTimeout(inactiveTime);

		inactiveTime = setTimeout(function(){
			socket.emit('chgState', 'inactive');
			isInactive = true;
		}, 60000);

		if(isInactive){
			socket.emit('chgState', 'online');
		}
		isInactive = false;
	}
	clearInactiveTime();


	/**
	 * Writing events
	 */
	$('#tchat-message').on('keydown', function(){
		curTime = (new Date).getTime();
		if(writingDate && writingDate + 4500 < curTime){
			setWriting(true);
			writingDate = curTime;
		} else {
			clearTimeout(writingTimeout);
			clearInactiveTime();
		}

		
		writingTimeout = setTimeout(function(){
			setWriting(false);
		}, 5000);
	});
	$('#tchat-message').on('blur', function(){
		setWriting(false);
	});

	function setWriting(writing){
		clearTimeout(writingTimeout);
		clearInactiveTime();

		if(isWriting === writing)
			return;
		else if(writing == false)
			writingDate = (new Date).getTime() - 5000;
		
		isWriting = writing;

		if(socket.socket.connected)
			socket.emit('iswriting', writing);
	}





	/**
	 * Messages events
	 */
	$('#form-tchat').on('submit', function(e){
		e.preventDefault();

		if(!socket.socket.connected)
			return false;

		clearInactiveTime();

		if(/\S/.test($('#tchat-message').val())){
			socket.emit('newmsg', $('#tchat-message').val());

			$('#tchat-message').val('').focus();

			setWriting(false);
		}
	});
	/**
	 * Username TAB autocomplete
	 */
	$('#form-tchat').on('keydown', function(e){
		var keyCode = e.keyCode || e.which;
		var $input 	= $('#tchat-message');

		if(keyCode == 9){
			e.preventDefault();

			var begin 	= getCurrentWord($input),
				regexp  = new RegExp('^' + begin, 'gi');

			if(begin.length <= 0)
				return;

			for(id in users){
				if(regexp.test(users[id])){
					var cursorPos = $input.prop('selectionStart'),
	                	v = $input.val();
	                var textBefore = v.substring(0, cursorPos-begin.length),
	                	textAfter  = v.substring(cursorPos, v.length);

	                if(textAfter === '')
	                	textAfter = ' ';

	                $input.val(textBefore + users[id] + textAfter);

	                var newPos = cursorPos - begin.length + users[id].length + 1;
	                $input.prop('selectionStart', newPos);
	                $input.prop('selectionEnd', newPos);

					return;
				}
			}
		}
	});




	/**
	 * Disconnect from server
	 */
	socket.on('disconnect', function(){
		$('#participants').empty();

		newStatusMsg({
			message : 'Disconnected from server, trying to reconnect...',
			time 	: getTime()
		});

		socket.socket.connect();

		if(userInfos)
			socket.emit('login', userInfos);
	});



	firstLogged = false;
}





/**
 * Users messages
 */ 
socket.on('newmsg', function(msg){
	if(lastMessage && lastMessage.userId === msg.user.id && lastMessage.time > (msg._time - 300000))
		$('#tchat-msgs .tchat-message:last .tchat-message-content').append(Mustache.render(msgLineTpl, msg));
	else
		$('#tchat-msgs').append(Mustache.render(msgTpl, msg));

	adjustScroll();

	lastMessage = {
		userId 	: msg.user.id,
		time 	: msg._time
	};

	if(!hasFocus)
		increaseNotRead();
});

// Server Messages
socket.on('srvmsg', function(msg){
	newStatusMsg(msg);
});

function newStatusMsg(msg){
	$('#tchat-msgs').append(Mustache.render(srvMsgTpl, msg));
	adjustScroll();
	lastMessage = false;
}

function adjustScroll(){
	$scrollDiv = $('#tchat-msgs').parents('.tchat-container:visible');
	$scrollDiv.stop().animate({scrollTop : $scrollDiv.prop('scrollHeight') }, 500);
}

function increaseNotRead(){
	nbMsgNotRead++;
	document.title = '(' + nbMsgNotRead + ') ' + defaultTitle;
}
function resetNotRead(){
	nbMsgNotRead = 0;
	document.title = defaultTitle + ' ';
}





/**
 * Reading/writing status
 */
socket.on('iswriting', function(data){
	updateUserStatus(data);
});
function updateUserStatus(data){
	$('#tchat-usr-status-' + data.user.id).remove();
	$('#tchat-msgs').append(Mustache.render(usrStatusTpl, {
		user 	: data.user,
		writing : data.writing ? ' tchat-usr-iswriting' : ''
	}));
	adjustScroll();
}






/**
 * Focus events
 */
$(window).on('focus', function(){
	changeFocus(true);
	setTimeout(function(){
		if($('#form-login').length > 0)
			$('#login-username').focus();
		else
			$('#tchat-message').focus();
	}, 20);
});
$(window).on('blur', function(){
	changeFocus(false);
});
function changeFocus(focus){
	if(hasFocus === focus)
		return;

	hasFocus = focus;

	if($('#form-login').length == 0)
		socket.emit('chgState', hasFocus ? 'online' : '');

	if(focus)
		resetNotRead();
}

socket.on('chgState', function(data){
	$('#usr-' + data.user.id + ' a').removeAttr('class').addClass(data.state);

	var focusClass = data.state == 'online' ? 'tchat-usr-focus' : 'tchat-usr-notfocus';
	$('#tchat-usr-status-' + data.user.id).removeClass('tchat-usr-focus tchat-usr-notfocus').addClass(focusClass);

	if(data.state == 'online')
		updateUserStatus({
			user 	: data.user,
			writing : false
		});
});




function getTime(){
	var date = new Date(),
		h = date.getHours(),
		m = date.getMinutes();

	return (h < 10 ? "0" : "") + h + ':' + (m < 10 ? "0" : "") + m;
}


function getCurrentWord($elem) {
	var ctrl 		= $elem[0];
	var text 		= ctrl.value;
	var caretPos 	= 0;   // IE Support
    if (document.selection) {
        ctrl.focus();
        var Sel = document.selection.createRange();
        Sel.moveStart('character', -ctrl.value.length);
        caretPos = Sel.text.length;
    }
    // Firefox support
    else if (ctrl.selectionStart || ctrl.selectionStart == '0')
        caretPos = ctrl.selectionStart;

    caretPos = (caretPos);



    var index 	= text.indexOf(caretPos),
    	preText = text.substring(0, caretPos);

    if(preText.indexOf(" ") > 0) {
        var words = preText.split(" ");
        return words[words.length - 1]; //return last word
    } else {
        return preText;
    }
}