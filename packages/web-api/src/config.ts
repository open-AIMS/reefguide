import { z } from 'zod';
import { MinioConfig } from './services/s3Storage';

/**
 * Environment variable schema definition using Zod
 */
const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number),
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  JWT_KEY_ID: z.string(),
  API_DOMAIN: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  AWS_REGION: z.string(),
  S3_BUCKET_NAME: z.string(),
  S3_URL_EXPIRY_SECONDS: z.number().default(3600),
  S3_MAX_FILES: z.number().default(10),
  MINIO_ENDPOINT: z.string().url().optional(),
  MINIO_USERNAME: z.string().optional(),
  MINIO_PASSWORD: z.string().optional(),
  MANAGER_USERNAME: z.string(),
  MANAGER_PASSWORD: z.string(),
  WORKER_USERNAME: z.string(),
  WORKER_PASSWORD: z.string(),
  ADMIN_USERNAME: z.string(),
  ADMIN_PASSWORD: z.string(),
  DISABLE_CACHE: z
    .string()
    .default('false')
    .transform(val => ['true'].includes(val.toLowerCase())),
  // Token configuration - with proper defaults
  ACCESS_TOKEN_EXPIRY_MINUTES: z
    .string()
    .optional()
    .default('10')
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, {
      message: 'ACCESS_TOKEN_EXPIRY_MINUTES must be a positive number'
    }),
  REFRESH_TOKEN_EXPIRY_MINUTES: z
    .string()
    .optional()
    // 48 hours
    .default((48 * 60).toString())
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, {
      message: 'REFRESH_TOKEN_EXPIRY_MINUTES must be a positive number'
    })
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
  };
  s3: {
    minio?: MinioConfig;
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
  tokens: {
    accessTokenExpiryMinutes: number;
    refreshTokenExpiryMinutes: number;
    accessTokenExpirySeconds: number; // Computed convenience property
  };
  disableCache: boolean;
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

  let minio: MinioConfig | undefined = undefined;
  if (env.MINIO_ENDPOINT) {
    if (!env.MINIO_USERNAME || !env.MINIO_PASSWORD) {
      throw new Error(
        'Must provide minio username/password if using minio endpoint (instead of s3)'
      );
    }
    minio = {
      endpoint: env.MINIO_ENDPOINT,
      username: env.MINIO_USERNAME,
      password: env.MINIO_PASSWORD
    };
  }

  // Construct the configuration object
  const config: Config = {
    port: env.PORT,
    jwt: {
      privateKey,
      publicKey,
      keyId: env.JWT_KEY_ID
    },
    apiDomain: env.API_DOMAIN,
    isDevelopment: env.NODE_ENV !== 'production',
    database: {
      url: env.DATABASE_URL,
      directUrl: env.DIRECT_URL
    },
    aws: {
      region: env.AWS_REGION
    },
    s3: {
      minio,
      bucketName: env.S3_BUCKET_NAME,
      maxFiles: env.S3_MAX_FILES,
      urlExpirySeconds: env.S3_URL_EXPIRY_SECONDS
    },
    creds: {
      workerPassword: env.WORKER_PASSWORD,
      workerUsername: env.WORKER_USERNAME,
      managerPassword: env.MANAGER_PASSWORD,
      managerUsername: env.MANAGER_USERNAME,
      adminUsername: env.ADMIN_USERNAME,
      adminPassword: env.ADMIN_PASSWORD
    },
    tokens: {
      accessTokenExpiryMinutes: env.ACCESS_TOKEN_EXPIRY_MINUTES,
      refreshTokenExpiryMinutes: env.REFRESH_TOKEN_EXPIRY_MINUTES,
      // Computed convenience property for seconds
      accessTokenExpirySeconds: env.ACCESS_TOKEN_EXPIRY_MINUTES * 60
    },
    disableCache: env.DISABLE_CACHE
  };

  // Log configuration in non-production environments (excluding sensitive data)
  if (config.isDevelopment) {
    const logConfig = {
      ...config,
      jwt: { keyId: config.jwt.keyId }, // Only log key ID, not the actual keys
      creds: '[HIDDEN]' // Hide credentials from logs
    };
    console.debug('API Configuration:', JSON.stringify(logConfig, null, 2));
  }

  // Update process.env with parsed values
  process.env.DATABASE_URL = config.database.url;
  process.env.DIRECT_URL = config.database.directUrl;

  return config;
}

export const config = getConfig();

// Export token configuration constants for backward compatibility and convenience
export const TOKEN_EXPIRY = config.tokens.accessTokenExpirySeconds;
export const REFRESH_DURATION_MINUTES = config.tokens.refreshTokenExpiryMinutes;
export const REFRESH_DURATION_SECONDS = config.tokens.refreshTokenExpiryMinutes * 60;
