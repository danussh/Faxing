/**
 * presignedurl.js
 * 
 * api controller for get /presignedurls endpoint
 * 
 * @purpose it gives s3 presigned url to download the fax for a given fax id
 * 
 * @used through ANet
 */
const response = require('../utils/response-handler');
const filemanagement = require('../utils/filemanagement');
const logger = require('../../lib/logger');
const config = require('../../lib/config');
const prometheus = require('./metrics');

const region = config.get('aws.region');
const s3bucketName = config.get(`aws.s3bucket.${region}`);

module.exports.controller = function (app) {
	app.get('/presignedurls/:key', async function (req, res) {
		var key = req.params.key;
		const endTimer = prometheus.executionTime.startTimer({ taskName: 'presignedurl' });
		logger.debug(`S3 key - ${key} | Received request to get presigned URL.`);
		try {
			// Check if the object exists in S3
			// This has a performance hit. It adds around 1.5s to each request.
			isFileExists = await filemanagement.headObject(s3bucketName, key);

			// Get the presigned URL if the object exists in the bucket
			preSignedUrl = await filemanagement.getPreSignedUrl(s3bucketName, key);
			response.successWithoutLog(res, { "PreSignedURL": preSignedUrl }, '200');
			endTimer({ status: 'SUCCESS' });
			logger.info(`S3 key - ${key} | Successfully obtained presigned URL.`);
		}
		catch (err) {
			logger.error(`S3 key - ${key} | Error occured while getting presigned URL. Error is : ${err}`);

			// If there is no object in S3 with the given key headObject will throw an error.
			if (/NotFound/.test(err)) {
				response.error(res, { message: "Requested object is not found in S3", status: 404 });
				endTimer({ status: 'NOTFOUND' });
			}
			else {
				response.error(res, { message: "Unable to get presigned url for key : " + key, status: 500 });
				endTimer({ status: 'FAILED' });
			}
		}
	});
};
