const appConfig = require('../../../lib/config');
const logger = require('../../../lib/logger');
const knexLibrary = require('knex');
const cacheManager = require('../../utils/cache-manager');
const secretsManager = require('../../utils/secrets-manager');

/**
	Class representing a database handle.
**/
class Postgres {
	/**
	* @return {Object} a knex object that is connected to the database.
	*/
	
	
	constructor() {
		const region = appConfig.get('aws.region');
		const password = async() => await cacheManager.get('postgres_password', secretsManager.getSecretfromSecretsManager, appConfig.get(`postgres.passwordSecretsPath.${region}`), 600);
		const knex = knexLibrary({
			client: 'pg',
			connection: {
				host: appConfig.get(`postgres.host.${region}`),
				user: appConfig.get('postgres.username'),
				port: appConfig.get('postgres.port'),
				password: password,
				database: appConfig.get('postgres.database'),
			},
			acquireConnectionTimeout: 100000,
			pool: {
				min: 2,
				max: 20,
				afterCreate: function(connection, callback) {
					connection.query("SET TIME ZONE 'UTC'", function(err) {
						callback(err, connection);
					});
				}
			},
		});
		logger.info("Created a connection to postgres");
		return knex;
	}
}

module.exports = new Postgres();
