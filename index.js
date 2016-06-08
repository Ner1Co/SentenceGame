'use strict';

// Setup basic express server
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const socketioJwt = require('socketio-jwt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
var execSync = require('child_process').execSync;
const port = process.env.PORT || 3000;

var numUsers = 0;
var games = {};
var tokens = {};

const MIN_PLAYERS = 2;

class Game{
  constructor(roomName, maxSentences){
    this.fileName = './games/' + roomName + '.json';
    this.roomName = roomName;
    this.maxSentences = maxSentences;
    this.sockets = [];
    this.tokens = [];
    this.currentSocketIndex = -1;
    this.sentences = [];
    this.lastUsername = "";
    this.gameStartedTime = null;
    this.gameEndTime = null;
  }

  load(){
    var data = fs.readFileSync(this.fileName);

    var game = JSON.parse(data);
    this.roomName = game.roomName;
    this.maxSentences = game.maxSentences;
    this.tokens = game.tokens;
    this.currentSocketIndex = game.currentSocketIndex;
    this.sentences = game.sentences;
    this.gameStartedTime = game.gameStartedTime;
    this.gameEndTime = game.gameEndTime;
    this.lastUsername = game.lastUsername;
    this.sockets = new Array(game.tokens.length);

    setTimeout(() => { this.step() }, 5000);
  }

  save(){
    console.log("saving game...");
    var game = {
      roomName: this.roomName,
      maxSentences: this.maxSentences,
      tokens: this.tokens,
      currentSocketIndex: this.currentSocketIndex,
      sentences: this.sentences,
      lastUsername: this.lastUsername,
      gameStartedTime: this.gameStartedTime,
      gameEndTime: this.gameEndTime
    };

    fs.writeFile(this.fileName, JSON.stringify(game, null, 4), (err) =>{
      if(err){
        console.log(err);
      }
    })
  }

  addSocketAtIndex(i, socket){
    this.sockets[i] = socket.id;
    this.configSocket(socket);
  }

  addSocket(socket){
    this.tokens.push(socket.decoded_token.iat);
    this.sockets.push(socket.id);
    this.save();

    this.configSocket(socket);

    // echo to all client in the room that a person has connected
    socket.to(this.roomName).emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });

    //only for first two users
    if(!this.gameStartedTime){
      this.step();
    }
  }

  configSocket(socket){
    socket.join(this.roomName);

    // when the client emits 'new sentence', this listens and executes
    socket.on('new sentence',  data => {
      this.sentences.push(data);
      this.lastUsername = socket.username;
      this.save();
      this.step();
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', function () {
      socket.to(this.roomName).emit('typing', {
        username: socket.username
      });
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', function () {
      socket.to(this.roomName).emit('stop typing', {
        username: socket.username
      });
    });
  }

  removeSocket(socket){
    if(this.sockets.length == MIN_PLAYERS){
      this.end();
      return;
    }
    var i = this.sockets.indexOf(socket.id);
    if(i != -1) {
      this.tokens.splice(i, 1);
      this.sockets.splice(i, 1);
      if (this.currentSocketIndex > i){
        this.currentSocketIndex--;
        this.save();
      }

      else if (this.currentSocketIndex == i) {
        this.currentSocketIndex--;
        this.save();
        this.step();
      }
      // echo globally that this client has left
      socket.to(this.roomName).emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  }

  getNextSocket(){
    this.currentSocketIndex = (this.currentSocketIndex + 1) % this.sockets.length

    while(!this.sockets[this.currentSocketIndex] && this.sockets.length > 0){
      this.sockets.splice(this.currentSocketIndex, 1);
      this.tokens.splice(this.currentSocketIndex, 1);
    }
    if(this.sockets.length == 0)
      return undefined;
    return io.sockets.connected[this.sockets[this.currentSocketIndex]];
  }

  end(){
    this.gameEndTime = new Date();
    io.to(this.roomName).emit('game over', this.sentences);
    this.save();
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
      this.save();
    }

    let nextSocket = this.getNextSocket();
    if(!nextSocket) {
      this.end();
      return;
    }
    let lastMessage = this.sentences.length > 0 ? this.sentences[this.sentences.length - 1] : "You're first";
    nextSocket.emit('your turn', {message: lastMessage, username: this.lastUsername});

    // tell everyone who is the next player
    io.to(this.roomName).emit('current player', {
      username: nextSocket.username
    });
  }
}


function initData(){
  var files = fs.readdirSync("./games");
  files.forEach(filename => {
    var roomName = path.basename(filename, '.json');
    var game = new Game(roomName, 10);

    game.load();

    game.tokens.forEach((token, i) =>{
      tokens[token] = {roomName: roomName, index: i};
    });

    games[roomName] = game;
  });
}

initData();

server.listen(port, function () {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));

app.post('/login',(req, res) => {
  var profile = {};

  var token = jwt.sign(profile, 'johnsnow');

  res.json({token: token});
});

app.post('/kill', () => {
  console.log("Shutting down...");
  execSync("shutdown");
});

io.use(socketioJwt.authorize({
  secret: 'johnsnow',
  handshake: true
}));

io.on('connection', function (socket) {
  console.log('new connection to game ', socket.decoded_token);
  var addedUser = false;
  if(tokens[socket.decoded_token.iat]) {
    //var data = tokens[socket.decoded_token.iat];
    //games[data.roomName].addSocketAtIndex(data.index, socket);
    addedUser = true;
    //// when the user disconnects.. perform this
    //socket.on('disconnect', function () {
    //  console.log("diconnect");
    //  if (addedUser) {
    //    --numUsers;
    //    games[roomName].removeSocket(socket);
    //  }
    //});
  } else {
    socket.on('join', (data) => {
      var roomName = data.roomName;
      var maxSentences = data.maxSentences;
      //room name exists
      console.log(data,roomName)
      if(games[roomName]){
        games[roomName].addSocket(socket);

        let gameSockets = games[roomName].sockets;
        let currentUser = io.sockets.connected[gameSockets[games[roomName].currentSocketIndex]].username;
        let users = [];

        gameSockets.forEach(socketId => {
          users.push(io.sockets.connected[socketId].username)
        });

        io.to(socket.id).emit('game state', {
          users: users,
          currentPlayer: currentUser,
          startTime : games[roomName].gameStartedTime,
          endTime: games[roomName].gameEndTime
        });
      } else {
        console.log("User Create new game with name: "+roomName+" with max sentences: "+ maxSentences);
        var game = new Game(roomName, maxSentences);
        game.addSocket(socket);
        games[roomName] = game;

        io.emit('new game', {
          gameName: roomName
        });
      }

      // when the user disconnects.. perform this
      socket.on('disconnect', function () {
        console.log("diconnect");
        if (addedUser) {
          --numUsers;
          games[roomName].removeSocket(socket);
        }
      });
    });
  }


  // when the client emits 'add user', this listens and executes
  socket.on('add user', function (username) {
    if (addedUser) {
      var data = tokens[socket.decoded_token.iat];
      games[data.roomName].addSocketAtIndex(data.index, socket);
      //addedUser = true;
      // when the user disconnects.. perform this
      socket.on('disconnect', function () {
        console.log("diconnect");
        if (addedUser) {
          --numUsers;
          games[data.roomName].removeSocket(socket);
        }
      });
    }

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

