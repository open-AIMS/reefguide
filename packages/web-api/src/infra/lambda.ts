// @ts-ignore
import schema from '../db/schema.prisma';
// @ts-ignore
import x from '../../node_modules/.prisma/client/libquery_engine-rhel-openssl-1.0.x.so.node';

if (process.env.NODE_ENV !== 'production') {
  console.debug(schema, x);
}

import axios from 'axios';
import { ApiSecretConfig, ApiSecretConfigSchema } from './infraConfig';
const serverlessExpress = require('@codegenie/serverless-express');

// persist this between invocations so we aren't repeatedly spinning up express
let handler: any;

interface CredsInterface {
  username: string;
  password: string;
}

async function getSecret(secretId: string): Promise<string> {
  console.log('=== getSecret START ===');
  console.log('Input secretId:', secretId);

  const secretsExtensionEndpoint = `http://localhost:2773/secretsmanager/get?secretId=${secretId}`;
  console.log('Endpoint URL:', secretsExtensionEndpoint);

  const headers = {
    'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN!,
  };
  console.log('Headers:', {
    ...headers,
    'X-Aws-Parameters-Secrets-Token': headers['X-Aws-Parameters-Secrets-Token']
      ? '[PRESENT]'
      : '[MISSING]',
  });

  try {
    console.log('Making HTTP request to Secrets Manager...');
    const response = await axios.get(secretsExtensionEndpoint, { headers });
    console.log('Raw response received:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data, // Be careful with sensitive data in logs
    });

    if (!response.data) {
      console.error('Response data is empty');
      throw new Error('Empty response from Secrets Manager');
    }

    const secretString =
      response.data.SecretString || response.data.secretString;
    console.log('Secret string type:', typeof secretString);
    console.log(
      'Secret string length:',
      secretString ? secretString.length : 0,
    );

    if (!secretString) {
      console.error('SecretString not found in response');
      throw new Error('SecretString missing from response');
    }

    console.log('=== getSecret END ===');
    return secretString;
  } catch (error: any) {
    console.error('=== getSecret ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', {
        response: {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers,
        },
        request: {
          method: error.config?.method,
          url: error.config?.url,
          headers: error.config?.headers,
        },
      });
    }
    throw error;
  }
}

async function getJsonSecret<T = any>(secretId: string): Promise<T> {
  console.log('=== getJsonSecret START ===');
  console.log('Attempting to get secret with ID:', secretId);

  let secret: string | undefined;
  try {
    secret = await getSecret(secretId);

    if (!secret) {
      console.error('Received empty secret');
      throw new Error('Empty secret received');
    }
    console.log('Attempting to parse secret as JSON...');
    const parsed = JSON.parse(secret);
    console.log('Successfully parsed JSON. Result type:', typeof parsed);
    console.log('Parsed object keys:', Object.keys(parsed));

    console.log('=== getJsonSecret END ===');
    return parsed as T;
  } catch (error: any) {
    console.error('=== getJsonSecret ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    if (error instanceof SyntaxError) {
      console.error(
        'JSON parsing failed. First 50 chars of input:',
        secret?.substring(0, 50),
      );
    }

    throw error;
  }
}

function exportToEnv(obj: Record<string, string>): void {
  console.log('=== exportToEnv START ===');
  console.log('Received object with keys:', Object.keys(obj));

  try {
    if (typeof process === 'undefined' || typeof process.env !== 'object') {
      throw new Error('process.env is not available or not writable');
    }

    let exportedCount = 0;
    for (const [key, value] of Object.entries(obj)) {
      console.log(
        `Exporting key: ${key}, value length: ${String(value).length}`,
      );
      process.env[key] = String(value);
      exportedCount++;
    }

    console.log(
      `Successfully exported ${exportedCount} variables to process.env`,
    );
    console.log('=== exportToEnv END ===');
  } catch (error: any) {
    console.error('=== exportToEnv ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

exports.handler = async (event: any, context: any) => {
  console.log('=== Lambda Handler START ===');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', {
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    awsRequestId: context.awsRequestId,
  });

  if (handler) {
    console.log('Using existing handler');
    return handler(event, context);
  } else {
    console.log('Initializing new handler');
    try {
      // Log environment variables (excluding sensitive values)
      const secretArn = process.env.API_SECRETS_ARN;
      const workerCredsArn = process.env.WORKER_CREDS_ARN;
      const managerCredsArn = process.env.MANAGER_CREDS_ARN;
      const adminCredsArn = process.env.ADMIN_CREDS_ARN;

      if (
        [secretArn, workerCredsArn, managerCredsArn, adminCredsArn].some(
          v => !v,
        )
      ) {
        throw new Error('Missing environment variables for initialisation.');
      }

      console.log('Fetching secrets...');
      const secretJson = await getJsonSecret<ApiSecretConfig>(secretArn!);
      console.log('API secrets fetched successfully');

      const managerCreds = await getJsonSecret<CredsInterface>(
        managerCredsArn!,
      );
      console.log('Manager credentials fetched successfully');

      const workerCreds = await getJsonSecret<CredsInterface>(workerCredsArn!);
      console.log('Worker credentials fetched successfully');

      const adminCreds = await getJsonSecret<CredsInterface>(adminCredsArn!);
      console.log('Admin credentials fetched successfully');

      console.log('Validating secret schema...');
      try {
        ApiSecretConfigSchema.parse(secretJson);
        console.log('Secret schema validation successful');
      } catch (e) {
        console.error('Schema validation failed:', e);
        throw e;
      }

      console.log('Exporting secrets to environment...');
      exportToEnv({
        ...secretJson,
        ...{
          MANAGER_USERNAME: managerCreds.username,
          MANAGER_PASSWORD: managerCreds.password,
        },
        ...{
          WORKER_USERNAME: workerCreds.username,
          WORKER_PASSWORD: workerCreds.password,
        },
        ...{
          ADMIN_USERNAME: adminCreds.username,
          ADMIN_PASSWORD: adminCreds.password,
        },
      });

      console.log('Importing API setup...');
      const { default: app } = await import('../api/apiSetup');

      console.log('Creating serverless express handler...');
      handler = serverlessExpress({ app });

      console.log('=== Lambda Handler END ===');
      return handler(event, context);
    } catch (error: any) {
      console.error('=== Lambda Handler ERROR ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }
};
