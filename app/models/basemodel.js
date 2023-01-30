/**
 * basemodel.js
 *
 * @purpose it handles all db queries and operation
 */
const config = require('../../lib/config');
const dbh = require('../services/database/postgres');
const logger = require('../../lib/logger');

const dbSchema = config.get('postgres.schema');

module.exports = class MetadataModel {

	static async storeFaxMetadata(formdata) {
		logger.info(`DB Schema: ${dbSchema}`);

		const insertFaxMetadataQuery = `
			INSERT INTO ${dbSchema}."FaxInfo"
			(
				"FaxID",
				"Filename",
				"GoodPageCount",
				"BadPageCount",
				"FromFaxNumber",
				"ToFaxNumber",
				"TransmissionStatus",
				"VendorFaxID",
				"VendorMetadata",
				"TransmissionDuration",
				"FaxReceivedTimestamp",
				"CallerANI",
				"RemoteID",
				"FaxPartialFlag",
				"VendorID",
				"Created",
				"CreatedBy"
			)
			VALUES
				(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					(SELECT "ID" FROM ${dbSchema}."Vendor" WHERE "Name" ilike ? and "Deleted" is null),
					CURRENT_TIMESTAMP, 'system')
			ON CONFLICT
				("VendorFaxID", "VendorID")
			DO UPDATE
			SET
				"RetryCount" = ${dbSchema}."FaxInfo"."RetryCount" + 1,
				"LastModified" = CURRENT_TIMESTAMP,
				"LastModifiedBy" = 'system'
			RETURNING "FaxID"`;
		try {
			let querypromise = dbh.raw(insertFaxMetadataQuery,
				[
					formdata['faxId'],
					formdata["fileName"],
					formdata["faxPages"],
					formdata["isFaxPartial"] ? formdata["isFaxPartial"].toLowerCase() === 'true' ? 1 : 0 : 0,
					formdata["callerNumber"],
					formdata["calledNumber"],
					formdata["transmissionStatus"],
					formdata["vendorFaxId"],
					formdata["vendorMetadata"],
					formdata["transmissionDurationSeconds"],
					formdata["faxReceivedTimestamp"],
					formdata["callerANI"],
					formdata["remoteId"],
					formdata["isFaxPartial"] ? formdata["isFaxPartial"].toLowerCase() === 'true' ? true : false : false,
					formdata["vendorName"]
				]
			).then((result) => {
				logger.info(`Row inserted in FaxInfo table: ${result.rows[0].FaxID}`);
				return result.rows[0].FaxID;
			});
			formdata['faxId'] = await querypromise;
		} catch (error) {
			logger.error(`${formdata["vendorName"]} | Vendor Fax ID - ${formdata['vendorFaxId']} | Error while inserting metadata. Error - ${error}`);
			if (/"VendorID" violates not-null constraint/.test(error.message)) {
				logger.error("VendorID violates not-null constraint: ${error}");
				throw new Error('invalid input syntax: vendor is not registered with athena');
			} else {
				logger.error("Inserting into DB error: ${error}");
				throw error;
			}
		}
	}

	// Updates a bool value in ProcessStatus column of FaxInfo table using FaxID. Also, sets the LastModified and LastModifiedBy columns.
	static async updateFaxStatus(faxuid, faxprocessstatus) {
		(faxprocessstatus == 'Success') ? (faxprocessstatus = 'true') : (faxprocessstatus = 'false');
		let result = await dbh('FaxInfo')
			.withSchema(dbSchema)
			.where('FaxID', faxuid)
			.update({
				'ProcessStatus': faxprocessstatus,
				'LastModified': dbh.fn.now(),
				'LastModifiedBy': 'system-aNet'
			});
		return result;
	}

	// Updates a bool value in ProcessStatus column of FaxInfo table using VendorFaxID. Also, sets the LastModified and LastModifiedBy columns.
	static async updateFaxStatusByVendorFaxID(vendorFaxID, faxprocessstatus) {
		(faxprocessstatus == 'Success') ? (faxprocessstatus = 'true') : (faxprocessstatus = 'false');
		/*
			Adding VendorID in query will speed up the query execution,
			because VendorID and VendorFaxID are combined together as PRIMARY Key

			Since Concord's VendorID is 1, we've hard coded '1' if VendorFaxID starts with 'ct'
		*/
		let vendorID = 0;
		if (vendorFaxID.search(/^ct/) != -1) {
			vendorID = 1;
		}

		let result = await dbh('FaxInfo')
			.withSchema(dbSchema)
			.where('VendorFaxID', vendorFaxID)
			.where('VendorID', vendorID)
			.update({
				'ProcessStatus': faxprocessstatus,
				'LastModified': dbh.fn.now(),
				'LastModifiedBy': 'system-aNet'
			});
		return result;
	}

	static async deleteFaxMetadata(faxid) {
		let result = await dbh('FaxInfo')
			.withSchema(dbSchema)
			.where('FaxID', faxid)
			.del();
		return result;
	}

	static async updateLastSentForProcessing(faxid) {
		let result = await dbh('FaxInfo')
			.withSchema(dbSchema)
			.where('FaxID', faxid)
			.update({ 'LastSentForProcessing': dbh.fn.now() });
		return result;
	}

	/**
	 * @purpose get the list of stuck faxes which is not processed
	 *
	 * @param {Integer} retry_interval
	 * @param {Integer} max_retry_interval 
	 */
	static async getStuckFaxMetadata(retry_interval, max_retry_interval) {
		let result = await dbh.withSchema(dbSchema).select(
			"FaxID",
			"Filename",
			"FaxPartialFlag",
			'Name as VendorName',
			"GoodPageCount",
			"BadPageCount",
			"FromFaxNumber",
			"ToFaxNumber",
			"TimezoneOffset",
			"TransmissionStatus",
			"VendorFaxID",
			"VendorMetadata",
			"TransmissionDuration",
			"FaxReceivedTimestamp",
			"CallerANI",
			"RemoteID",
			"LastSentForProcessing",
			"ProcessStatus",
			"StopProcessingYN",
			"ProcessAttempts",
			"VendorID",
			"FaxUploadedYN")
			.from('FaxInfo')
			.innerJoin('Vendor', 'FaxInfo.VendorID', '=', 'Vendor.ID')
			.where(function () {
				this.where('ProcessStatus', false)
					.orWhereNull('ProcessStatus')
			})
			.andWhere(function () {
				this.where('StopProcessingYN', false)
					.orWhereNull('StopProcessingYN');
			})
			.andWhere(function () {
				this.whereRaw(`"LastSentForProcessing" < CURRENT_TIMESTAMP - interval '${retry_interval} minutes'`)
					.orWhere(function () {
						this.whereNull('LastSentForProcessing')
							.andWhereRaw(`"FaxInfo"."Created" < CURRENT_TIMESTAMP - interval '${retry_interval} minutes'`)
					})
			})
			.andWhere(function () {
				this.whereRaw(`"FaxInfo"."Created" > CURRENT_TIMESTAMP - interval '${max_retry_interval} minutes'`)
			})
			.andWhereRaw('"FaxInfo"."Deleted" IS NULL');
		return result;
	}

	static async updateFileUploadStatus(faxid, uploadStatus) {
		let result = await dbh('FaxInfo')
			.withSchema(dbSchema)
			.where('FaxID', faxid)
			.update({ 'FaxUploadedYN': uploadStatus });
		return result;
	}

	static async getFaxMetadata(faxid) {
		let result = await dbh.withSchema(dbSchema).select(
			'FaxID',
			'Filename',
			'FaxPartialFlag',
			'Name as VendorName',
			'GoodPageCount',
			'BadPageCount',
			'FromFaxNumber',
			'ToFaxNumber',
			'TimezoneOffset',
			'TransmissionStatus',
			'VendorFaxID',
			'VendorMetadata',
			'TransmissionDuration',
			'FaxReceivedTimestamp',
			'CallerANI',
			'RemoteID',
			'LastSentForProcessing',
			'ProcessStatus',
			'StopProcessingYN',
			'ProcessAttempts',
			'VendorID')
			.from('FaxInfo')
			.innerJoin('Vendor', 'FaxInfo.VendorID', '=', 'Vendor.ID')
			.where(function () {
				this.where('ProcessStatus', false)
					.orWhereNull('ProcessStatus')
			})
			.andWhere(function () {
				this.where('StopProcessingYN', false)
					.orWhereNull('StopProcessingYN');
			})
			.andWhere(function () {
				this.whereRaw('"LastSentForProcessing" < current_timestamp - interval \'10 minutes\'')
					.orWhereNull('LastSentForProcessing')
			})
			.andWhereRaw('"FaxInfo"."Deleted" IS NULL')
			.andWhere('FaxID', faxid)
			.andWhere('FaxUploadedYN', 'Y');
		return result[0];
	}

	/**
	 * @purpose log processtime record to ReprocessFaxes table
	 *
	 * @param {Date} processedTime
	 */
	static async logReprocessScript(processedTime) {
		let result;
		try {
			result = await dbh('ReprocessFaxes')
				.withSchema(dbSchema)
				.insert({ 'ProccessedTime': processedTime, 'CreatedBy': 'system' });
		}
		catch (error) {
			if (!(/unique constraint/.test(error.message))) {
				logger.error(`logReprocessScript failed with error: ${error.message}`);
			}
			result = undefined;
		}
		return result;
	}

	/**
	 * @purpose delete records from ReprocessFaxes table
	 *
	 * @param {Integer} interval
	 */
	static async deleteReprocessedRecords(interval) {
		try {
			await dbh('ReprocessFaxes')
				.withSchema(dbSchema)
				.whereRaw(`"Created"< CURRENT_TIMESTAMP- interval '${interval + 1} minutes'`)
				.del();
		}
		catch (error) {
			logger.warn(`Could not delete data from ReprocessFaxes table. Error: ${error}`);
		}
	}
};
