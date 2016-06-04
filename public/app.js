/**
 * Created by odedvaltzer on 04/06/2016.
 */
var app = angular.module('sampleApp', ['ngRoute']);

app.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/', {
        templateUrl: '/index.html'
    });
}]);

app.factory('socket', ['$rootScope', function($rootScope) {
    var socket = io.connect();

    return {
        on: function(eventName, callback){
            socket.on(eventName, callback);
        },
        emit: function(eventName, data) {
            socket.emit(eventName, data);
        }
    };
}]);

app.controller('LoginController', function($scope, socket) {
    $scope.newUser = '';


    $scope.login = function() {
        socket.emit('add user', $scope.newUser);
    };

    socket.on('login', function(data) {
        $scope.$apply(function () {
            data.games.forEach(function(item, index){
                $scope.openGames.push(item)
            });
            console.log(data.games);
            $scope.status="games";
        });
    });
});

app.controller('MainController', function($scope){
    $scope.status = "login";
    $scope.openGames = [];
    $scope.currentGameUsers = [];
    $scope.currentUserTurn = '';
});

app.controller('GamesController', function($scope, socket){
    $scope.newGameName='';
    $scope.newGameAmount='';
    $scope.goToGame = function(name){
        $scope.currentGame = name;
        socket.emit('join', name);
    };
    socket.on('game state', function(data){
        $scope.$apply(function () {
            data.users.forEach(function(item, index){
                $scope.currentGameUsers.push(item);
            });
            $scope.currentUserTurn = data.currentPlayer;
            $scope.status="game";
        });
    });
    $scope.newGame=function (){
        socket.emit('join', $scope.newGameName, $scope.newGameAmount);
    };
    socket.on('new game', function(data){
        $scope.$apply(function () {
            $scope.currentGameUsers.push($scope.newName);
            $scope.status="game";
        });
    });

});

app.controller('GameController',function($scope, socket){
    $scope.newSentence="";
    socket.on('current player', function(data){
        $scope.$apply(function () {
            $scope.currentUserTurn = data.username;
        });
    });
    socket.on('your turn', function(data){
        $scope.$apply(function () {
            $scope.currentUserTurn = $scope.newUser;
            $scope.lastSentence = data.message;
            $scope.lastSentenceWriter = data.username;
        });
    });
    $scope.sendSentence = function(){
        $socket.emit('new sentence', $scope.newSentence);
    };
    socket.on('user joined', function(data){
        $scope.$apply(function () {
            $scope.currentGameUsers.push(date.username);
        });
    });

});