import * as fs from 'fs';
import * as path from 'path';
import * as z from 'zod';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export const MonitoringSchema = z.object({
  /** The ARN of the Sentry DSN for the web API */
  webApiSentryDsn: z.string().url().optional(),
  /** The ARN of the Sentry DSN for the app */
  appSentryDsn: z.string().url().optional(),
  /** The ARN of the Sentry DSN for the capacity manager service */
  capacityManagerSentryDsn: z.string().url().optional()
});
export type MonitoringConfig = z.infer<typeof MonitoringSchema>;

export const ReefGuideFrontendConfigSchema = z.object({
  /** The index document of the website */
  indexDocument: z.string().default('index.html'),
  /** The error document of the website */
  errorDocument: z.string().default('error.html'),
  /** The app name to display in frontend */
  appName: z.string().min(1, 'App name must not be empty').default('ReefGuide'),
  /** The email address of the admin user displayed as a contact email for
   * requesting access */
  adminEmail: z.string().email()
});
export type ReefGuideFrontendConfig = z.infer<typeof ReefGuideFrontendConfigSchema>;

// These are the values needed inside the API secret object - they are validated
// at runtime.
export const ApiSecretConfigSchema = z.object({
  // prisma db url
  DATABASE_URL: z.string(),
  // prisma direct url for migrations etc
  DIRECT_URL: z.string(),
  // JWT configuration
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  JWT_KEY_ID: z.string()
});
export type ApiSecretConfig = z.infer<typeof ApiSecretConfigSchema>;

export const WebAPIConfigSchema = z.object({
  // ARN containing all the deployment secrets which are exported to ENV
  // variables at lambda runtime
  apiSecretsArn: z.string(),
  // Node env runtime variable e.g. development, production
  nodeEnv: z.string().default('development'),
  // Server port
  port: z.number().default(5000),
  // Defaults to lambda mode
  mode: z.object({
    ecs: z
      .object({
        /** The number of CPU units for the Fargate task */
        cpu: z.number().int().positive(),
        /** The amount of memory (in MiB) for the Fargate task */
        memory: z.number().int().positive(),
        /** Auto scaling configuration for the reefGuide service */
        autoScaling: z.object({
          // Is auto scaling enabled?
          enabled: z.boolean().default(false),
          /** The minimum number of tasks to run */
          minCapacity: z.number().int().positive().default(1),
          /** The maximum number of tasks that can be run */
          maxCapacity: z.number().int().positive().default(3),
          /** The target CPU utilization percentage for scaling */
          targetCpuUtilization: z.number().min(0).max(100).default(70),
          /** The target memory utilization percentage for scaling */
          targetMemoryUtilization: z.number().min(0).max(100).default(95),
          /** The cooldown period (in seconds) before allowing another scale in action */
          scaleInCooldown: z.number().int().nonnegative().default(300),
          /** The cooldown period (in seconds) before allowing another scale out action */
          scaleOutCooldown: z.number().int().nonnegative().default(150)
        })
      })
      .optional(),
    lambda: z.object({}).optional()
  })
});
export type WebAPIConfig = z.infer<typeof WebAPIConfigSchema>;

const DomainsConfigSchema = z.object({
  /** The base domain for all services. Note: Apex domains are not currently supported. */
  baseDomain: z.string(),
  /** The subdomain prefix for the Web REST API in this repo */
  webAPI: z.string().default('web-api'),
  /** The subdomain prefix for the frontend app */
  frontend: z.string().default('app')
});

const DatabaseConfigSchema = z.object({
  /** How large is the instance? */
  instanceSize: z.nativeEnum(ec2.InstanceSize).default(ec2.InstanceSize.SMALL),
  /** How many GB allocated? */
  storageGb: z.number().min(20)
});

// Job worker scaling configuration schema
const JobWorkerScalingSchema = z.object({
  /** Minimum number of worker instances */
  desiredMinCapacity: z.number().int().nonnegative().default(0),
  /** Maximum number of worker instances */
  desiredMaxCapacity: z.number().int().positive().default(5),
  /** Scaling factor for auto-scaling */
  scalingFactor: z.number().positive().default(3.3),
  /** Scaling sensitivity */
  scalingSensitivity: z.number().positive().default(2.6),
  /** Cooldown period in seconds */
  cooldownSeconds: z.number().int().positive().default(60)
});

const SysimageConfigurationSchema = z.object({
  /** What is the absolute path at runtime to the sysimage.so file - this needs to be part of the EFS mount */
  sysimagePath: z.string().default('/data/reefguide/sysimages/ReefGuideWorker.so')
});

// ReefGuide worker configuration schema with defaults
const ReefGuideWorkerConfigSchema = z.object({
  /** Docker image tag (e.g. 'latest', 'v1.0.0') */
  imageTag: z.string().default('latest'),
  /** CPU units for the worker */
  cpu: z.number().int().positive().default(4096),
  /** Memory limit in MiB */
  memoryLimitMiB: z.number().int().positive().default(8192),
  /** Scaling configuration */
  scaling: JobWorkerScalingSchema.default({}),
  /** Sysimage mode? */
  sysimage: SysimageConfigurationSchema.optional()
});

// ADRIA worker configuration schema with defaults
const ADRIAWorkerConfigSchema = z.object({
  /** Docker image tag (e.g. 'latest', 'v1.0.0') */
  imageTag: z.string().default('latest'),
  /** CPU units for the worker */
  cpu: z.number().int().positive().default(8192),
  /** Memory limit in MiB */
  memoryLimitMiB: z.number().int().positive().default(32768),
  /** Scaling configuration */
  scaling: JobWorkerScalingSchema.extend({
    /** Override default scaling sensitivity for ADRIA */
    scalingSensitivity: z.number().positive().default(2.1)
  }).default({})
});

// Capacity manager configuration schema
const CapacityManagerConfigSchema = z.object({
  /** CPU units for capacity manager */
  cpu: z.number().int().positive().default(512),
  /** Memory limit in MiB for capacity manager */
  memoryLimitMiB: z.number().int().positive().default(1024),
  /** Poll interval in milliseconds */
  pollIntervalMs: z.number().int().positive().default(3000)
});

// Workers configuration schema
const WorkersConfigSchema = z.object({
  /** Main worker handling suitability assessments, tests, etc. */
  reefguide: ReefGuideWorkerConfigSchema.default({}),
  /** ADRIA model worker */
  adria: ADRIAWorkerConfigSchema.default({})
});

// Job system configuration schema
const JobSystemConfigSchema = z.object({
  /** Capacity manager configuration */
  capacityManager: CapacityManagerConfigSchema.default({}),
  /** Worker configurations by worker type */
  workers: WorkersConfigSchema.default({})
});

// Define the configuration schema using Zod
export const DeploymentConfigSchema = z.object({
  /** The name of the stack to deploy to cloudformation. Note that changing
   * this will completely redeploy your application. */
  stackName: z.string(),
  /** Attributes of the hosted zone to use */
  hostedZone: z.object({
    id: z.string(),
    name: z.string()
  }),
  certificates: z.object({
    /** ARN of the primary SSL/TLS certificate */
    primary: z.string(),
    /** ARN of the CloudFront SSL/TLS certificate */
    cloudfront: z.string()
  }),
  // where to deploy - routes
  domains: DomainsConfigSchema,
  aws: z.object({
    // AWS Account ID
    account: z.string(),
    // AWS Region
    region: z.string().default('ap-southeast-2')
  }),

  // Configuration for the web API deployment (this repo)
  webAPI: WebAPIConfigSchema,

  // Frontend
  frontend: ReefGuideFrontendConfigSchema,

  // Database configuration - if none provided you will need to supply your own
  // DB connection strings
  db: DatabaseConfigSchema.optional(),

  // Job system configuration
  jobSystem: JobSystemConfigSchema.default({}),

  // Monitoring configuration
  monitoring: MonitoringSchema.optional()
});
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

export const getConfigFromFile = (filePath: string): DeploymentConfig => {
  // Read and parse the JSON file
  const configPath = path.resolve(filePath);
  const configJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Validate the configuration
  return DeploymentConfigSchema.parse(configJson);
};
