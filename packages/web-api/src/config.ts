import { z } from 'zod';
import { MinioConfig } from './services/s3Storage';
import { JobType } from '@reefguide/db';
import { createEmailService, IEmailService, EmailServiceType } from './services/emailService';

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
  JOB_EXPIRY_MINUTES: z
    .string()
    .optional()
    .default('120')
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, {
      message: 'JOB_EXPIRY_MINUTES must be a positive number'
    }),
  DISABLE_CACHE: z
    .string()
    .default('false')
    .transform(val => ['true'].includes(val.toLowerCase())),
  // Comma separated list of job types to not cache
  DISABLE_SPECIFIC_CACHES: z
    .string()
    .optional()
    .transform((val, ctx) => {
      // If provided, split and parse into job types
      if (val) {
        const validJobTypes: JobType[] = [];
        for (const item of val.split(',')) {
          try {
            const cleanedJobType = item.trim().toUpperCase();
            const jobType = JobType[cleanedJobType as keyof typeof JobType];

            if (jobType !== undefined) {
              validJobTypes.push(jobType);
            } else {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Invalid job type: ${cleanedJobType}`
              });
              return z.NEVER;
            }
          } catch (error) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Error processing job type: ${item.trim()}`
            });
            return z.NEVER;
          }
        }
        return validJobTypes;
      }
      return undefined;
    }),
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
    }),
  SENTRY_DSN: z.string().url().optional().describe('Sentry DSN for error tracking'),
  // Email configuration
  EMAIL_SERVICE_MODE: z.enum(['SMTP', 'MOCK']).default('MOCK'),
  EMAIL_FROM_ADDRESS: z.string().email().optional().default('noreply@example.com'),
  EMAIL_FROM_NAME: z.string().optional().default('ReefGuide Notification System'),
  EMAIL_REPLY_TO: z.string().email().optional(),
  // SMTP configuration - only required when EMAIL_SERVICE_MODE is SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .default('false')
    .transform(val => val === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_CACHE_EXPIRY_SECONDS: z
    .string()
    .optional()
    .default('300')
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, {
      message: 'SMTP_CACHE_EXPIRY_SECONDS must be a positive number'
    })
});

/**
 * Email configuration interface
 */
export interface EmailConfig {
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

/**
 * SMTP configuration interface
 */
export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  cacheExpirySeconds: number;
}

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
  cacheOptions: {
    disableCache: boolean;
    disableSpecificCaches?: JobType[];
  };
  email: {
    serviceMode: EmailServiceType;
    config: EmailConfig;
    smtp?: SMTPConfig;
  };
  // Optional Sentry DSN for error tracking
  sentryDsn?: string;
  // How many minutes before non-terminated jobs expire
  jobExpiryMinutes: number;
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

  // Configure email settings
  const emailServiceMode =
    env.EMAIL_SERVICE_MODE === 'SMTP' ? EmailServiceType.SMTP : EmailServiceType.MOCK;

  const emailConfig: EmailConfig = {
    fromEmail: env.EMAIL_FROM_ADDRESS,
    fromName: env.EMAIL_FROM_NAME,
    replyTo: env.EMAIL_REPLY_TO
  };

  let smtpConfig: SMTPConfig | undefined = undefined;
  if (emailServiceMode === EmailServiceType.SMTP) {
    if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASSWORD) {
      const missingConfig = [];
      if (!env.SMTP_HOST) missingConfig.push('SMTP_HOST');
      if (!env.SMTP_PORT) missingConfig.push('SMTP_PORT');
      if (!env.SMTP_USER) missingConfig.push('SMTP_USER');
      if (!env.SMTP_PASSWORD) missingConfig.push('SMTP_PASSWORD');

      const providedConfig = {
        EMAIL_SERVICE_MODE: env.EMAIL_SERVICE_MODE,
        SMTP_HOST: env.SMTP_HOST || '[missing]',
        SMTP_PORT: env.SMTP_PORT || '[missing]',
        SMTP_SECURE: env.SMTP_SECURE.toString(),
        SMTP_USER: env.SMTP_USER ? '[provided]' : '[missing]',
        SMTP_PASSWORD: env.SMTP_PASSWORD ? '[provided]' : '[missing]',
        SMTP_CACHE_EXPIRY_SECONDS: env.SMTP_CACHE_EXPIRY_SECONDS.toString()
      };

      throw new Error(
        `SMTP configuration is incomplete when EMAIL_SERVICE_MODE is 'SMTP'. Missing required values: ${missingConfig.join(', ')}.\n` +
          `Provided configuration: ${JSON.stringify(providedConfig, null, 2)}`
      );
    }
    smtpConfig = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD
      },
      cacheExpirySeconds: env.SMTP_CACHE_EXPIRY_SECONDS
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
    cacheOptions: {
      disableCache: env.DISABLE_CACHE,
      disableSpecificCaches: env.DISABLE_SPECIFIC_CACHES
    },
    email: {
      serviceMode: emailServiceMode,
      config: emailConfig,
      smtp: smtpConfig
    },
    sentryDsn: env.SENTRY_DSN,
    jobExpiryMinutes: env.JOB_EXPIRY_MINUTES
  };

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

// Export email service configuration and instance
export const EMAIL_SERVICE: IEmailService = createEmailService({
  serviceType: config.email.serviceMode,
  emailConfig: config.email.config,
  serviceConfig: config.email.smtp
});
