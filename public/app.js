/**
 * Created by odedvaltzer on 04/06/2016.
 */
var app = angular.module('sampleApp', ['ngRoute']);

app.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
        templateUrl: '/index.html'
    });
}]);

app.factory('socket', ['$rootScope', '$http', function ($rootScope, $http) {
    var socket, token;
    var emitQ = [], onQ = [];

    $http({
        method: 'POST',
        url: '/login'
    }).then(function successCallback(response) {
        socket = io.connect({ forceNew: true , 'query': 'token=' + response.data.token});
        if(onQ){
            onQ.forEach(function(item){
                socket.on(item.eventName, item.callback);
            })
        }

        if(emitQ){
            emitQ.forEach(function(item){
                socket.emit(item.eventName, item.data);
            })
        }

        socket.on("error", function(error) {
            if (error.type == "UnauthorizedError" || error.code == "invalid_token") {
                // redirect user to login page perhaps?
                console.log("User's token has expired");
            }
        });



    }, function errorCallback(response) {});

    return {
        on: function (eventName, callback) {
            if(!socket)
                onQ.push({eventName: eventName, callback: callback});
            else
                socket.on(eventName, callback);
        },
        emit: function (eventName, data) {
            if(!socket)
                emitQ.push({eventName: eventName, data: data});
            else
                socket.emit(eventName, data);
        }
    };
}]);

app.controller('LoginController', function ($scope, socket) {

});

function socketConfig(socket){

}

app.controller('MainController', function ($scope, socket) {

    $scope.openGames = [];
    $scope.currentGameUsers = [];
    $scope.currentUserTurn = '';
    $scope.noServer = false;
    //##########################################login data ##########################################

    $scope.newUser = '';
    $scope.status = 'login';
    $scope.gameEnd = true;
    $scope.sentences = [];
    $scope.msgs = [];

    $scope.login = function () {
        if ($scope.newUser!==''){
            socket.emit('add user', $scope.newUser);
        }else{
            alert("Please enter a valid name");
        }

    };
    socket.on('dupe_user', function(data){
       alert("User name already taken, please pick another one");
    });
    socket.on('connect', function() {
        $scope.noServer = false;
        if ($scope.newUser!==''){
            socket.emit('add user', $scope.newUser);
        }
        console.log("Connected");
    });

    socket.on('login', function (data) {
        console.log("######### LOG:login #########");
        console.log(data);
        console.log("######### END LOG:login #########");
        $scope.$apply(function () {
            if ($scope.status != 'game')
                $scope.status = 'games';
            $scope.openGames = [];
            data.games.forEach(function (item, index) {
                $scope.openGames.push(item)
            });
        });
    });


    //########################################## games section data ##########################################
    $scope.newGameName = '';
    $scope.newGameAmount = '';
    $scope.goToGame = function (name) {
        $scope.currentGame = name;
        $scope.newGameName = "";
        $scope.newGameAmount= "";
        socket.emit('join', {roomName: name});
    };
    socket.on('game state', function (data) {
        console.log("######### LOG:game state #########");
        console.log(data);
        console.log("######### END LOG:game state #########");
        $scope.$apply(function () {
            data.users.forEach(function (item, index) {
                $scope.currentGameUsers.push(item);
            });
            $scope.currentUserTurn = data.currentPlayer;
            $scope.status = "game";
            $scope.gameEnd = false;
        });
    });
    $scope.newGame = function () {
        if ($scope.newGameName != '' && $scope.newGameAmount === parseInt($scope.newGameAmount, 10) && $scope.newGameAmount > 0) {
            socket.emit('join',
                {
                    roomName: $scope.newGameName,
                    maxSentences: parseInt($scope.newGameAmount)
                });
        }
    };
    socket.on('new game', function (data) {
        console.log("######### LOG:new game #########");
        console.log(data);
        console.log("######### END LOG:new game #########");
        $scope.$apply(function () {
            $scope.openGames.push(data.gameName);
            if (data.gameName == $scope.newGameName) {
                $scope.currentGameUsers.push($scope.newUser);
                $scope.status = "game";
                $scope.currentGame = data.gameName;
                $scope.gameEnd = false;
                $scope.newGameName = "";
                $scope.newGameAmount= "";
            }
        });
    });
    socket.on('game_ended_update', function(data){
        $scope.$apply(function () {
            console.log("ODED")
            console.log(data.gameName);
            let itemp = $scope.openGames.indexOf(data.gameName);
            $scope.openGames.splice(itemp,1);
        });
    });

    //########################################## game room data ##########################################
    $scope.newSentence = "";
    socket.on('current player', function (data) {
        console.log("######### LOG:current player #########");
        console.log(data);
        console.log("######### END LOG:current player #########");
        $scope.$apply(function () {
            $scope.currentUserTurn = data.username;
        });
    });
    socket.on('your turn', function (data) {
        console.log("######### LOG:your turn #########");
        console.log(data);
        console.log("######### END LOG:your turn #########");
        $scope.$apply(function () {
            $scope.currentUserTurn = $scope.newUser;
            $scope.lastSentence = data.message;
            $scope.lastSentenceWriter = data.username;
        });
    });
    $scope.sendSentence = function () {
        socket.emit('new sentence', $scope.newSentence);
        $scope.newSentence=''
    };
    socket.on('user joined', function (data) {
        console.log("######### LOG:user joined #########");
        console.log(data);
        console.log("######### END LOG:user joined #########");
        $scope.$apply(function () {
            $scope.msgs.push("We have a new player in the game! Welcome " + data.username);
            $scope.currentGameUsers.push(data.username);
        });
    });
    socket.on('user left', function (data) {
        $scope.$apply(function () {
            var index = $scope.currentGameUsers.indexOf(data.username);
            if (index > -1) {
                $scope.currentGameUsers.splice(index, 1);
                $scope.msgs.push("Wah Wah Wah, " + data.username + "has left the game!");

            }
        });

    });
    socket.on('game over', function (data) {
        $scope.$apply(function () {
            data.forEach(function (item, index) {
                $scope.sentences.push(item)
            });
            $scope.gameEnd = true;
            $scope.msgs.push("The game ended!");
        });

    });
    $scope.backToGames = function () {
        $scope.status = "games";
        $scope.currentGameUsers = [];
    };
    socket.on('reconnect_error',function(){
        //console.log($scope.currentUserTurn === $scope.newUser && !$scope.gameEnd);
        if ($scope.currentUserTurn === $scope.newUser && !$scope.gameEnd){
            $scope.$apply(function () {
                console.log("asdasdasd")
                $scope.noServer = true;
            });
        }
    })

});

app.controller('GamesController', function ($scope, socket) {

});

app.controller('GameController', function ($scope, socket) {


});