var socketio = require('socket.io'),
redis = require("redis"),S = require('string');;
var io;
var guestNumber = 1;
var nickNames = {};
var namesUsed = [];
var currentRoom = {};
var rooms  = {};
var nsp;
var session;

exports.listen = function(server,session) {
  io = socketio.listen(server);
  io.set('log level', 1);
  io.use(function(socket, next){
	  if(typeof socket.request.session == 'undefined'){
		  socket.request.session = {};
	  }
	  if (socket.request.headers.cookie) {
		  var cookies = socket.request.headers.cookie.split(";");
		  for(var i=0;i<cookies.length;i++){
			 var cookie_item = cookies[i];
			 var cookie = cookie_item.split("=");
			 if(S(cookie[0]).trim().s == 'PHPSESSID'){
				 socket.request.session.sid = S(cookie[1]).trim().s;
		     } 
		  }
	  }
	  return next();
  });
  
  io.use(function(socket, next){ 
	 return next();
     if(handleSession(socket))
        return next();
     else
        next(new Error('Authentication error'));
  });
  
  io.sockets.on('connection', function (socket) {
    guestNumber = assignGuestName(socket, guestNumber, nickNames, namesUsed);
    joinRoom(socket, 'Lobby');
    handleMessageBroadcasting(socket, nickNames);
    handleNameChangeAttempts(socket, nickNames, namesUsed);
    handleRoomJoining(socket);
  
    socket.on('rooms', function() {
         socket.emit('rooms', rooms);
    });
       
    handleClientDisconnection(socket, nickNames, namesUsed);
  }); 

};

function assignGuestName(socket, guestNumber, nickNames, namesUsed) {
  var name = 'Guest' + guestNumber;
  nickNames[socket.id] = name;
  socket.emit('nameResult', {
    success: true,
    name: name
  });
  namesUsed.push(name);
  return guestNumber + 1;
}

function joinRoom(socket, room) {
  socket.join(room);
  currentRoom[socket.id] = room;
  handleClientRooms(room,"in");
  socket.emit('joinResult', {room: room});
  socket.broadcast.to(room).emit('message', {
    text: nickNames[socket.id] + ' has joined ' + room + '.'
  });
  
  var clients_in_the_room = io.sockets.adapter.rooms[room]; 

  if (typeof clients_in_the_room !="undefined"  && Object.keys(clients_in_the_room).length > 1) {
    var usersInRoomSummary = 'Users currently in ' + room + ': ';
    for (var userSocketId in clients_in_the_room) {        
        usersInRoomSummary += nickNames[userSocketId] + ".";     
    }
  
    socket.emit('message', {text: usersInRoomSummary});
  }
}


function handleNameChangeAttempts(socket, nickNames, namesUsed) {
  socket.on('nameAttempt', function(name) {
    if (name.indexOf('Guest') == 0) {
      socket.emit('nameResult', {
        success: false,
        message: 'Names cannot begin with "Guest".'
      });
    } else {
      if (namesUsed.indexOf(name) == -1) {
        var previousName = nickNames[socket.id];
        var previousNameIndex = namesUsed.indexOf(previousName);
        namesUsed.push(name);
        nickNames[socket.id] = name;
        delete namesUsed[previousNameIndex];
        socket.emit('nameResult', {
          success: true,
          name: name
        });
        socket.broadcast.to(currentRoom[socket.id]).emit('message', {
          text: previousName + ' is now known as ' + name + '.'
        });
      } else {
        socket.emit('nameResult', {
          success: false,
          message: 'That name is already in use.'
        });
      }
    }
  });
}

function handleMessageBroadcasting(socket) {
	
  socket.on('message', function (message) {
	 if(!login(socket)) return false;
    socket.broadcast.to(message.room).emit('message', {
      text: nickNames[socket.id] + ': ' + message.text
    });
  });
}

function handleRoomJoining(socket) {
  socket.on('join', function(room) {
    socket.leave(currentRoom[socket.id]);
    handleClientRooms(currentRoom[socket.id],"out");
    joinRoom(socket, room.newRoom);
  });
}

function handleClientDisconnection(socket) {
  socket.on('disconnect', function() {
    var nameIndex = namesUsed.indexOf(nickNames[socket.id]);
    delete namesUsed[nameIndex];
    delete nickNames[socket.id];
   
    handleClientRooms(currentRoom[socket.id],"out");
  });
}

function handleClientRooms(room,act){ 
	if(act == "in"){
	  if(typeof rooms[room] != "undefined"){ 
	     rooms[room] = rooms[room] +1;
      }else{
	     rooms[room] =1;
      }
    }else if(act =="out"){
      if(typeof rooms[room] != "undefined" && rooms[room]>0){ 
	   rooms[room] = rooms[room] -1;
      }
	}
	
}

function handleSession(socket){
   var clientSession = new redis.createClient('192.168.56.16','6379');
    clientSession.on("error", function (error) {
        console.log("Error " + error);
        return false;
    });
    clientSession.get("sessions/"+socket.request.session.sid, function(error, result){
        if(!error && result.toString() != ""){
              console.log("result exist");
              console.log(result.toString());
              return true;          
		}
	   console.log("Error " + error);
       return false;
    });
}

function login(socket){
	if(!handleSession(socket)){
		socket.emit('auth_error', {text: "Authentication error"});
		socket.disconnect();
		return false;
	}
	return true;
}
