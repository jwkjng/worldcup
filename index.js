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
    USERS = ['jason','jeff','chris','charles','jorgen'],
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

app.get('/cup', function *(next) {
  if (!this.session.user) {
    this.redirect('/');
  }
  var context, pageOptions;
  var pagePath = path.join(__dirname, 'cup.html');
  var momentDate = moment();//moment('2014-06-22');
  var date = momentDate.format('YYYYMMDD');
  var options = {
    // date: moment().format("YYYYMMDD")
    date: date
  };

  var data = yield getData();
  // var data = yield scrapeDataThunk(options);

  if (!data) {
    context = {
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

  context = {
    data: matches,
    matchDate: momentDate.format('MMMM DD YYYY')
  };
  pageOptions = _.extend(context, {
    engine: 'handlebars'
  });

  // this.body = matches;
  this.body = yield render(pagePath, pageOptions);
});

app.get('/poll', function *(next) {
  var options = {
    date: moment().format("YYYYMMDD")
  };

  var data = yield scrapeDataThunk(options);
  data = data.div;
  data.splice(0, 1);

  var re = /\/worldcup\/matches\/round=\d+\/match=(\d+)\/[^"]*/ig;
  data = JSON.stringify(data).replace(re, '$1');
  data = JSON.parse(data);

  this.body = data;
});

app.get('/scores/:matchid/:date', function *(next) {
  var matchid = this.params.matchid;
  var date = moment(this.params.date);
  var pagePath = path.join(__dirname, 'cup.html');

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



if (!module.parent) {
  httpServer = app.listen(3000);
  io = require('socket.io')(httpServer);
  io.on('connection', function (socket) {
    socket.on('score:added', function (score) {
      io.emit('score:added', score);
    });
  });
}
