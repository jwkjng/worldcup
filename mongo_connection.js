'use strict';

//var request = require('koa-request');
var mongoose = require('mongoose');
mongoose.connect('mongodb://root@127.0.0.1/wc');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error.'));

module.exports = {
	mongoose: mongoose,
	db: db
};
