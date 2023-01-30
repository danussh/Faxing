/**
 * @purpose to register the service with api-gateway
 */
const config = require('../../../lib/config');
const exitHook = require('exit-hook');
const fs = require('fs');
const gateway = require('@athena/api-gateway-node-client');
const lodash = require('lodash');
const logger = require('../../../lib/logger');
const yaml = require('js-yaml');

const readYaml = (fileName) => {
  try {
    const doc = yaml.safeLoad(fs.readFileSync(fileName, 'utf8'));
    return doc;
  }
  catch (e) {
    logger.error(`Error reading Eueka Config file ${e}`);
    throw e;
  }
};

const writeYaml = ({ eurekaConfig, filePath }) => {
  const content = yaml.safeDump(eurekaConfig);
  fs.writeFileSync(filePath, content);
};

const addBranchName = ({ eurekaConfig, branchName }) => {
  const newConfig = lodash.cloneDeep(eurekaConfig);
  newConfig.instance.metadata.branch = branchName;
  return newConfig;
};

const isDevelopment = () => {
  return config.get('env') === 'development-aws' || config.get('env') === 'local';
};

// class to handle APIGateway registration
class APIGateway {

  /**
   * constructor - Method to instantiate class.
   */
  constructor() {
    this.apiGateway = gateway;
    this.configFilePath = 'app/services/gateway/config/eureka-client.yml';
    this.tempConfigPath = '';
    this.setupApiConfigFile();
  }

  setupApiConfigFile() {
    try {
      const branchName = config.get('branchName');
      logger.info('API Gateway Branch name: ' + branchName);
      let eurekaConfig = readYaml(this.configFilePath);

      // Write branch name to eureka config only in case of feature branch deployment in development
      //This will enable the api gateway to properly parse the service name and use it in UIAM
      if (isDevelopment() && branchName != 'master') {
        eurekaConfig = addBranchName({ eurekaConfig, branchName });
      }
      this.tempConfigPath = `/tmp/eureka_config_${branchName}.yml`;
      writeYaml({ eurekaConfig, filePath: this.tempConfigPath });
    }
    catch (err) {
      logger.error('Eureka config could not be saved due to :', err.toString());
      this.eurekaClientSetupSuccess = false;
    }
  }

/**
 * @purpose registers app with API gateway based on config.
 * @param none
 * @returns none
 */
  register() {
    const appPort = config.get('port');
    const serviceName = config.get('gatewayServiceName');
    if (config.get('registerWithGateway') == true) {
      logger.info(`API gateway service name: ${serviceName}`);
      this.apiGateway.connect(appPort, serviceName, this.tempConfigPath);
      this.apiGateway.on('registered', () => {
        exitHook(() => {
          logger.info('De-registering from gateway...');
          this.apiGateway.client.stop();
        });
      });
    }
    else {
      logger.error('Application is not registered with API gateway');
    }
  }
}

module.exports = new APIGateway();
