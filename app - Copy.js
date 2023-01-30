'use strict';
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');


const express = require('express');
const expressLogger = require('@athena/app-fabric-express-logger');

const swagger = require('swagger-tools');
const YAML = require('js-yaml');

// Local includes
const config = require('./lib/config');
const logger = require('./lib/logger');
const saeLogger = require('./lib/saeLogger');
const prometheus = require('./app/api/metrics');
const cronschedule = require('./app/utils/reprocessstuckfaxes');
const fileuploadtrigger = require('./app/utils/fileuploadtrigger');
const Persistence = require('./persistence/migration');
const accessToken = require('./app/utils/access-token');

/**
* Initializes the main express application. Registers app-wide
* middleware.
*
* @returns {Promise} A promise that resolves to the main express app.
*/
// Create our default app.
const app = express();

const swaggerPath = path.join(__dirname, 'app', 'api', 'swagger', 'swagger.yaml');
const swaggerSpec = YAML.safeLoad(fs.readFileSync(swaggerPath, 'utf8'));

const swaggerInit = new Promise((resolve) => {
  swagger.initializeMiddleware(swaggerSpec, mw => {
    resolve(mw);
  });
});

//const includeStackTrace = config.get('errors.includeStackTrace');

const createTable = config.get('postgres.createTable');

swaggerInit.then(mw => {
  // Register access log handler
  app.use(expressLogger.logger({
    logger: logger,
    addDefaultMetadata: true,
    ignoreRoute(req) {
      return ((req.method === 'GET') && (req.url === '/healthcheck'));
    },
  }));

  app.use(mw.swaggerMetadata());
  app.use(mw.swaggerValidator());
  app.use(mw.swaggerUi());

  app.use(bodyParser.json());
  app.use(bodyParser.text());

  app.use(prometheus.requestCounters);
  app.use(prometheus.responseCounters);
  // Adding new Prometheus metrics function which resets it value every 5 minutes
  app.use(prometheus.requestCounterPerInterval);

  if (createTable) {
    Persistence.initializeDBAndApplyMigrations().catch(error => {
      logger.error('DB migration failed : ' + error.message);
    });
  }
  accessToken.loadTokenManager();
  
  fs.readdirSync('./app/api').forEach(function(file) {
    if (file.substr(-3) === '.js') {
      const route1 = require('./app/api/' + file); // eslint-disable-line global-require
      route1.controller(app);
    }
  });

  // Register error log handler
  app.use(expressLogger.errorLogger({
    logger: logger,
    addDefaultMetadata: true,
    ignoreRoute(req) {
      return ((req.method === 'GET') && (req.url === '/healthcheck'));
    },
  }));

  // Register 404 handler.
  app.use((req, res) => {
    res.status(404).end();
  });

  //prometheus.injectMetricsRoute(app);

  prometheus.startCollection();

  app.use((err, req, res, next) => {
    res.status(500);
    res.json({
      message: err.message,
    });
    next(err);
  });

  // Scheduling cron for handling stuck faxes
  cronschedule.start();
  
  //Starting SQS Consumer
  fileuploadtrigger.listen();

  saeLogger('Service Started');

});

// Event 'SIGINT' - Add SAE log and exit
process.on('SIGINT', function () {
  saeLogger('Service Terminating');
  process.exit(0);
});

module.exports = app;






