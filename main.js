var socket;
$(function () {
  init();
});

var init = function () {
  initSocket();
  updateScores();
  bindEvents();
  var matchids = $('.match-list .match').map(function () {
    return $(this).attr('data-id');
  }).get();

  for (var i = 0; i < matchids.length; i++) {
    var matchid = matchids[i];
    updateUserScores({matchid:matchid});
  }
};

var initSocket = function () {
  socket = io();
  socket.on('score:added', function (score) {
    updateUserScores(score);
  });
};

var bindEvents = function () {
  $('.match-list .match').delegate('button', 'click', function (e) {
    var $match = $(this).closest('.match');
    var $form = $(this).closest('form');

    $.post('/score', $form.serialize(), function (data) {
      socket.emit('score:added', data);
    });
    e.preventDefault();
  });
};

var updateScores = function () {
  var matchids = $('.match-list .match').map(function () {
    return $(this).attr('data-id');
  }).get();

  for (var i = 0; i < matchids.length; i++) {
    var matchid = matchids[i];
    getScore(matchid);
  }
};

var getScore = function (matchid) {
  var date = $('.match-date').text();
  var uri = '/scores/' + matchid + '/'  + date;

  $.get(uri, function (data) {
    if (data.div[2].div[2].div.div.length > 1) {
      updateScore(matchid, data.div[2].div[2].div.div[2].span.content);
    }
  });
};

var updateScore = function (matchid, score) {
  $("[data-id=" + matchid + "]").find('.match-score').html(score);
};

var updateUserScores = (function () {
  return function (score) {
    if (score === 'failure') return;
    var matchid = score.matchid;
    var $match = $('.match[data-id=' + matchid + ']');
    var $scores = $match.find('.scores');
    var url = '/users/' + matchid;
    $scores.empty();
    $.get(url, function (data) {
      getUserScore($scores, data);
    });
  };
})();

var getUserScore = function ($scores, data) {
  /*
  <li>
    <span class="user-name"></span>
    <span class="user-score"></span>
  </li>
  */
  for (var i = 0; i < data.length; i++) {
    var sc = data[i];
    var name = $('<span class="user-name">' + sc.name + '</span>');
    var score = $('<span class="user-score">' + sc.scoreA + ':' + sc.scoreB + '</span>');
    var li = $('<li></li>');
    li.append(name);
    li.append(score);
    $scores.append(li);
  }
};

var beginScoreLoop = function () {
  
};
