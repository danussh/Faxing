const conf = require('../../lib/config');
const logger = require('../../lib/logger');
const https = require('https');
const axios = require('axios');
const prometheus = require('../api/metrics');
const accessToken = require('./access-token');

const getMdpBaseUrl = () => {
	if (conf.get('env') === 'production-aws') {
		return conf.get('mdp.mdpURL') + '/' + conf.get('mdp.mdpPath');
	}
	else {
		return conf.get('mdp.mdpURL') + ':' + conf.get('mdp.mdpPort') + '/' + conf.get('mdp.mdpPath');
	}
};
const mdpBaseURL = getMdpBaseUrl();
logger.info(`MDP Base URL: ${mdpBaseURL}`);

const request = async (method, endpoint, payload, retryparams) => {
	// TODO: rejectUnauthorized should only be for developement, dangerous in production
	// TODO: use different hostname depending on prod / dev envs

	const agent = new https.Agent({ rejectUnauthorized: true });
	const mdpURL = `${mdpBaseURL}${endpoint}`;
	logger.debug(`MDP url: ${mdpURL}`);
	const params = {
		method: method,
		httpsAgent: agent,
		url: mdpURL,
		headers: {
			'Content-Type': 'application/json',
		},
	};

	if (payload) {
		params.data = payload;
	}

	const endTimer = prometheus.executionTime.startTimer({ taskName: 'getAccessToken' })
	const token = await accessToken.getAccessToken();

	if (token) {
		params.headers.Authorization = `Bearer ${token}`;
		endTimer({ status: 'SUCCESS' });
	}
	else {
		endTimer({ status: 'FAILED' });
	}

	let res;
	if (retryparams) {
		res = retryRequestMethod(params, retryparams);
	}
	else {
		res = axios(params);
	}

	res.catch((e) => {
		logger.error(`Athena Fax ID - ${payload.PARAMS.FAX.FAXUNIQUEID} | MDP call to ${endpoint} failed with the following error - ${e}.`);
	});

	return res;
};

module.exports = {
	request
};
