/**
 * filemanagement.js
 * utility for s3 operations
 */

 const AWS = require('../../lib/aws');
 const conf = require('../../lib/config');
 const cacheManager = require('./cache-manager');
 const secretsManager = require('./secrets-manager');


 var s3 = new AWS.S3({
     sslEnabled: true
 });
 

// This function returns a presigned URL that we can use to GET an object from S3 bucket.
// Input parameters: 
//    Bucket name
//    Key (Object name in S3) 
 async function getPreSignedUrl(bucket, key) {
     // expiryTime will be returned in minutes.
     // Default to 10 mins if no value is set.
     let expiryTime = await cacheManager.get('presignedUrl_get_expiry_time', secretsManager.getSecretValue, conf.get('aws.presignedUrl.getObjectExpiryPath'), 600) || 10;
     var parameter = {
         Bucket: bucket,
         Key: key,
         Expires: expiryTime * 60,  // Converted to seconds
     };
     return s3.getSignedUrlPromise('getObject', parameter);
 }
 
 async function headObject(bucket, key) {
     var parameter = {
         Bucket: bucket,
         Key: key,
     };
 
     return s3.headObject(parameter).promise();
 }
 

// This function returns a presigned URL that we can use to PUT an image/tiff object to S3 bucket.
// Input parameters: 
//    Bucket name
//    Key (Object name in S3)
//    Metadata JSON
 async function getPreSignedUrlForAFile(bucket, key, metadata) {
     // expiryTime will be returned in minutes.
     // Default to 15 mins if no value is set.
     let expiryTime = await cacheManager.get('presignedUrl_put_expiry_time', secretsManager.getSecretValue, conf.get('aws.presignedUrl.putObjectExpiryPath'), 600) || 15;
     var parameter = {
         Bucket: bucket,
         Key: key,
         Expires: expiryTime * 60,
         ContentType: 'image/tiff',
         Metadata: metadata,
         ServerSideEncryption: 'AES256',
     };
     return s3.getSignedUrlPromise('putObject', parameter);
 }
 
 module.exports = {
     getPreSignedUrl,
     headObject,
     getPreSignedUrlForAFile
 };