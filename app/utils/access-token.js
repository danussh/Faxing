const conf = require('../../lib/config');
const logger = require('../../lib/logger');
const TokenManager = require('@athena/iam-service-token-manager');
const cacheManager = require('./cache-manager');
const secretsManager = require('./secrets-manager');

/**
	Create object for TokenManager
**/
let mdpTokenManager = null;
const loadTokenManager = async() => {
    const clientId = await cacheManager.get('uiam_credential_client_id', secretsManager.getSecretValue, conf.get('uiam.clientIdPath'), 600);
    const clientSecret = await cacheManager.get('uiam_credential_client_secret', secretsManager.getSecretValue, conf.get('uiam.clientSecretPath'), 600);
    mdpTokenManager = new TokenManager({
        clientId: clientId,
        clientSecret: clientSecret,
        tokenEndpointUrl: conf.get('uiam.tokenEndpointURL'),
        scopes: conf.get('uiam.serviceScopes'),
        logger: logger,
    });
    logger.info("Created new object for iam-service-token-manager");
}

const getAccessToken = async() => {
    if (!mdpTokenManager) {
        await loadTokenManager();
        logger.info("Updated new Token manager object");
    } 
    const accessToken = await mdpTokenManager.getAccessToken();
    return accessToken;
};

module.exports = {
    loadTokenManager,
    getAccessToken
}