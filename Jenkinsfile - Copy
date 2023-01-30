#!/usr/bin/env groovy

def isDevBranch() {
    env.BRANCH_NAME ==~ /develop.*/
}

def isReleaseBranch() {
    env.BRANCH_NAME ==~ /release.*/
}

def isMasterBranch() {
    env.BRANCH_NAME ==~ /master/
}

// def shouldDeploy() {
//     return (
//         isDevBranch() ||
//             isMasterBranch()
//     )
// }

def initializeTerraformLib() {
    library identifier: 'iac-terraform-shared-libraries@master', retriever: modernSCM(
        [$class : 'GitSCMSource',
        remote : 'https://bitbucket.athenahealth.com/scm/di/iac-terraform-shared-libraries.git',
        credentialsId : 'BITBUCKET_READ_ONLY']
    )
}

node('worker') {
     // use this flag to clean up infra created through feature branches before merging to master
    def destroy_infra = false
    def update_prometheus_configs = true
    def push_container_image_to_ecr = true

    def aws_regions = ["us-east-1","us-west-2"]
    def non_prod_aws_acc = '660811125625';
    def dev_config_dir = 'monitoring/dev-faxing-dev/'
    def dev_west_config_dir = 'monitoring/dev-faxing-dev-west/'
    def int_config_dir = 'monitoring/dev-faxing-int/'
    def grafana_default_graphs_dir = 'monitoring/grafana-default-dashboards/'
    def non_prod_s3_bucket = "lmm-apps-${non_prod_aws_acc}-us-east-1"
    def non_prod_west2_s3_bucket = "lmm-apps-${non_prod_aws_acc}-us-west-2"
    def non_prod_iam_role = "arn:aws:iam::${non_prod_aws_acc}:role/StackBuilder"

    def prod_aws_acc = '820315363989';
    def prod_config_dir = 'monitoring/prod-faxing-prod/'
    def prod_s3_bucket = "lmm-apps-${prod_aws_acc}-us-east-1"
    def prod_iam_role = "arn:aws:iam::${prod_aws_acc}:role/StackBuilder"

    def accountID
    String env_key
    if (isMasterBranch()) {
        accountID = prod_aws_acc
        env_key = "prod"
    }
    else if (isReleaseBranch()) {
        accountID = non_prod_aws_acc
        env_key = "int"
    }
    else {
        accountID = non_prod_aws_acc
        env_key = "dev"
    }

    def pipeline
    def testRunner
    def image
    String imageName

    stage('Prepare Pipeline') {
      pipeline = new cicd.Pipeline()
      testRunner = pipeline.getTestRunnerInstance([
        language: 'node',
      ])
      // Prepare the workspace
      pipeline.cleanupAndCheckout()
    }

    def runSCAScan = false;
    if(runSCAScan) {
        SCAScan();
    }

    stage('Render App Definition') {
        nodeImage = docker.image('node');

        nodeImage.inside() {
            withEnv(['npm_config_cache=/${WORKSPACE}/npm-cache']) {
                sh('npm install handlebars-render')
            }
        }
    }

    stage('Build Service Image') {
        image = pipeline.buildDockerImage([
            appName: 'inboundfaxing',
            appVersion: '0.0.6'
        ])
    }

    stage('Integration Tests') {
        // TODO
    }

    stage('API Contract Tests') {
        // TODO
    }

    stage('Push Image') {
        imageName = pipeline.pushContainerImage([
            image : image
        ])
    }

    dir('shared-groovy-library') {
        git(
            url: 'https://bitbucket.athenahealth.com/scm/anml/shared-groovy.git',
            branch: 'master',
            credentialsId: 'BITBUCKET_READ_ONLY',
        );
        utils = load 'utils.groovy'
    }

    stage('Push docker Image to ECR') {
        // East region to be added later
        if ((isMasterBranch() || isDevBranch()) && push_container_image_to_ecr) {
            def regions = ["us-west-2"];
            def awsCreds = utils.getAssumeRoleCredentials([role: 'StackBuilder', account: "${accountID}"])
            for(region in regions) {
                withEnv(["AWS_DEFAULT_REGION=${region}", "AWS_ACCESS_KEY_ID=${awsCreds.AccessKeyId}", "AWS_SECRET_ACCESS_KEY=${awsCreds.SecretAccessKey}", "AWS_SESSION_TOKEN=${awsCreds.SessionToken}"]) {
                    String repo = "${accountID}.dkr.ecr.${region}.amazonaws.com"
                    String service_name = "faxing_ecr_${env_key}"
                    String tag = "${env_key}-latest"
                    String ecrImageName = "${repo}/${service_name}:${tag}"
                    sh("aws ecr get-login --region ${region}");
                    def loginScript = sh(returnStdout: true, script: "aws ecr get-login --region ${region} | cut -d' ' -f 6").trim();
                    sh("docker login -u AWS -p  $loginScript https://${accountID}.dkr.ecr.${region}.amazonaws.com");
                    sh("docker tag ${imageName} ${ecrImageName}");
                    sh("docker push ${ecrImageName}");
                }
            }
        }
	}

    stage('Invoke Infra Build') {
        initializeTerraformLib();
        def branchName = env.BRANCH_NAME.replaceAll('\\/', '-').toLowerCase().take(30)
        echo "branchName: ${branchName}"
       if (destroy_infra) {
                // if workspaces_to_destroy and envs_to_destroy are not passed, all infra created through the branch will be destroyed.
                if (isMasterBranch()) {
                    def infrapipeline = IacTerraform.destroyInfra(["entrypoint": 'iac', "workspaces_to_destroy": ['cldt-inboundfaxing-prod-useast1-aws'], "custom_vars": [container_image: imageName]])
                }
                else if (isDevBranch()) {
                    def infrapipeline = IacTerraform.destroyInfra(["entrypoint": 'iac', "workspaces_to_destroy": ['cldt-inboundfaxing-workspace'], "custom_vars": [container_image: imageName], "envs_to_destroy":['dev']])
                }
                else if (isReleaseBranch()) {
                    def infrapipeline = IacTerraform.destroyInfra(["entrypoint": 'iac', "workspaces_to_destroy": ['cldt-inboundfaxing-int-useast1-aws'], "custom_vars": [container_image: imageName]])
                }
                echo 'Destroy infra completed'
        } else {
            def infrapipeline = IacTerraform.buildInfra(["custom_vars": [container_image: imageName], "tf_log_mode": 'warn'])
        }
    }
    stage('Workspace Output') {
        if (destroy_infra == false) {
                if (isMasterBranch()) {
                    prod_workspace_outputs = IacTerraform.getWorkspaceOutput(["workspace_name": "cldt-inboundfaxing-prod-useast1-aws", "environment": "prod"])
                } else if (isDevBranch()) {
                    dev_workspace_outputs = IacTerraform.getWorkspaceOutput(["workspace_name": "cldt-inboundfaxing-dev-useast1-aws", "environment": "dev"])
                } else if (isReleaseBranch()) {
                    int_workspace_outputs = IacTerraform.getWorkspaceOutput(["workspace_name": "cldt-inboundfaxing-int-useast1-aws", "environment": "int"])
                }
        }
    }

    stage('Deploying Prometheus Configuration to S3') {
        if (update_prometheus_configs) {
            for (aws_region in aws_regions) {
                assumeAWSRole(non_prod_iam_role, aws_region) {
                    if (aws_region == "us-west-2") {
                        // I believe jenkins workers have the AWS CLI as we didn't have to do anything special in
                        // https://bitbucket.athenahealth.com/projects/CLNF/repos/spellcheck-aws-infra/browse/Jenkinsfile#101
                        // so I suspect docker.image(...).inside() is not needed
                        docker.image('docker.artifactory.aws.athenahealth.com/aws-cli:1.14.58').inside() {
                            // Dev metric stack
                            sh "aws s3 cp ${dev_west_config_dir} s3://${non_prod_west2_s3_bucket}/${dev_west_config_dir} --recursive";
                            sh "aws s3 cp ${grafana_default_graphs_dir} s3://${non_prod_west2_s3_bucket}/${grafana_default_graphs_dir} --recursive";
                        }
                        echo 'Pushing prometheus configuration to dev is completed'
                    } else {
                        docker.image('docker.artifactory.aws.athenahealth.com/aws-cli:1.14.58').inside() {
                            // Dev metric stack
                            sh "aws s3 cp ${dev_config_dir} s3://${non_prod_s3_bucket}/${dev_config_dir} --recursive";

                            // Int metric stack
                            sh "aws s3 cp ${int_config_dir} s3://${non_prod_s3_bucket}/${int_config_dir} --recursive";
                            sh "aws s3 cp ${grafana_default_graphs_dir} s3://${non_prod_s3_bucket}/${grafana_default_graphs_dir} --recursive";
                        }
                        echo 'Pushing prometheus configuration to dev and int are completed'
                    }
                }
            }

            if (env.BRANCH_NAME == 'master') {
                assumeAWSRole(prod_iam_role, aws_region) {
                    docker.image('docker.artifactory.aws.athenahealth.com/aws-cli:1.14.58').inside() {
                        sh "aws s3 cp ${prod_config_dir} s3://${prod_s3_bucket}/${prod_config_dir} --recursive"
                        sh "aws s3 cp ${grafana_default_graphs_dir} s3://${prod_s3_bucket}/${grafana_default_graphs_dir} --recursive";
                    }
                    echo 'Pushing prometheus configuration to prod completed'
                }
            }
        } else {
            echo 'Pushing Prometheus Configuration to S3 Skipped'
        }
    }
    echo 'Deployment completed'

}



