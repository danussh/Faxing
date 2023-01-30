/**
 * inbound.js
 * 
 * api controller for post /inboundfaxes endpoint
 * 
 * @purpose it is used by vendors to post fax metadata and 
 * get presigned url to upload file to s3
 * 
 * @used by vendors
 */
const response = require('../utils/response-handler');
const validateUtil = require('../utils/validate');
const metaDataModel = require('../models/basemodel');
const mappings = require('../utils/mappings.json');
const logger = require('../../lib/logger');
const saeLogger = require('../../lib/saeLogger');
const filemanagement = require('../utils/filemanagement');
const prometheus = require('../api/metrics');
const config = require('../../lib/config');

// Packages for parsing multi-form metadata.
const Busboy = require('busboy');
var uuidv4 = require('uuid/v4');

const region = config.get('aws.region');
const s3bucketName = config.get(`aws.s3bucket.${region}`);

module.exports.controller = function (app) {
	app.post('/inboundfaxes', function (req, res) {
		let busboy = new Busboy({ headers: req.headers });
		let formdata = { faxId: uuidv4() };

		// Parsing multipart/form-data.
		busboy.on('field', function (fieldname, val) {
			formdata[mappings[fieldname]] = val.trim();
		});
		busboy.on('finish', async function () {
			let vendorName = formdata['vendorName'];
			try {
				logger.info(`Vendor: ${vendorName} | Vendor Fax ID: ${formdata['vendorFaxId']}`);

				//Validating API secret key.
				logger.debug(`Vendor Fax ID: ${formdata['vendorFaxId']} | Validating the secret key.`);
				await validateUtil.validateAPIKey(req.header("secretKey"), vendorName);
				logger.debug(`Vendor Fax ID: ${formdata['vendorFaxId']} | Secret key validated.`);

				validateUtil.validateAndRectifyFields(formdata);
				logger.debug(`Vendor Fax ID: ${formdata['vendorFaxId']} | Parameter validation done.`);

				const endTimer = prometheus.executionTime.startTimer({ taskName: 'storeMetaData' })
				// Store in DB.
				logger.debug("Metadata received from vendor's request - %j",formdata);
				logger.debug(`Vendor Fax ID: ${formdata['vendorFaxId']} | Going to store the metadata.`);
				await metaDataModel.storeFaxMetadata(formdata);
				logger.info(`Vendor Fax ID: ${formdata['vendorFaxId']} | Athena Fax ID: ${formdata['faxId']} | Metadata stored.`);
				//Capture execution time
				endTimer({ status: 'SUCCESS' });

				var metadata = {
					faxId: formdata['faxId'],
					vendorFaxId: formdata['vendorFaxId'],
					vendorName: vendorName,
				};
				//Get presigned URL
				logger.debug(`Athena Fax ID: ${formdata['faxId']} | Generating pre-signed URL from S3 Bucket ${s3bucketName}.`);
				preSignedUrl = await filemanagement.getPreSignedUrlForAFile(s3bucketName, formdata['faxId'], metadata);
				logger.debug(`Athena Fax ID: ${formdata['faxId']} | Pre-signed URL generated.`);
				response.successWithoutLog(res, { faxId: formdata['faxId'], preSignedUrl: preSignedUrl, message: "Metadata successfully received." }, '200');
			} catch (err) {
				logger.error(`${vendorName} | Vendor Fax ID: ${formdata['vendorFaxId']} | Athena Fax ID: ${formdata['faxId']} | Error while generating pre-signed URL. Error - ${err}`);
				saeLogger(`Vendor: ${vendorName} Vendor Fax ID: ${formdata['vendorFaxId']} Athena Fax ID: ${formdata['faxId']} Error from /inboundfaxes end point - ` + err.message);

				if (/^invalid input syntax: unauthorized access/.test(err.message)) {
					response.error(res, {
						message: 'Unauthorized',
						description: err.message,
						status: 401,
						logMessage: `Vendor Fax ID: ${formdata['vendorFaxId']}`,
					});
				} else if (/^invalid input syntax/.test(err.message)) {
					response.error(res, {
						message: 'Bad Request',
						description: err.message,
						status: 400,
						logMessage: `Vendor Fax ID: ${formdata['vendorFaxId']}`,
					});
				} else {
					response.error(res, {
						message: "Error occured while storing the metadata",
						status: 500,
						logMessage: `Vendor Fax ID: ${formdata['vendorFaxId']}`,
					});
				}
			}
		});
		req.pipe(busboy);
	});
};
