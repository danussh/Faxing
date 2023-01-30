FROM docker-prod.artifactory.aws.athenahealth.com/app-fabric/node:14
WORKDIR /home/athena_user/app

RUN \
  yum install -y epel-release && \
  yum install -y python3 && \
  yum install -y python-pip

RUN pip3.6 install pipenv
RUN pip install --upgrade athena-aws-env --force-reinstall --index-url http://artifactory.aws.athenahealth.com/api/pypi/pypi/simple --index http://artifactory.aws.athenahealth.com/api/pypi/pypi/simple --trusted-host artifactory.aws.athenahealth.com --extra-index-url https://pypi.org/simple

# Copy app
COPY . .

RUN \
  # Change owner of file from root to athena_user
  chown -R athena_user ./ && \
  # Silence install spam, this will retain warnings and cleaning cache.
  npm install --loglevel=warn --no-progress 1>/dev/null && \
  npm cache verify;

USER athena_user

RUN ["chmod",  "+x",  "/home/athena_user/app/startUp.sh"]

EXPOSE 8080
CMD ["/bin/bash", "/home/athena_user/app/startUp.sh"]