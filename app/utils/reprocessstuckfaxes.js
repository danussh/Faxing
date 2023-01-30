/**
 * reprocessstuckfaxes.js
 *
 * This cron sript processes stuck faxes
 * scheduler runs every SCHEDULE_TIMER minutes
 */

const common = require('./common');
const config = require('../../lib/config');
const dateAndTime = require('./dateandtime');
const filemanagement = require('./filemanagement');
const logger = require('../../lib/logger');
const mdp = require('./mdp');
const model = require('../models/basemodel');
const prometheus = require('../api/metrics');
const schedule = require('node-schedule');
const cacheManager = require('./cache-manager');
const secretsManager = require('./secrets-manager');

const region = config.get('aws.region');
const S3_BUCKET_NAME = config.get(`aws.s3bucket.${region}`);
const SCHEDULE_TIMER = 5; //minutes
const DEFAULT_RETRY_INTERVAL = 10;
const DEFAULT_MAX_RETRY_INTERVAL = 60;


/**
 * @purpose starts schedule to run every SCHEDULE_TIMER minutes to reprocess stuck faxes
 */
async function start() {

	let result = schedule.scheduleJob(`*/${SCHEDULE_TIMER} * * * *`, async () =>
		handleStuckFaxes()
	);
	logger.info(result ?
		"Created cron schedule to re-process the stuck faxes" :
		"Unable to create the scheduler");
}

/**
 * @purpose handles processing of all stuck faxes
 */
async function handleStuckFaxes() {
	try {

		/*
			Gauge metrics reseting it to 0 for every 5 minutes
			So that the metrics values don't produce cummulative result
			requestCountPerEndPoint - inboundfaxes, presignedurls, faxstatuses
			requestCountPerMethod - count of methods (POST, GET, PUT)
			responsesCounterPerInterval - count of status-code every endpoint
		*/
		prometheus.requestCountPerEndPoint.reset();
		prometheus.requestCountPerMethod.reset();
		prometheus.responsesCounterPerInterval.reset();
		prometheus.mdpMonitoring.reset();

		let result = await shouldExecute();
		// Return without processing stuck faxes, if shouldExecute does not return a true value
		if (!result) {
			return;
		}
		// Else, continue processing:
		logger.info('Checking Stuck Faxes for Re-Processing');
		// Default retry interval for stuck faxes be 10 minutes
		let retry_interval = await secretsManager.getSecretValue(config.get('aws.stuckFax.retryInterval')) || DEFAULT_RETRY_INTERVAL;
		// Default max retry interval for stuck faxes be 60 minutes. After 60 minutes stop processing the stuck faxes even if it is not processed.
		let max_retry_interval = await secretsManager.getSecretValue(config.get('aws.stuckFax.maxRetryInterval')) || DEFAULT_MAX_RETRY_INTERVAL;
		let stuckFaxes = await model.getStuckFaxMetadata(retry_interval, max_retry_interval);
		let enable_validate_md5_digest = await cacheManager.get('validate_md5_hex_digest', secretsManager.getSecretValue, config.get('aws.validateMD5HexDigestPath'), 600) || 1;
		logger.info(`Found ${stuckFaxes.length} faxes for re-processing`);
		prometheus.noOfStuckFaxes.set({type: 'total-faxes'}, stuckFaxes.length);
		// reset the count for 's3-upload-pending' to zero
		prometheus.noOfStuckFaxes.set({type: 's3-upload-pending'}, 0);
		stuckFaxes.forEach(async (fax) => processFax(fax, enable_validate_md5_digest));
	}
	catch (err) {
		logger.error("Error while getting the stuck faxes : " + err);
	}
}

/**
 * @purpose checks whether file is uploaded if so then sends data to ANet
 *
 * @param {Object} fax
 * @param {String} enable_validate_md5_digest
 */
async function processFax(fax, enable_validate_md5_digest) {
	try {
		logger.info(`Stuck Athena Fax ID: ${fax["FaxID"]} | Re-processing stuck fax.`);
		if (enable_validate_md5_digest == 1) {
			logger.debug(`Processing Stuck Athena Fax ID: ${fax["FaxID"]}`);
			let s3Object = await filemanagement.headObject(S3_BUCKET_NAME, fax["FaxID"]);
			let updateDatabase = (fax["FaxUploadedYN"] === 'Y') ? false : true;
			await sendDataToAthenaNet(fax, updateDatabase, s3Object.ETag);
		}
		else {
			if (fax["FaxUploadedYN"] === 'Y') {
				logger.debug(`Stuck Athena Fax ID: ${fax["FaxID"]} | File uploaded flag set, moving to athenaNet for processing.`);
				await sendDataToAthenaNet(fax);
			}
			else {
				await filemanagement.headObject(S3_BUCKET_NAME, fax["FaxID"]);
				logger.debug(`Stuck Athena Fax ID: ${fax["FaxID"]} | File exists, moving to athenaNet for processing.`);
				await sendDataToAthenaNet(fax, true);
			}
		}

		logger.info(`Stuck Athena Fax ID: ${fax["FaxID"]} | Re-processing completed successfuly.`);
	}
	catch (error) {
		if (/NotFound/.test(error)) {
			prometheus.noOfStuckFaxes.inc({type: 's3-upload-pending'}, 1);
			logger.warn(`Stuck Athena Fax ID: ${fax["FaxID"]} | File not uploaded by vendor ${fax.VendorName}.`);
		}
		else {
			logger.error(`Stuck Athena Fax ID: ${fax["FaxID"]} | Error in re-processing fax: ${error}`);
			prometheus.mdpMonitoring.inc({type: 'failure'}, 1);
		}
	}
}

/**
 * @purpose sends data to Anet through mdp call and then updates LastSentForProcessing in db
 *
 * @param {Object} fax
 * @param {Boolean} updateDatabase
 * @param {String} md5HexDigest
 */
async function sendDataToAthenaNet(fax, updateDatabase = false, md5HexDigest) {
	let faxid = fax.FaxID;
	// File upload status is updated if necessary.
	if (updateDatabase) model.updateFileUploadStatus(faxid, 'Y');

	// Getting the corresponding pre-signed URL for the fax metadata using FaxID.
	let presignedURL = await filemanagement.getPreSignedUrl(S3_BUCKET_NAME, faxid);
	fax["PreSignedURL"] = presignedURL;

	// Grooming FaxReceivedTimestamp for storing in AthenaNet.
	var faxReceivedTimeStampInEst = await dateAndTime.convertTimeZone(fax.FaxReceivedTimestamp, "America/New_York");

	// Populating the Fax data in the format in which Athena expects.
	let faxData = {
		"FAXUNIQUEID": faxid,
		"FILENAME": fax.Filename,
		"GOODPAGECOUNT": fax.GoodPageCount,
		"BADPAGECOUNT": fax.BadPageCount,
		"FROMNUMBER": fax.FromFaxNumber,
		"TONUMBER": fax.ToFaxNumber,
		"TIMEZONEOFFSET": fax.TimezoneOffset,
		"BROKENYN": fax.FaxPartialFlag ? 'Y' : 'N',
		"TRANSMISSIONSTATUS": fax.TransmissionStatus,
		"VENDORFAXID": fax.VendorFaxID,
		"VENDORMETADATA": fax.VendorMetadata,
		"TYPE": fax.VendorName,
		"TRANSMISSIONDURATION": fax.TransmissionDuration,
		"FAXRECEIVEDTIMESTAMP": faxReceivedTimeStampInEst,
		"CALLERANI": fax.CallerANI,
		"CALLERID": fax.RemoteID,
		"PRESIGNEDURL": presignedURL,
		"ISFAXINGMICROSERVICE": 'Y',
		"AWS_REGION": region,
	};

	if (md5HexDigest) {
		faxData["FILEMD5HEXDIGEST"] = md5HexDigest.replace(/["]+/g, '');
	}

	// Sending fax information to aNet using MDP.
	const processResponse = await mdp.request(
		'POST',
		`queue/subsystembuscall`,
		{
			SUB: 'ProcessInboundVendorFaxes',
			SUBSYSTEM: 'FaxSystem',
			PARAMS: { "FAX": faxData },
		}
	);
	await processResponse.data.response;
	prometheus.mdpMonitoring.inc({type: 'success'}, 1);

	// Update the LastSentForProcessing once the MDP call is successfull
	model.updateLastSentForProcessing(faxid);
	logger.debug(`Stuck Athena Fax ID: ${faxid} | Successfully sent to aNet.`);
}

/**
 * @purpose if multiple scripts are running then this will determine
 * 		whether this particular script execution should proceed.
 *
 * @returns object or undefined based on success or failure
 */
async function shouldExecute() {

	// Allow the script to run only if the parameter allowRetryScriptRun is turned ON
	let canRetryCronRun = await secretsManager.getSecretValue(config.get('aws.stuckFax.retryCronControlPath'));
	if (canRetryCronRun == 0) {
		logger.warn(' The cron to handle stuck faxes is turned OFF.');
		return;
	}

	// Allow the script to run only if previous script has completed.
	// This could return false if the previous script had failed to update
	// the ReprocessFaxes table because of database errors.
	let processTime = common.getNearestMinuteTo(new Date(), SCHEDULE_TIMER);
	let result = await model.logReprocessScript(processTime);
	result ? model.deleteReprocessedRecords(SCHEDULE_TIMER) : '';
	if (!result) {
		logger.warn('Skipping this run as other script already running or some db connection issue.');
	}
	return result;
}

module.exports = {
	start,
	handleStuckFaxes,
	sendDataToAthenaNet
};
