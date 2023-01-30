#!/bin/bash
echo "Setting up host and port for postgres"
output=$(athena-aws-env)
eval $output
#export POSTGRES_HOST_AND_PORT=$(curl -s -X POST $DF_SERVICEDISCOVERY_API \
#	-H "Content-Type: application/json" \
#	-H "Accept: text/html" \
#	-d "{ \"username\": \"$POSTGRES_USERNAME\", \"password\": \"$POSTGRES_PASSWORD\"}")
#echo $POSTGRES_HOST_AND_PORT
#export POSTGRES_HOST=$(echo $POSTGRES_HOST_AND_PORT | cut -f1 -d ":")
#export POSTGRES_PORT=$(echo $POSTGRES_HOST_AND_PORT | cut -f2 -d ":")
#echo "Done setting up host and port for postgres"
eval $output && node ./bin/www;
