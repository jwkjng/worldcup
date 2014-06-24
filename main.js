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
    if (data.length > 0) {
      var match = data[0];
      var home = (typeof match.home_team.goals === 'undefined') ? null : match.home_team.goals;
      var away = (typeof match.away_team.goals === 'undefined') ? null : match.away_team.goals;

      updateScore(matchid, home, away, match.status === 'completed');
    }
  });
};

var updateScore = function (matchid, home, away, finished) {
  var $match = $("[data-id=" + matchid + "]");
  var $home = $match.find('.team-one');
  var $away = $match.find('.team-two');

  if (home !== null) {
    $home.find('.actual-score').html(home);
  }

  if (away !== null) {
    $away.find('.actual-score').html(away);
  }

  if (finished) {
    $home.find('.score').hide()
    $away.find('.score').hide();
    $match.find('button').css('visibility', 'hidden');
    if (home > away) {
      $home.addClass('winner');
    } else if (home < away) {
      $away.addClass('winner');
    }
  }
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
