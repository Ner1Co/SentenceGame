# SentenceGame

The game is running on:
https://www.sentencegame.ml/

- Using Let's Encrypt certificate
- the POST request /kill will shutdown the server
- AWS Load Balancer is listening to the server state, if the status is unhealthy -> there is a Lambda that restarting the server. (2-3 min)
 
## Running the app locally
 - git clone https://github.com/Ner1Co/SentenceGame.git
 - npm install
 - node .
 - open localhost:3443 in the browser. Optionally, specify
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
