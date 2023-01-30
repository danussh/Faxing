const moment = require('moment-timezone');

/****
	Takes care of converting a given time to the given timezone.
****/
const convertTimeZone = async (time, zone) => {
	var convertedTime = moment.tz(time, zone);
	return convertedTime.format();
};

module.exports = {
	convertTimeZone
};
