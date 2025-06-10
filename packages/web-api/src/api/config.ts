import {z} from 'zod';

/**
 * Environment variable schema definition using Zod
 */
const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number),
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  JWT_KEY_ID: z.string(),
  API_DOMAIN: z.string().url(),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  AWS_REGION: z.string(),
  ECS_CLUSTER_NAME: z.string(),
  ECS_SERVICE_NAME: z.string(),
  S3_BUCKET_NAME: z.string(),
  S3_URL_EXPIRY_SECONDS: z.number().default(3600),
  S3_MAX_FILES: z.number().default(10),
  MANAGER_USERNAME: z.string(),
  MANAGER_PASSWORD: z.string(),
  WORKER_USERNAME: z.string(),
  WORKER_PASSWORD: z.string(),
  ADMIN_USERNAME: z.string(),
  ADMIN_PASSWORD: z.string(),
});

/**
 * Configuration interface derived from the environment schema
 */
export interface Config {
  port: number;
  jwt: {
    privateKey: string;
    publicKey: string;
    keyId: string;
  };
  apiDomain: string;
  isDevelopment: boolean;
  database: {
    url: string;
    directUrl: string;
  };
  aws: {
    region: string;
    ecs: {
      clusterName: string;
      serviceName: string;
    };
  };
  s3: {
    bucketName: string;
    urlExpirySeconds: number;
    maxFiles: number;
  };
  creds: {
    managerUsername: string;
    managerPassword: string;
    workerUsername: string;
    workerPassword: string;
    adminUsername: string;
    adminPassword: string;
  };
}

/**
 * Retrieves and validates the configuration from environment variables
 * @returns {Config} The validated configuration object
 * @throws {Error} If environment variables are missing or invalid
 */
export function getConfig(): Config {
  // Parse and validate environment variables
  const env = envSchema.parse(process.env);

  // Replace escaped newlines in JWT keys
  const privateKey = env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  const publicKey = env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

  // Construct the configuration object
  const config: Config = {
    port: env.PORT,
    jwt: {
      privateKey,
      publicKey,
      keyId: env.JWT_KEY_ID,
    },
    apiDomain: env.API_DOMAIN,
    isDevelopment: env.NODE_ENV !== 'production',
    database: {
      url: env.DATABASE_URL,
      directUrl: env.DIRECT_URL,
    },
    aws: {
      region: env.AWS_REGION,
      ecs: {
        clusterName: env.ECS_CLUSTER_NAME,
        serviceName: env.ECS_SERVICE_NAME,
      },
    },
    s3: {
      bucketName: env.S3_BUCKET_NAME,
      maxFiles: env.S3_MAX_FILES,
      urlExpirySeconds: env.S3_URL_EXPIRY_SECONDS,
    },
    creds: {
      workerPassword: env.WORKER_PASSWORD,
      workerUsername: env.WORKER_USERNAME,
      managerPassword: env.MANAGER_PASSWORD,
      managerUsername: env.MANAGER_USERNAME,
      adminUsername: env.ADMIN_USERNAME,
      adminPassword: env.ADMIN_PASSWORD,
    },
  };

  // Log configuration in non-production environments
  if (config.isDevelopment) {
    console.debug('API Configuration:', JSON.stringify(config, null, 2));
  }

  // Update process.env with parsed values
  process.env.DATABASE_URL = config.database.url;
  process.env.DIRECT_URL = config.database.directUrl;

  return config;
}

export const config = getConfig();
