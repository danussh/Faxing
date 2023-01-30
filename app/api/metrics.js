var Register = require('prom-client').register;  
var Counter = require('prom-client').Counter;
var Summary = require('prom-client').Summary;  
var ResponseTime = require('response-time');
const logger = require('../../lib/logger');

var Gauge = require('prom-client').Gauge;

/**
 * A gauge to capture the execution of a function, API call or any kind of tasks
 */
module.exports.executionTime = new Gauge({
    name: 'execution_time_in_seconds', 
    help: 'Execution time',
    labelNames: ['taskName', 'status']
});

/**
 * A gauge to capture number of stuck faxes
 */
module.exports.noOfStuckFaxes = new Gauge({
    name: 'no_of_stuck_faxes',
    help: 'Number of stuck faxes',
    labelNames: ['type']
});

/**
 * A Prometheus counter that counts the invocations of the different HTTP verbs
 * e.g. a GET and a POST call will be counted as 2 different calls
 */
module.exports.numOfRequests = numOfRequests = new Counter({
    name: 'numOfRequests',
    help: 'Number of requests made',
    labelNames: ['method']
});

/**
 * A Prometheus counter that counts the invocations with different paths
 * e.g. /foo and /bar will be counted as 2 different paths
 */
module.exports.pathsTaken = pathsTaken = new Counter({  
    name: 'endpointName',
    help: 'Paths taken in the app',
    labelNames: ['endpoint']
});

/**
 * A Prometheus summary to record the HTTP method, path, response code and response time
 */
module.exports.responses = responses = new Summary({  
    name: 'responses',
    help: 'Response time in millis',
    labelNames: ['method', 'path', 'status']
});

/**
 * This funtion will start the collection of metrics and should be called from within in the main js file
 */
module.exports.startCollection = function () {  
    logger.debug(`Starting the collection of metrics`);
    logger.info(`The metrics are available on /metrics`);
    require('prom-client').collectDefaultMetrics();
};

/**
 * This function increments the counters that are executed on the request side of an invocation
 * Currently it increments the counters for numOfPaths and pathsTaken
 */
module.exports.requestCounters = function (req, res, next) {  
    if (req.path != '/metrics') {
        numOfRequests.inc({ method: req.method });
        var newPath = req.path.split("/")[1];
        pathsTaken.inc({ endpoint: newPath });
    }
    next();
}

/**
 * This function increments the counters that are executed on the response side of an invocation
 * Currently it updates the responses summary
 */
module.exports.responseCounters = ResponseTime(function (req, res, time) {  
    if(req.url != '/metrics') {

        responses.labels(req.method, req.url, res.statusCode).observe(time);
        
        var newPath = req.path.split("/")[1];
        responsesCounterPerInterval.inc({method: req.method, url: newPath, status: res.statusCode});
    }
})

/**
 * In order to have Prometheus get the data from this app a specific URL is registered
 */
module.exports.controller = function (App) {  
    App.get('/metrics', (req, res) => {
        res.set('Content-Type', Register.contentType);
        res.end(Register.metrics());
    });
};


/**
 * A Prometheus counter that counts the invocations of the different HTTP verbs
 * e.g. a GET and a POST call will be counted as 2 different calls
 */
module.exports.requestCountPerMethod = requestCountPerMethod = new Gauge({
    name:  'numOfRequestsPerInterval',
    help: 'Number of requests made',
    labelNames: ['method']
});

/**
 * A Prometheus metrics that counts the invocations with different paths
 * e.g. /foo and /bar will be counted as 2 different paths
 */
module.exports.requestCountPerEndPoint = requestCountPerEndPoint = new Gauge({  
    name: 'endpointNamePerInterval',
    help: 'Paths taken in the app',
    labelNames: ['endpoint']
});


/**
 * This function increments the metrics that are executed on the request side of an invocation
 * Currently it increments the metric for requestCountPerMethod and requestCountPerEndPoint
 */
 module.exports.requestCounterPerInterval = function (req, res, next) {  
    if (req.path != '/metrics') {
        requestCountPerMethod.inc({ method: req.method });
        var newPath = req.path.split("/")[1];
        requestCountPerEndPoint.inc({ endpoint: newPath });
    }
    next();
}

/**
 * A Prometheus guage that counts the invocations with different paths
 * e.g. /foo and /bar will be counted as 2 different paths
 */
module.exports.responsesCounterPerInterval = responsesCounterPerInterval = new Gauge({  
    name: 'responseCountPerInterval',
    help: 'Responses status for the endpoint',
    labelNames: ['method', 'url', 'status']
});

/**
 * A gauge to capture success and failure to MDP calls
 */
module.exports.mdpMonitoring = new Gauge({
    name: 'mdp_monitoring',
    help: 'Captures MDP call success and failure',
    labelNames: ['type']
});

