const AWS = require('../../lib/aws');
const config = require('../../lib/config');
const logger = require('../../lib/logger');
const Consumer = require('sqs-consumer');
const dateAndTime = require('./dateandtime');
const filemanagement = require('./filemanagement');
const mdp = require('./mdp');
const metaDataModel = require('../models/basemodel');
const prometheus = require('../api/metrics');
const cacheManager = require('./cache-manager');
const secretsManager = require('./secrets-manager');

var sqs = new AWS.SQS();

const region = config.get('aws.region');
var sqsURL = config.get(`aws.sqsFileuploadUrl.${region}`);
const s3bucketName = config.get(`aws.s3bucket.${region}`);

/**
* Whenever an entry is added to the SQS queue this function will be invoked.
* When we recieve a file upload envent from S3, we need to perform the following tasks
*  1. Update Faxinfo.FaxUploadedYN to 'Y' indicating file is uploaded to S3
*  2. Call the MDP endpoint in AthenaNet with the fax metadata for further processing
*      a.  Fetch the Fax metadata from Faxinfo table for that faxid
*      b.  Fetch the Faxnumber details (Practice id ) from Faxnumber table
*      c.  Get the presigned url for that fax
*      d.  Call the MDP endpoint with all the metadata
*      e.  Update the Last sent for processing in DB
*/

const app = Consumer.create({
	queueUrl: sqsURL,
	handleMessage: async (message, done) => {
		handleTrigger(message);
		done();
	},
	batchSize: 10,
	waitTimeSeconds: 20,
	visibilityTimeout: 20,
	sqs: sqs
});

app.on('error', (err) => {
	logger.error(err.message);
});

async function handleTrigger(message) {
	// We will receive the SQS data in message.Body
	var messageBody = JSON.parse(message.Body);
	let enable_validate_md5_digest = await cacheManager.get('validate_md5_hex_digest', secretsManager.getSecretValue, config.get('aws.validateMD5HexDigestPath'), 600) || 1;

	messageBody.Records ? messageBody.Records.forEach(async function (record) {
		var faxid = record.s3.object.key;
		logger.debug(`Athena Fax ID: ${faxid} | S3 file upload event triggered | Time Difference: ${new Date() - new Date(record.eventTime)} ms.`);
		// Update the File upload status in DB so that we know file is present in S3
		var updateResult;
		try {
			updateResult = await metaDataModel.updateFileUploadStatus(faxid, 'Y');
			logger.debug(`Athena Fax ID: ${faxid} | Successfully updated the file upload status in DB.`);
		}
		catch (err) {
			logger.error(`Athena Fax ID: ${faxid} | Failed while updating the File upload status in the DB. Error - ${err}`);
			return;
		}
		logger.info(`Athena Fax ID: ${faxid} | Rows updated in DB regarding file upload status is ${updateResult}.`);
		if (updateResult != 1) {
			logger.warn(`Athena Fax ID: ${faxid} | Unable to find an entry in database. Skipping this record from further processing.`);
			return;
		}
		try {
			var faxMetaData = await metaDataModel.getFaxMetadata(faxid);

			// Grooming FaxReceivedTimestamp for storing in AthenaNet.
			var faxReceivedTimeStampInEst = await dateAndTime.convertTimeZone(faxMetaData.FaxReceivedTimestamp, "America/New_York");

			// This scenario of fax meta data present in DB but getFaxMetadata returns null
			// happens when the fax is stopped for processing or it has already been sent to AthenaNet.
			if (!faxMetaData) {
				logger.warn(`Athena Fax ID: ${faxid} | Unable to fetch the fax meta data from database. This entry is either stopped from processing or is already sent to AthenaNet. Hence skipping this record from further processing.`);
				return;
			}
			//If fax meta data is received properly, get the other necessary details and send it to AthenaNEt for further processing
			logger.debug(`Athena Fax ID: ${faxid} | Fax meta data received.`);
			var presignedURL = await filemanagement.getPreSignedUrl(s3bucketName, faxid);
			logger.debug(`Athena Fax ID: ${faxid} | We now have the metadata and pre-signed URL of this file. Generating MDP request for sending it to athenaNet for processing.`);
			// Populating the Fax data in the format in which Athena expects.
			var faxData = {
				"FAXUNIQUEID": faxMetaData.FaxID,
				"FILENAME": faxMetaData.Filename,
				"GOODPAGECOUNT": faxMetaData.GoodPageCount,
				"BADPAGECOUNT": faxMetaData.BadPageCount,
				"FROMNUMBER": faxMetaData.FromFaxNumber,
				"TONUMBER": faxMetaData.ToFaxNumber,
				"TIMEZONEOFFSET": faxMetaData.TimezoneOffset,
				"BROKENYN": faxMetaData.FaxPartialFlag ? 'Y' : 'N',
				"TRANSMISSIONSTATUS": faxMetaData.TransmissionStatus,
				"VENDORFAXID": faxMetaData.VendorFaxID,
				"VENDORMETADATA": faxMetaData.VendorMetadata,
				"TYPE": faxMetaData.VendorName,
				"TRANSMISSIONDURATION": faxMetaData.TransmissionDuration,
				"FAXRECEIVEDTIMESTAMP": faxReceivedTimeStampInEst,
				"CALLERANI": faxMetaData.CallerANI,
				"CALLERID": faxMetaData.RemoteID,
				"PRESIGNEDURL": presignedURL,
				"ISFAXINGMICROSERVICE": 'Y',
				"AWS_REGION": region,
			};

			if (enable_validate_md5_digest == 1) {
				faxData["FILEMD5HEXDIGEST"] = record.s3.object.eTag;
			}

			// Sending fax information to aNet using MDP.
			const processResponse = await mdp.request(
				'POST',
				`queue/subsystembuscall`, {
					SUB: 'ProcessInboundVendorFaxes',
					SUBSYSTEM: 'FaxSystem',
					PARAMS: { "FAX": faxData },
				}
			);
			await processResponse.data.response;
			prometheus.mdpMonitoring.inc({type: 'success'}, 1);
			logger.info(`Athena Fax ID: ${faxid} | Successfully sent the MDP request to Athena.`);
		}
		catch (err) {
			prometheus.mdpMonitoring.inc({type: 'failure'}, 1);
			logger.error(`Athena Fax ID: ${faxid} | Failed to call the MDP endpoint in athenanet because of the following error - ${err}`);
		}
		// Update the LastSentForProcessing
		// Update even if mdp call failed - so that we do not keep retrying repeatedly through the reprocess cron 
		metaDataModel.updateLastSentForProcessing(faxid);
	}) : '';
}

/**
* Function to start listening to the SQS queue once the application is started
* This function will be triggered from app.js which will be called everytime the application is brought up
*/
function listen() {
	logger.info("Starting startSQS Consumer to listen to File upload events");
	app.start();
}

module.exports = {
	listen,
	handleTrigger
};
