import { JobType } from '@reefguide/db';
import { z } from 'zod';

/**
 * Helper function to create a number validator that also accepts string inputs
 * Ensures values meet minimum requirements and handles type conversion
 *
 * @param min - Minimum allowed value (null for no minimum)
 * @param errorMessage - Error message for invalid numbers
 * @param minErrorMessage - Error message for values below minimum
 * @returns A Zod validator that accepts both numbers and strings
 */
const createNumberValidator = (
  min: number | null = null,
  errorMessage = 'Value must be a valid number',
  minErrorMessage = `Value must be at least ${min}`
) => {
  return z.union([
    min !== null ? z.number().min(min, minErrorMessage) : z.number(),
    z.string().transform((val, ctx) => {
      const parsed = Number(val);
      if (isNaN(parsed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: errorMessage
        });
        return z.NEVER;
      }
      if (min !== null && parsed < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: minErrorMessage
        });
        return z.NEVER;
      }
      return parsed;
    })
  ]);
};

/**
 * Schema for scaling configuration
 * Defines how the capacity manager should scale resources
 */
export const ScalingConfiguration = z.object({
  min: createNumberValidator(
    0,
    'Minimum capacity must be a valid number',
    'Minimum capacity must be non-negative'
  ),
  max: createNumberValidator(
    0,
    'Maximum capacity must be a valid number',
    'Maximum capacity must be non-negative'
  ),
  sensitivity: createNumberValidator(
    0,
    'Sensitivity must be a valid number',
    'Logarithmic sensitivity must be non-negative'
  ),
  factor: createNumberValidator(
    1,
    'Factor must be a valid number',
    'Division factor for jobs - this allows you to consider different job count scales. Must be > 1.'
  ),
  cooldownSeconds: createNumberValidator(
    0,
    'Cooldown seconds must be a valid number',
    'Cooldown seconds must be non-negative'
  )
});

/**
 * Configuration schema for job types and their corresponding ECS resources
 * Defines the AWS resources and scaling parameters for each job type
 */
export const RawJobTypeConfigSchema = z.object({
  taskDefinitionArn: z.string().min(1, 'Task Definition ARN is required'),
  clusterArn: z.string().min(1, 'Cluster ARN is required'),
  scaling: ScalingConfiguration,
  // Security group ARN for this task
  securityGroup: z.string().min(1, 'Security group ARN is required')
});

export type RawJobTypeConfig = z.infer<typeof RawJobTypeConfigSchema>;

/**
 * Base configuration schema for environment variables
 * Validates core application settings from environment
 */
export const BaseEnvConfigSchema = z.object({
  POLL_INTERVAL_MS: createNumberValidator(
    500,
    'Poll interval expects valid number',
    'Minimum poll interval is 500(ms)'
  ),
  API_ENDPOINT: z.string().url('API endpoint must be a valid URL'),
  AWS_REGION: z.string().min(1, 'AWS region is required'),
  API_USERNAME: z.string().min(1, 'API username is required'),
  API_PASSWORD: z.string().min(1, 'API password is required'),
  VPC_ID: z.string().min(1, 'VPC ID is required'),
  SENTRY_DSN: z.string().url().optional().describe('Sentry DSN, if desired')
});

export const JobTypeConfigSchema = RawJobTypeConfigSchema.extend({
  jobTypes: z.array(z.nativeEnum(JobType))
});
export type JobTypeConfig = z.infer<typeof JobTypeConfigSchema>;
/**
 * Final configuration schema structure
 * Combines all configuration elements into a complete application config
 */
export const ConfigSchema = z.object({
  pollIntervalMs: createNumberValidator(
    500,
    'Poll interval expects valid number',
    'Minimum poll interval is 500(ms)'
  ),
  apiEndpoint: z.string().url('API endpoint must be a valid URL'),
  region: z.string().min(1, 'AWS region is required'),
  jobTypes: z.record(z.nativeEnum(JobType), JobTypeConfigSchema),
  auth: z.object({
    email: z.string().min(1, 'Email is required'),
    password: z.string().min(1, 'Password is required')
  }),
  vpcId: z.string().min(1, 'VPC ID is required'),
  sentryDsn: z.string().url().optional().describe('Sentry DSN, if desired')
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Builds job type configuration from environment variables
 * Extracts and validates settings for a specific job type
 *
 * @param env - Validated environment variables
 * @param jobType - The job type to build configuration for
 * @returns Configuration for the specified job type
 */
function buildJobTypeConfig(
  env: Record<string, string | number>,
  jobType: string
): RawJobTypeConfig {
  console.debug(`Building config for job type: ${jobType}`);

  const optimisticParse = {
    taskDefinitionArn: env[`${jobType}_TASK_DEF`] as string,
    clusterArn: env[`${jobType}_CLUSTER`] as string,
    scaling: {
      min: env[`${jobType}_MIN_CAPACITY`] as number,
      max: env[`${jobType}_MAX_CAPACITY`] as number,
      cooldownSeconds: env[`${jobType}_COOLDOWN`] as number,
      sensitivity: env[`${jobType}_SENSITIVITY`] as number,
      factor: env[`${jobType}_FACTOR`] as number
    },
    securityGroup: env[`${jobType}_SECURITY_GROUP`] as string
  } satisfies RawJobTypeConfig;

  try {
    const validatedConfig = RawJobTypeConfigSchema.parse(optimisticParse);
    console.debug(`Validated config for job type: ${jobType}`);
    return validatedConfig;
  } catch (e) {
    console.error(`Job type ${jobType} did not have valid environment variables`, { error: e });
    throw e;
  }
}

/**
 * Loads and validates application configuration from environment variables
 * Dynamically handles all job types defined in the JobType enum
 *
 * @returns Validated configuration object
 * @throws Error if configuration validation fails
 */
export function loadConfig(): Config {
  console.info('Loading application configuration');

  try {
    // Force types here as we zod process everything!
    const env = process.env as Record<string, string | number>;
    // Initialize job types configuration object
    const jobTypesConfig: Record<string, RawJobTypeConfig & { jobTypes?: JobType[] }> = {};

    // Build configuration for each job type
    Object.values(JobType).forEach(jobType => {
      const typeString = jobType.toString();
      console.debug(`Processing job type: ${typeString}`);
      jobTypesConfig[typeString] = buildJobTypeConfig(env, typeString);
    });

    // Group the job types by task ARN
    console.debug('Grouping job types by task ARN');
    const arnToTypes: Map<string, JobType[]> = new Map();
    for (const [jobType, config] of Object.entries(jobTypesConfig)) {
      arnToTypes.set(
        config.taskDefinitionArn,
        (arnToTypes.get(config.taskDefinitionArn) ?? []).concat([jobType as JobType])
      );
    }

    // Update with grouped types
    for (const config of Object.values(jobTypesConfig)) {
      config.jobTypes = arnToTypes.get(config.taskDefinitionArn);
    }

    // Construct the complete config object with validated values
    const config: Config = {
      pollIntervalMs: env.POLL_INTERVAL_MS as number,
      apiEndpoint: env.API_ENDPOINT as string,
      region: env.AWS_REGION as string,
      jobTypes: jobTypesConfig,
      auth: {
        email: env.API_USERNAME as string,
        password: env.API_PASSWORD as string
      },
      vpcId: env.VPC_ID as string,
      sentryDsn: env.SENTRY_DSN as string | undefined
    };

    // Validate the entire config object
    console.debug('Validating complete configuration');
    const validatedConfig = ConfigSchema.parse(config);
    console.info('Configuration successfully loaded and validated');
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format Zod validation errors for better readability
      const formattedErrors = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      console.error('Configuration validation failed', {
        errors: formattedErrors
      });
      throw new Error(`Configuration validation failed:\n${formattedErrors}`);
    }
    console.error('Failed to load configuration', { error });
    throw new Error(`Failed to load configuration: ${error}`);
  }
}

function setupConfig(): Config {
  console.log('Setting up config');
  try {
    console.log('Validating configuration');
    // Load and validate configuration from environment variables
    return loadConfig();
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:', { errors: error.errors });
    } else {
      console.error('Failed to load configuration:', { error });
    }
    // Exit with error code if configuration cannot be loaded
    process.exit(1);
  }
}

export const config = setupConfig();
