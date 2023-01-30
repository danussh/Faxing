/**
 * cache-manager.js
 * utility for caching of data
 */
const logger = require('../../lib/logger');

const DEFAUT_EXPIRY = 300; // 5 minutes
const EXPIRY_TIME_KEY = 'expiryTime';
const VALUE_KEY = 'value';
const MILLISECONDS = 1000;
let cache = {};

/**
* @summary get value from cache and if not present fetch from function passed
*
* @param key : key to get value from cache
* @param retrievingFunction : function to refresh value
* @param args : args for retrievingFunction function
* @param expiryAfter : time in seconds after which cache refreshes
*
* @access public
*
* @return value from cache
*/
async function get(key, retrievingFunction, args, expiryAfter = DEFAUT_EXPIRY) {
    if (cache[key] == undefined ||
        ((new Date()).getTime() - cache[key][EXPIRY_TIME_KEY] >= 0)) {
        await fetchAndSetValue(key, retrievingFunction, args, expiryAfter);
    }
    return cache[key][VALUE_KEY];
}

/**
* @summary calls retrievingFunction and sets cache parameters 
*
* @param key : key to get value from cache
* @param retrievingFunction : function to refresh value
* @param args : args for retrievingFunction function
* @param expiryAfter : time in seconds after which cache refreshes
*
* @access private
*
* @return none
*/
async function fetchAndSetValue(key, retrievingFunction, args, expiryAfter) {
    let value = await retrievingFunction(args);
    let expiryTime = (new Date()).getTime() + (expiryAfter * MILLISECONDS);
    let cachemap = {};
    cachemap[VALUE_KEY] = value;
    cachemap[EXPIRY_TIME_KEY] = expiryTime;
    cache[key] = cachemap;
    logger.info(`Updated new value for key ${key}, next update in ${expiryAfter} seconds`);
}

module.exports = {
    get
}