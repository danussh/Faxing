/**
 * healthcheck.js
 * 
 * api controller for get /healthcheck endpoint 
 * 
 * @purpose to check is app is up
 */
const response = require('../utils/response-handler');

module.exports.controller = function (app) {
  app.get('/healthcheck', function (req, res) {
    response.successWithoutLog(res, { "message": 'Faxing inbound service is up and running' }, '200');
  });
};
