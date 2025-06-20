#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { getConfigFromFile } from '../src/infraConfig';
import { ReefguideStack } from '../src/infra';

// Read the config file name from the environment variable
const configFileName = process.env.CONFIG_FILE_NAME;

if (!configFileName) {
  throw new Error(
    'CONFIG_FILE_NAME environment variable is not set. Please specify the name of the file in configs/. Just include the file name e.g. dev.json.'
  );
}

// Validate the configuration
const config = getConfigFromFile(`configs/${configFileName}`);

const app = new cdk.App();
new ReefguideStack(app, config.stackName, {
  env: { region: config.aws.region, account: config.aws.account },
  config: config
});
