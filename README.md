#World Cup 2014 Predictions
========

##What does it do?
Users can login and predict scores for each game. Scores of each game are live-updated and users earn points based-on the proximity of the score predictions.

##Point Calculation Rules
1. Exact score match: 20 points
2. Winning side + goal difference match: 8 points
3. Winning side + one-side score match: 5 points
4. Winning side match: 2 points

##How is it architected?
* koa.js web server
* socket.io for live user interactions
* world cup api for live score updates
