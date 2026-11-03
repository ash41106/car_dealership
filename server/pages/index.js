'use strict';
// Frontend entry: registers every page route. Called by server/server.js.
const pub = require('./public');
const staff = require('./staff');

function register(router) {
  pub.register(router);
  staff.register(router);
}
module.exports = { register };
