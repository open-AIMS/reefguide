import {z} from 'zod';

// Schema for validating environment variables directly
const EnvVarsSchema = z.object({
  API_ENDPOINT: z.string().url('Invalid API endpoint URL'),
  JOB_TYPES: z.string().min(1, 'At least one job type must be specified'),
  POLL_INTERVAL_MS: z
    .string()
    .optional()
    .default('1000')
    .transform(val => parseInt(val))
    .pipe(z.number().min(1000)),
  MAX_CONCURRENT_JOBS: z
    .string()
    .optional()
    .default('1')
    .transform(val => parseInt(val))
    .pipe(z.number().min(1)),
  PORT: z
    .string()
    .optional()
    .default('3000')
    .transform(val => parseInt(val))
    .pipe(z.number().positive()),
  WORKER_USERNAME: z.string().min(1, 'Username for the web API is required'),
  WORKER_PASSWORD: z.string().min(1, 'Password for the web API is required'),
});

// Main configuration schema
export const ConfigSchema = z.object({
  // API connection settings
  apiEndpoint: z.string().url(),

  // Worker behavior
  jobTypes: z.array(z.string().min(1)),
  pollIntervalMs: z.number().min(1000).default(1000),
  maxConcurrentJobs: z.number().min(1).default(1),
  // period of inactivity before stopping polling two minutes by default
  idleTimeoutMs: z
    .number()
    .positive()
    .default(2 * 60 * 1000),

  // HTTP server settings
  port: z.number().min(1).default(3000),

  // Auth settings
  username: z.string().min(1),
  password: z.string().min(1),
});

export type Config = z.infer<typeof ConfigSchema>;

// Load and validate configuration from environment variables
export function loadConfig(): Config {
  // First validate environment variables
  const env = EnvVarsSchema.parse(process.env);

  // Transform validated environment variables into config object
  const config: Partial<Config> = {
    apiEndpoint: env.API_ENDPOINT,
    jobTypes: env.JOB_TYPES.split(',').map(type => type.trim()),
    pollIntervalMs: env.POLL_INTERVAL_MS,
    maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
    port: env.PORT,
    username: env.WORKER_USERNAME,
    password: env.WORKER_PASSWORD,
  };

  // Validate the complete configuration
  return ConfigSchema.parse(config);
}
