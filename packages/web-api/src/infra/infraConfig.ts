import * as fs from 'fs';
import * as path from 'path';
import * as z from 'zod';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export const ReefGuideFrontendConfigSchema = z.object({
  /** The index document of the website */
  indexDocument: z.string().default('index.html'),
  /** The error document of the website */
  errorDocument: z.string().default('error.html'),
});
export type ReefGuideFrontendConfig = z.infer<
  typeof ReefGuideFrontendConfigSchema
>;

export const ReefGuideAPIConfigSchema = z.object({
  /** ReefGuideAPI.jl docker image */
  reefGuideDockerImage: z.string(),
  /** ReefGuideAPI.jl docker image */
  port: z.number().default(8000),
  /** reefGuide docker image e.g. latest, sha-123456 */
  reefGuideDockerImageTag: z.string().default('latest'),
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
    scaleOutCooldown: z.number().int().nonnegative().default(150),
  }),
  // Optional memory alerting - include configuration if desired
  memoryAlerting: z
    .object({
      /** Email address to send notifications to */
      emailAddress: z
        .string()
        .email('Must provide a valid email address as email alert target.'),
      /** Memory threshold percentage (0-100) */
      averageThreshold: z.number().min(0).max(100).default(85),
      /** Memory threshold percentage (0-100) */
      maxThreshold: z.number().min(0).max(100).default(95),
      /** Number of consecutive evaluation periods that must breach the
       * threshold before alerting */
      evaluationPeriods: z.number().positive().default(2),
      /** Period in seconds over which to calculate the average */
      metricPeriod: z.number().positive().default(60),
    })
    .optional(),
});
export type ReefGuideAPIConfig = z.infer<typeof ReefGuideAPIConfigSchema>;

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
  JWT_KEY_ID: z.string(),
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
          scaleOutCooldown: z.number().int().nonnegative().default(150),
        }),
      })
      .optional(),
    lambda: z.object({}).optional(),
  }),
});
export type WebAPIConfig = z.infer<typeof WebAPIConfigSchema>;

const DomainsConfigSchema = z.object({
  /** The base domain for all services. Note: Apex domains are not currently supported. */
  baseDomain: z.string(),
  /** The subdomain prefix for the ECS ReefGuideAPI service */
  reefGuideAPI: z.string().default('guide-api'),
  /** The subdomain prefix for the Web REST API in this repo */
  webAPI: z.string().default('web-api'),
  /** The subdomain prefix for the frontend app */
  frontend: z.string().default('app'),
});

const DatabaseConfigSchema = z.object({
  /** How large is the instance? */
  instanceSize: z.nativeEnum(ec2.InstanceSize).default(ec2.InstanceSize.SMALL),
  /** How many GB allocated? */
  storageGb: z.number().min(20),
});

// Define the configuration schema using Zod
export const DeploymentConfigSchema = z.object({
  /** The name of the stack to deploy to cloudformation. Note that changing
   * this will completely redeploy your application. */
  stackName: z.string(),
  /** Attributes of the hosted zone to use */
  hostedZone: z.object({
    id: z.string(),
    name: z.string(),
  }),
  certificates: z.object({
    /** ARN of the primary SSL/TLS certificate */
    primary: z.string(),
    /** ARN of the CloudFront SSL/TLS certificate */
    cloudfront: z.string(),
  }),
  // where to deploy - routes
  domains: DomainsConfigSchema,
  aws: z.object({
    // AWS Account ID
    account: z.string(),
    // AWS Region
    region: z.string().default('ap-southeast-2'),
  }),

  // Configuration for the web API deployment (this repo)
  webAPI: WebAPIConfigSchema,

  // Configuration for the ReefGuideAPI deployment
  // (https://github.com/open-AIMS/ReefGuideAPI.jl)
  reefGuideAPI: ReefGuideAPIConfigSchema,

  // Frontend
  frontend: ReefGuideFrontendConfigSchema,

  // Database configuration - if none provided you will need to supply your own
  // DB connection strings
  db: DatabaseConfigSchema.optional(),
});
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

export const getConfigFromFile = (filePath: string): DeploymentConfig => {
  // Read and parse the JSON file
  const configPath = path.resolve(filePath);
  const configJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Validate the configuration
  return DeploymentConfigSchema.parse(configJson);
};
