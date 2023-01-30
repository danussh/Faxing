/**
* secrets-manager.js
* utility to get secrets
**/
const AWS = require('../../lib/aws');
const logger = require('../../lib/logger');

/**
* @summary fetch secret value for the key passed
*
* @access public
*
* @param secretKeyName
*
* @return secret value
**/

// This function will fetch the value from AWS System Manager - Parameter Store
async function getSecretValue(secretKeyName) {
	var ssm = new AWS.SSM();
	var params = {
		"Name": secretKeyName,
		"WithDecryption": true
	};

	let secret;
	try {
		logger.debug(`Fetching secret values for ${secretKeyName}`);
		let data = await ssm.getParameter(params).promise();
		secret = data.Parameter.Value;
		logger.debug(`Fetched secret value for ${secretKeyName}`);
	} catch (error) {
		logger.error(`Error occured while fetching secret value for ${secretKeyName}. Error: ${error}`);
	}
	return secret;
}

// This function will fetch the secret from AWS Secrets Manager
async function getSecretfromSecretsManager(secretKeyID) {
	var secretsManager = new AWS.SecretsManager();
	var params = {
		"SecretId": secretKeyID
	};

	var secret;
	try {
		logger.debug(`Fetching secret value for ${secretKeyID} from SecretsManager`);
		let data = await secretsManager.getSecretValue(params).promise();
		secret = JSON.parse(data.SecretString);
		logger.debug(`Fetched secret value for ${secretKeyID} from SecretsManager`);
	} catch (error) {
		logger.error(`Error occured while fetching secret value for ${secretKeyID}. Error: ${error}`);
	}
	return secret.password;
}


//module exports
module.exports = {
	getSecretValue,
	getSecretfromSecretsManager
};
