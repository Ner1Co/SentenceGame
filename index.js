'use strict';

// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;

server.listen(port, function () {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));

// Chatroom

var numUsers = 0;
var games = {};

io.on('connection', function (socket) {
  var addedUser = false;

  socket.on('join', (roomName, maxSentences) => {

    //room name exists
    if(games[roomName]){
      games[roomName].addSocket(socket);
    } else {
      var game = new Game(roomName, maxSentences);
      game.addSocket(socket);
      games[roomName] = game;

      socket.emit('new game', {
        gameName: roomName
      });
    }

    socket.join(roomName);

    // echo to all client in the room that a person has connected
    socket.to(roomName).emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', function () {
      socket.to(roomName).emit('typing', {
        username: socket.username
      });
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', function () {
      socket.to(roomName).emit('stop typing', {
        username: socket.username
      });
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function () {
      if (addedUser) {
        --numUsers;
        games[roomName].removeSocket(socket);
        // echo globally that this client has left
        socket.to(roomName).emit('user left', {
          username: socket.username,
          numUsers: numUsers
        });
      }
    });

  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', function (username) {
    if (addedUser) return;

    // we store the username in the socket session for this client
    socket.username = username;
    ++numUsers;
    addedUser = true;

    socket.emit('login', {
      numUsers: numUsers,
      games: Object.keys(games)
    });
  });
});

const MIN_PLAYERS = 2;

class Game{
  constructor(roomName, maxSentences){
    this.roomName = roomName;
    this.maxSentences = maxSentences;
    this.sockets = [];
    this.currentSocketIndex = -1;
    this.sentences = [];
    this.gameStartedTime = null;
    this.gameEndTime = null;
  }

  addSocket(socket){
    this.sockets.push(socket.id);

    // when the client emits 'new sentence', this listens and executes
    socket.on('new sentence',  data => {
      this.sentences.push(data);
      this.step();
    });

    //only for first two users
    if(!this.gameStartedTime){
      this.step();
    }
  }

  removeSocket(socket){
    if(this.sockets.length == MIN_PLAYERS){
      this.end();
      return;
    }
    var i = this.sockets.indexOf(socket.id);
    if(i != -1) {
      this.sockets.splice(i, 1);
      if (this.currentSocketIndex > i)
        this.currentSocketIndex--;
      else if (this.currentSocketIndex == i) {
        this.currentSocketIndex--;
        this.step();
      }
    }
  }

  getNextSocket(){
    this.currentSocketIndex = (this.currentSocketIndex + 1) % this.sockets.length;
    return io.sockets.connected[this.sockets[this.currentSocketIndex]];
  }

  step(){
    if(this.gameEndTime) return;
    if(this.sockets.length < MIN_PLAYERS) return;

    if(this.sentences.length == this.maxSentences) {
      this.end();
      return;
    }
    if(!this.gameStartedTime){
      this.gameStartedTime = new Date();
    }

    let lastSocket = io.sockets.connected[this.sockets[this.currentSocketIndex]];
    let nextSocket = this.getNextSocket();
    let lastMessage = this.sentences.length > 0 ? this.sentences[this.sentences.length - 1] : "You're first";
    nextSocket.emit('your turn', {message: lastMessage, username: lastSocket ? lastSocket.username : ""});

    // tell everyone who is the next player
    io.to(this.roomName).emit('current player', {
      username: nextSocket.username
    });
  }

  end(){
    this.gameEndTime = new Date();
    io.to(this.roomName).emit('game over', this.sentences);
  }
}
