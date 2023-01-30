/**
 * validate.js
 * utility for validation of data
 */
const cacheManager = require('./cache-manager');
const config = require('../../lib/config');
const secretsManager = require('./secrets-manager');

const secretKeyPath = config.get('secretKeyPath');

/** 
 * @summary validates and rectifies form fields data
 * 
 * @access public
 * 
 * @param formdata hashmap of fields passed
 * 
 * @throws invalid input syntax error in case of validation failure 
 * @see applyValidation for errors thrown
 * 
 * @return nothing in case of success
 */
function validateAndRectifyFields(formdata) {
  let requiredFields = [
    'vendorName',
    'vendorFaxId',
    'calledNumber',
    'faxPages',
    'faxReceivedTimestamp',
    'transmissionDurationSeconds',
    'transmissionStatus'
  ];
  let stringFields = [
    'vendorName'
  ];
  let numberFields = [
    'faxPages',
    'transmissionDurationSeconds'
  ];
  let optionalStringFields = [
    'vendorMetadata',
    'callerNumber',
    'calledNumber',
    'callerANI',
    'remoteId'
  ];

  applyValidation(formdata, requiredFields, validateRequiredField, 'missing');
  applyValidation(formdata, stringFields, validateStringField, 'in incorrect format');
  applyValidation(formdata, numberFields, validateDigitField, 'in incorrect format');

  //rectify optional fields
  optionalStringFields.forEach(function (stringField) {
    if (formdata[stringField] == undefined || formdata[stringField] == '') {
      formdata[stringField] = '';
    }
  });
  formdata['fileName'] = `${formdata['faxId']}.tif`;
}

/** 
 * @summary applies passed method validation on array of data
 * 
 * @access private
 * 
 * @param formdata hashmap of fields passed
 * @param array an array of field-names to apply validation
 * @param validateFunction validation function to apply on array
 * @param errormessage message to be shown if validation fails
 * 
 * @throws invalid input syntax error in case of validation failure
 * 
 * @return nothing in case of success
 */
function applyValidation(formdata, array, validateFunction, errormessage) {
  let failedFields = [];
  array.forEach(function (value) {
    if (validateFunction(formdata[value])) {
      failedFields.push(value);
    }
  });
  if (failedFields.length > 0) {
    let ismultiple = failedFields.length > 1;
    throw new Error(`invalid input syntax: field${ismultiple ? 's' : ''} ${failedFields} ${ismultiple ? 'are' : 'is'} ${errormessage}`);
  }
}

/** 
 * @summary validates required field
 * 
 * @access private
 * 
 * @param field to check validation
 * 
 * @return true in case of validation failure otherwise false
 */
let validateRequiredField = (field) => {
  if (field === undefined || field === '') {
    return true;
  }
  return false;
}

/** 
 * @summary validates field for only english characters
 * 
 * @access private
 * 
 * @param field to check validation
 * 
 * @return true in case of validation failure otherwise false
 */
let validateStringField = (field) => {
  if (/^[a-zA-Z]+$/.test(field)) {
    return false;
  }
  return true;
}

/** 
 * @summary validates field for only digits
 * 
 * @access private
 * 
 * @param field to check validation
 * 
 * @return true in case of validation failure otherwise false
 */
let validateDigitField = (field) => {
  if (/^[0-9]+$/.test(field)) {
    return false;
  }
  return true;
}

/** 
 * @summary validates secret key passed
 * 
 * @access public
 * 
 * @param secretKey to check authorization
 * 
 * @param vendorName vendor name
 * 
 * @throws invalid input syntax error in case of validation failure
 * 
 * @return true if validation passes
 */
async function validateAPIKey(secretKey, vendorName) {
  var apiSecretKey = await cacheManager.get('validate_validateapikey', secretsManager.getSecretValue, secretKeyPath, 600);
  var matched = false;

  // ssm will have vendorName in lowercase
  // vendors can pass vendorName in any case
  // so we will convert it to lowercase and then match it with ssm secret
  let keytoValidate = `${vendorName.toLowerCase()}:${secretKey}`;
  apiSecretKey.split(/\s*,\s*/).some(function (key) {
    if (keytoValidate === key) {
      matched = true;
      return true;
    }
  });
  if (!matched) {
    throw new Error('invalid input syntax: unauthorized access, please call support team');
  }
  return matched;
}

//module exports
module.exports = {
  validateAndRectifyFields,
  validateAPIKey
};
