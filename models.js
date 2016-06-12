/**
 * Created by odedvaltzer on 11/06/2016.
 */

// grab the things we need
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// create a schema
var gameSchema = new Schema({
    gameObj: Schema.Types.Mixed
});

// the schema is useless so far
// we need to create a model using it
var Game = mongoose.model('Game', gameSchema);

