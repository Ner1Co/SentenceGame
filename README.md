# SentenceGame
 
 ## Running the app
 - git clone https://github.com/Ner1Co/SentenceGame.git
 - npm install
 - node .
 - open localhost:3000 in the browser. Optionally, specify
 a port by supplying the `PORT` env variable.
 
 ## Socket API
 ### From clients to the server
 - 'join' (roomName, maxSentences) - join to existing game or create a new one.
 - 'add user' (username) - tells the server that new user is logged in with a new name.
 - 'new sentence' (data) - add new sentence, only when it's your turn.
 - 'disconnect'
 - 'typing' / 'stop typing'
 
 ### From server to clients
 - 'login' (numUsers, games) - happened after client sent 'add user'. (for the logged in client)
 - 'user joined' / 'user left' (username, numUsers) - happened after client joined a room. (for all clients in the room)
 - 'new game' (gameName) - happened after new game is created (for everyone)
 - 'current player' - happened when the current player has changed  (for all clients in the room)
 - 'your turn' (message: lastMessage, username: lastUsername) - when is the client turn.
 - 'game over' (sentences: allSentences) - after the game is over (for all clients in the room)
 - 'game state' (users, currentPlayer, startTime, endTime) - happened after client entered to a game (only for the new client)
