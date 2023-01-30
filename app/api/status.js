/**
 * status.js
 * 
 * api controller for put /faxstatuses endpoint
 * 
 * @purpose it update the status of fax to success when recieved by ANet
 * 
 * @used through ANet
 */
const response = require('../utils/response-handler');
const metaDataModel = require('../models/basemodel');
const logger = require('../../lib/logger');

module.exports.controller = function (app) {
	app.put('/faxstatuses', async function (req, res) {
		// Accepts status value as 'SUCCESS' or 'FAILED'.
		var faxprocessstatus = req.body.status;
		const faxUniqueID = req.body.faxid;
		const vendorFaxID = req.body.vendorfaxid;

		if (/^(SUCCESS)$/i.test(faxprocessstatus)) {
			faxprocessstatus = 'Success';
		}
		else if (/^(FAILED)$/i.test(faxprocessstatus)) {
			faxprocessstatus = 'Failed';
		}
		else {
			response.error(res, {
				status: 400,
				message: 'Bad Request',
				description: `Fax status of ${faxUniqueID} should be SUCCESS or FAILED.`
			});
			return;
		}

		logger.debug("Received request to update the status of FaxID - %s, VendorFaxID - %s as %s", faxUniqueID, vendorFaxID, faxprocessstatus);
		// Updating the DB.
		try {
			var result = await metaDataModel.updateFaxStatusByVendorFaxID(vendorFaxID, faxprocessstatus);
			if (result == 0) {

				result = await metaDataModel.updateFaxStatus(faxUniqueID, faxprocessstatus);

				if (result == 0) {
					response.error(res, {
						status: 400,
						message: 'Bad Request',
						description: `Could not find a fax with faxID: ${faxUniqueID}, VendorFaxID - ${vendorFaxID}`
					});
					logger.error(`Could not find a fax with faxID: ${faxUniqueID}, VendorFaxID - ${vendorFaxID}`);
				}
				else {
					response.success(res, { message: `Fax status of FaxID - ${faxUniqueID}, VendorFaxID - ${vendorFaxID} successfully updated.` }, '200');
					logger.debug(`Fax status for FaxID: ${faxUniqueID} was updated as ${faxprocessstatus}`);					
				}
			}
			else {
				response.success(res, { message: `Fax status of FaxID - ${faxUniqueID}, VendorFaxID - ${vendorFaxID} successfully updated.` }, '200');
				logger.debug(`Fax status for VendorFaxID: ${vendorFaxID} was updated as ${faxprocessstatus}`);
			}
		}
		catch (err) {
			if (/^invalid input syntax/.test(err.message)) {
				response.error(res, {
					status: 400,
					message: 'Bad Request',
					description: err.message
				});
			}
			else {
				logger.error(`Could not update status of faxID - ${faxUniqueID}, VendorFaxID - ${vendorFaxID} as ${faxprocessstatus} because of the following error - ${err.message}`);
				response.error(res, {
					status: 500,
					message: 'Something went wrong',
					description: `Fax status of FaxID - ${faxUniqueID}, VendorFaxID - ${vendorFaxID}, could not be updated.`
				});
			}
		}
	});
};
