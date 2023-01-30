/**
 * common.js
 * utility for common operations
 */

/** 
 * @summary rounds up current time to nearest passed no. of minutes
 * 
 * @param date {Date} date to round up
 * @param minutes {Integer} Number of minutes to round up to
 * 
 * @returns date
 */
function getNearestMinuteTo(date, minutes) {
    let coeff = 1000 * 60 * minutes;
    let rounded = new Date(Math.round(date.getTime() / coeff) * coeff);
    return rounded;
}

module.exports = {
    getNearestMinuteTo
}
