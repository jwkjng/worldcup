var mongoose = require('./mongo_connection').mongoose;

var schema = mongoose.Schema(
		{
			name: String,
			matchid: String,
			scoreA: Number,
			scoreB: Number,
			date: Date
		}
	);

var Models = mongoose.model('scores', schema);

module.exports = Models;
