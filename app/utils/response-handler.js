const logger = require('../../lib/logger');

function success(res, obj, status = 200) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  if (status === 204) {
    res.send();
  }
  else {
    logger.info("Response send is " + JSON.stringify(obj));
    res.send(JSON.stringify(obj));
  }
}

function successWithoutLog(res, obj, status = 200) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  if (status === 204) {
    res.send();
  }
  else {
    res.send(JSON.stringify(obj));
  }
}

function error(res, err) {
  let status = err.status || 500;
  let message = err.message || 'Error occurred';
  let description = err.description || '';
  let logMessage = err.logMessage || '';
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  logger.error(`Error: ${logMessage} Response -  ${JSON.stringify(err)}`);
  res.send(JSON.stringify({ message: message, description: description }));
}

module.exports = {
  success,
  successWithoutLog,
  error,
};
