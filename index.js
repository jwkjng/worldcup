var koa = require('koa'),
    router = require('koa-router'),
    parser = require('koa-body'),
    session = require('koa-session'),
    fs = require('fs'),
    app = module.exports = koa(),
    path = require('path'),
    util = require('util'),
    _ = require('lodash'),
    thunkify = require('thunkify'),
    extname = path.extname,
    YQL = require('yql'),
    moment = require('moment'),
    jq = require('json-query'),
    ql = require('spahql'),
    render = require('co-render'),
    moment = require('moment'),
    scores = require('./scores'),
    request = require('co-request'),
    USERS = ['jason','jeff','chris','charles','jorgen','allen'],
    httpServer, io;

var streamFile = function *(next) {
  if (this.method !== 'GET') {
    yield next;
    return;
  }

  var page = !this.path || this.path === '/' ? 'index.html' : this.path;
  page = page.indexOf('.') < 0 ? page + '.html' : page;
  var pagePath = path.join(__dirname, page);
  var ext = extname(pagePath) == 'js' ? 'application/javascript' : extname(pagePath);
  this.type = extname(pagePath);
  this.body = fs.createReadStream(pagePath);
  yield next;
};

var streamStaticFile = function *(next) {
  if (this.method !== 'GET') {
    yield next;
    return;
  }

  var page = this.path;
  if (page.indexOf('.') < 0) {
    yield next;
    return;
  }
  var pagePath = path.join(__dirname, page);
  var ext = extname(pagePath) == 'js' ? 'application/javascript' : extname(pagePath);
  this.type = extname(pagePath);
  this.body = fs.createReadStream(pagePath);
  yield next;
};

var scrapeData = function (options, callback) {
  var url = 'http://www.fifa.com/worldcup/matches/index.html';
  var selector = '.match-list-date.anchor';
  var query = util.format(
    'select * from data.html.cssselect' +
    ' where url=@url and css=@css');
  var date = options.date;
  new YQL.exec(query, function (response) {
    // var results = response;
    var results;
    try {
      results = response.query.results.results;
    } catch (exc) {
      results = '';
      console.log('Exception:', exc);
    }
    // callback(null, results);

    var db = ql.db(results);
    var data = db.select("//*[/id == '" + date + "']");

    callback(null, data.value());
  }, {
    url: url,
    css: selector
  });
};

var getData = function *() {
  var result = yield request('http://worldcup.sfg.io/matches');

  return JSON.parse(result.body);
};

var scrapeDataThunk = thunkify(scrapeData);

// try GET /app.js
app.keys = ['h0m13Don7p14yTh4t'];
app.use(parser());
app.use(session());
app.use(router(app));

app.use(streamStaticFile);
app.get('/', streamFile);
app.post('/login', function *() {
  var username = this.request.body.username;

  if (USERS.indexOf(username.toLowerCase()) < 0) {
    this.redirect('/', { error: 'Invalid username'});
    return;
  }

  this.session.user = username;
  this.redirect('/cup');
});

var calculateUserPoints = function *(matchid) {
  var matches = yield getData();

  var filtered = [];
  var users;
  // match date is specified, so filter by date
  if (!!matchid) {
    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];
      if (match.match_number == matchid) {
        filtered.push(match);
      }
    }

    matches = filtered;
    users = yield scores.find({ matchid: matchid }).exec();
  } else {
    users = yield scores.find().exec();
  }

  var results = [];
  for (var i = 0, user; i < users.length; i++) {
    user = users[i];
    var points = calculatePoints(matches, user);

    results.push({
      user: user.name,
      points: points
    });
  }

  return results;
};

var calculatePoints = function (matches, user) {
  var filtered = matches.filter(function (m) {
    return m.match_number == user.matchid;
  });

  if (filtered.length <= 0) return 0;

  var match = filtered[0];
  var points = 0;
  var goalDiff = match.home_team.goals - match.away_team.goals;
  var userGoalDiff = user.scoreA - user.scoreB;
  var winner = getWinner(match.home_team.goals, match.away_team.goals);
  var userWinner = getWinner(user.scoreA, user.scoreB);

  if (match.home_team.goals == user.scoreA &&
    match.away_team.goals == user.scoreB) {
    // Exact match
    points = 20;
  } else if (winner == userWinner && goalDiff == userGoalDiff && winner != 0) {
    // Winning Side + Goal Difference match
    points = 8;
  } else if (winner == userWinner && winner != 0 &&
    (match.home_team.goals == user.scoreA ||
    match.away_team.goals == user.scoreB)) {
    // Winning Side + One-side score match
    points = 5;
  } else if (winner == userWinner) {
    // Winning-side match
    points = 2;
  }

  return points;
};

var getWinner = function (goalA, goalB) {
  var winner;
  var goalDiff = goalA - goalB;
  if (goalDiff > 0) {
    winner = 1;
  } else if (goalDiff < 0) {
    winner = -1;
  } else {
    winner = 0;
  }
  return winner;
}

var getAggregatePoints = function *() {
  var result = yield calculateUserPoints();
  var users = [];

  for (var i = 0, user; i < result.length; i++) {
    user = result[i];
    var found = users.find(function (u) {
      return u.user == user.user;
    });

    if (!!found) {
      found.points += user.points;
    } else {
      users.push({
        user: user.user,
        points: user.points
      });
    }
  }

  users.sort(function (a, b) {
    return b.points - a.points;
  });

  for (var i = 0, user; i < users.length; i++) {
    user = users[i];
    user.rank = i + 1;
  }

  return users;
}

app.get('/cup', function *(next) {
  if (!this.session.user) {
    this.redirect('/');
  }
  var user = this.session.user;
  var context, pageOptions;
  var pagePath = path.join(__dirname, 'cup.html');
  var momentDate = moment();//moment('2014-06-24');
  var date = momentDate.format('YYYYMMDD');
  var options = {
    // date: moment().format("YYYYMMDD")
    date: date
  };

  var data = yield getData();
  // var data = yield scrapeDataThunk(options);

  if (!data) {
    context = {
      user: user,
      data: {},
      matchDate: moment().format('MMMM DD YYYY')
    };
    pageOptions = _.extend(context, {
      engine: 'handlebars'
    });

    // this.body = data;
    this.body = yield render(pagePath, pageOptions);
    return;
  }

  var matches = [];
  for (var i = 0; i < data.length; i++) {
    var match = data[i];
    var matchdate = moment(match.datetime);
    if (momentDate.format('YYYYMMDD') == matchdate.format('YYYYMMDD')) {
      matches.push(match);
    }
  }

  var points = yield getAggregatePoints();

  context = {
    user: user,
    data: matches,
    matchDate: momentDate.format('MMMM DD YYYY'),
    prevDate: momentDate.subtract('days', 1).format('MMMM DD YYYY'),
    nextDate: momentDate.add('days', 2).format('MMMM DD YYYY'),
    points: points
  };
  pageOptions = _.extend(context, {
    engine: 'handlebars'
  });

  // this.body = matches;
  this.body = yield render(pagePath, pageOptions);
});

app.get('/cup/:date', function *(next) {
  if (!this.session.user) {
    this.redirect('/');
  }
  var user = this.session.user;
  var context, pageOptions;
  var pagePath = path.join(__dirname, 'cup.html');
  var momentDate = !!this.params.date ? moment(this.params.date) : moment();//moment('2014-06-24');
  var date = momentDate.format('YYYYMMDD');
  var options = {
    // date: moment().format("YYYYMMDD")
    date: date
  };

  var data = yield getData();
  // var data = yield scrapeDataThunk(options);

  if (!data) {
    context = {
      user: user,
      data: {},
      matchDate: moment().format('MMMM DD YYYY')
    };
    pageOptions = _.extend(context, {
      engine: 'handlebars'
    });

    // this.body = data;
    this.body = yield render(pagePath, pageOptions);
    return;
  }

  var matches = [];
  for (var i = 0; i < data.length; i++) {
    var match = data[i];
    var matchdate = moment(match.datetime);
    if (momentDate.format('YYYYMMDD') == matchdate.format('YYYYMMDD')) {
      matches.push(match);
    }
  }

  var points = yield getAggregatePoints();

  context = {
    user: user,
    data: matches,
    matchDate: momentDate.format('MMMM DD YYYY'),
    prevDate: momentDate.subtract('days', 1).format('MMMM DD YYYY'),
    nextDate: momentDate.add('days', 2).format('MMMM DD YYYY'),
    points: points
  };
  pageOptions = _.extend(context, {
    engine: 'handlebars'
  });

  // this.body = matches;
  this.body = yield render(pagePath, pageOptions);
});

app.post('/poll', function *(next) {
  var matchids = this.request.body.matchids;
  var date = this.request.body.date;

  for (var i = 0; i < matchids.length; i++) {
    var matchid = matchids[i];
    var result = yield request('/scores/' + matchid + '/' + date);
    io.emit('scores:update', JSON.parse(result.body));
  }

  yield next;
});

app.get('/scores/:matchid/:date', function *(next) {
  var matchid = this.params.matchid;
  var date = moment(this.params.date);
  var data = yield getData();
  var matches = [];

  for (var i = 0; i < data.length; i++) {
    var match = data[i];
    var matchdate = moment(match.datetime);

    if (date.format('YYYYMMDD') == matchdate.format('YYYYMMDD') &&
      match.match_number == matchid) {
      matches.push(match);
    }
  }

  this.body = matches;
});

app.post('/score', function *(next) {
  var matchid = this.request.body.matchid;
  var name = this.session.user;
  var scoreA = this.request.body.scoreA;
  var scoreB = this.request.body.scoreB;
  var date = this.request.body.date;
  var update = {
    matchid: matchid,
    scoreA: scoreA,
    scoreB: scoreB,
    date: date
  };

  var existing = yield scores.find({name: name,
    matchid: matchid}).exec();

  if (existing.length) {
    this.body = "failure";
    yield next;
    return;
  }

  yield scores.update({name: name,
    matchid: matchid},
    update, {upsert:true}).exec();

  this.type = 'application/json';
  this.body = update;

  yield next;
});

app.get('/users/:matchid', function *(next) {
  var matchid = this.params.matchid;
  var results = yield scores.find({ matchid: matchid }).exec();
  this.body = results;
  yield next;
});

app.get('/points/:matchid', function *(next) {
  var points = yield calculateUserPoints(this.params.matchid);

  this.body = points;
  yield next;
});

app.get('/points', function *(next) {
  var points = yield calculateUserPoints();

  this.body = points;
  yield next;
});

if (!module.parent) {
  httpServer = app.listen(80);
  io = require('socket.io')(httpServer);
  io.on('connection', function (socket) {
    socket.on('score:added', function (score) {
      io.emit('score:added', score);
    });
    socket.on('scores:update', function (data) {
      io.emit('scores:update', data);
    });
  });
}
