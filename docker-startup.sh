#!/usr/bin/env bash
export EC2_IP=$(curl http://169.254.169.254/latest/meta-data/local-ipv4)
output=$(athena-aws-env)
ret=$?

if [ $ret -eq 0 ]; then
    eval $output 
    trap 'kill -TERM $PID' TERM INT
    node ./bin/www &
    PID=$!
    wait $PID
    trap - TERM INT
    wait $PID
    EXIT_STATUS=$?
else
    exit $ret
fi
