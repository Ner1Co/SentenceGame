'use strict';

// Setup basic express server
const express = require('express');
const app = express();

/* Note: using staging server url, remove .testing() for production
 Using .testing() will overwrite the debug flag with true */
var LEX = require('letsencrypt-express');

var lex = LEX.create({
    configDir: '/home/ec2-user/letsencrypt/etc'
    , approveRegistration: function (hostname, cb) { // leave `null` to disable automatic registration
        // Note: this is the place to check your database to get the user associated with this domain
        cb(null, {
            domains: [hostname]
            , email: 'my@huji.com'
            , agreeTos: true
        });
    }
});

const server = require('https').createServer(lex.httpsOptions, LEX.createAcmeResponder(lex, app));
const io = require('socket.io')(server);
const socketioJwt = require('socketio-jwt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
var execSync = require('child_process').execSync;
const port = process.env.PORT || 3443;
var mongoose = require('mongoose');

var numUsers = 0;
var games = {};
var tokens = {};

const MIN_PLAYERS = 2;

class Game {
    constructor(roomName, maxSentences, onEnd) {
        this.fileName = './games/' + roomName + '.json';
        this._someId = new mongoose.Types.ObjectId;
        this.roomName = roomName;
        this.maxSentences = maxSentences;
        this.sockets = [];
        this.tokens = [];
        this.currentSocketIndex = -1;
        this.sentences = [];
        this.lastUsername = "";
        this.gameStartedTime = null;
        this.gameEndTime = null;
        this.saving = false;
        this.needSave = false;
        this.isActive = true;
        this.onEnd = onEnd;
        this.timer = null;
    }

    load(game) {
        //var data = fs.readFileSync(this.fileName);
        //
        //var game = JSON.parse(data);
        this.roomName = game.roomName;
        this.maxSentences = game.maxSentences;
        this.tokens = game.tokens;
        this.currentSocketIndex = game.currentSocketIndex;
        this.sentences = game.sentences;
        this.gameStartedTime = game.gameStartedTime;
        this.gameEndTime = game.gameEndTime;
        this.lastUsername = game.lastUsername;
        this.sockets = new Array(game.tokens.length);

        setTimeout(() => {
            this.step()
        }, 5000);
    }

    save() {
        console.log("this.saving1:" + this.saving);
        console.log("this.needSave1:" + this.needSave);
        if (!this.saving) {
            this.saving = true;
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
            var g = {};
            g.roomName = this.roomName;
            g.isActive = this.isActive;
            g._someId = this._someId;
            g.gameObj = game;
            GameModel.findOneAndUpdate({"_someId": this._someId}, g, {upsert: true},  (err, doc) => {
                if (!err) {
                    console.log("save success");
                    console.log(doc);
                    this.saving = false;
                    console.log("this.saving2:" + this.saving);
                    console.log("this.needSave2:" + this.needSave);
                    if (this.needSave){
                        this.needSave = false;
                        return this.save();
                    }
                } else {
                    console.log("save failed");
                    console.log(err);
                }
            });
        }else{
            this.needSave = true;
        }
    }

    addSocketAtIndex(i, socket) {
        this.sockets[i] = socket.id;
        this.configSocket(socket);
    }

    addSocket(socket) {
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
        if (!this.gameStartedTime) {
            this.step();
        }
    }

    configSocket(socket) {
        socket.join(this.roomName);

        // when the client emits 'new sentence', this listens and executes
        socket.on('new sentence', data => {
            this.sentences.push(data);
            this.lastUsername = socket.username;
            this.save();
            clearTimeout(this.timer);
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

    removeSocket(socket) {
        if (this.sockets.length == MIN_PLAYERS) {
            this.end();
            return;
        }
        var i = this.sockets.indexOf(socket.id);
        if (i != -1) {
            this.tokens.splice(i, 1);
            this.sockets.splice(i, 1);
            if (this.currentSocketIndex > i) {
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

    getNextSocket() {
        this.currentSocketIndex = (this.currentSocketIndex + 1) % this.sockets.length
        console.log(this.currentSocketIndex);
        while (!this.sockets[this.currentSocketIndex] && this.sockets.length > 0) {
            this.sockets.splice(this.currentSocketIndex, 1);
            this.tokens.splice(this.currentSocketIndex, 1);
            this.currentSocketIndex = (this.currentSocketIndex + 1) % this.sockets.length
        }
        console.log(this.currentSocketIndex);
        if (this.sockets.length == 0)
            return undefined;
        return io.sockets.connected[this.sockets[this.currentSocketIndex]];
    }

    end() {
        this.gameEndTime = new Date();
        io.to(this.roomName).emit('game over', this.sentences);
        this.isActive = false;
        this.onEnd(this.roomName);
        this.save();
        io.emit('game_ended_update', {gameName:this.roomName});
    }

    check() {
        console.log("check")
        var numOfUndefined = 0;
        this.sockets.forEach(socket =>{
            if(!socket) {
                numOfUndefined++;
            }
        });
        if(numOfUndefined == this.sockets.length) {
            return this.end();
        }
    }

    step() {
        if (this.gameEndTime) return;

        if (this.sockets.length < MIN_PLAYERS)
            return this.check();

        if (this.sentences.length == this.maxSentences) {
            return this.end();
        }
        if (!this.gameStartedTime) {
            this.gameStartedTime = new Date();
            this.save();
        }

        let nextSocket = this.getNextSocket();
        if (!nextSocket) {
            return this.end();
        }
        this.timer = setTimeout(()=>{this.step()}, 120*1000);
        let lastMessage = this.sentences.length > 0 ? this.sentences[this.sentences.length - 1] : "You're first";
        nextSocket.emit('your turn', {message: lastMessage, username: this.lastUsername});

        // tell everyone who is the next player
        io.to(this.roomName).emit('current player', {
            username: nextSocket.username
        });
    }
}


function initData() {
    //async db read
    GameModel.find({"isActive": true}, function (err, gamesFromDb) {
        if (err) {
            console.log(err);
            console.log("read error")
            console.log("Server won't start due to db errors, trying again");
            server.listen(port, function () {
                console.log('Server listening at port %d', port);
            })
        } else {
            console.log("read games in init - success")
            console.log(gamesFromDb);
            gamesFromDb.forEach(game => {
                var gameObj = new Game(game.roomName,0, (roomName)=>{delete games[roomName]});
                gameObj.isActive = game.isActive;
                gameObj._someId= game._someId;
                gameObj.load(game.gameObj);

                gameObj.tokens.forEach((token, i) =>{
                    tokens[token] = {roomName: game.roomName, index: i};
                });
                games[game.roomName] = gameObj;
            });
            server.listen(port, function () {
                console.log('Server listening at port %d', port);
            })
        }
    });
}
var GameModel;
mongoose.connect('mongodb://cloud_course:cloud_course@ds011664.mlab.com:11664/cloud_course', function (error) {
    if (error) {
        console.log(error);
    } else {
        require('./models');
        GameModel = mongoose.model('Game');
        initData();

    }
});

// Routing
app.use(express.static(__dirname + '/public'));

app.post('/login', (req, res) => {
    var profile = {};

    var token = jwt.sign(profile, 'johnsnow');

    res.json({token: token});
});

app.post('/kill', () => {
    console.log("Shutting down...");
    res.send("Shutting down...");
    execSync("sudo shutdown 0");
});

io.use(socketioJwt.authorize({
    secret: 'johnsnow',
    handshake: true
}));

io.on('connection', function (socket) {
    console.log('new connection to game ', socket.decoded_token);
    var addedUser = false;
    if (tokens[socket.decoded_token.iat]) {
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
            console.log(data, roomName)
            if (games[roomName]) {
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
                    startTime: games[roomName].gameStartedTime,
                    endTime: games[roomName].gameEndTime
                });
            } else {
                console.log("User Create new game with name: " + roomName + " with max sentences: " + maxSentences);
                var game = new Game(roomName, maxSentences, (roomName)=>{delete games[roomName]});
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
                    if (games[roomName]){
                        games[roomName].removeSocket(socket);
                    }
                }
            });
        });
    }


    // when the client emits 'add user', this listens and executes
    socket.on('add user', function (username) {
        let dup = false;
        for (let key in io.sockets.connected){
            if (io.sockets.connected[key].username === username){
                socket.emit("dupe_user",{});
                dup = true;
                return;
            }
        }
        if (dup) return;
        if (addedUser) {
            var data = tokens[socket.decoded_token.iat];
            games[data.roomName].addSocketAtIndex(data.index, socket);
            //addedUser = true;
            // when the user disconnects.. perform this
            socket.on('disconnect', function () {
                console.log("diconnect");
                if (addedUser) {
                    --numUsers;
                    if (games[data.roomName]){
                        games[data.roomName].removeSocket(socket);
                    }
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

