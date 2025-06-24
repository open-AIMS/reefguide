import { z } from 'zod';

// Zod schema for environment variables validation with defaults
const envSchema = z.object({
  ADRIA_API_URL: z
    .string()
    .describe('The ADRIA API endpoint')
    .url('ADRIA_API_URL must be a valid URL'),
  WEB_API_URL: z
    .string()
    .describe('The reefguide web API endpoint')
    .url('WEB_API_URL must be a valid URL')
});

// Interface for the structured environment configuration
export interface EnvironmentConfig {
  reefGuideApiUrl: string;
  adriaApiUrl: string;
  webApiUrl: string;
}

// Type for raw environment variables
type EnvVars = z.infer<typeof envSchema>;

function buildConfig(): EnvironmentConfig {
  // Get environment variables (let Zod handle defaults)
  const rawEnv = {
    ADRIA_API_URL: import.meta.env.NG_APP_ADRIA_API_URL,
    WEB_API_URL: import.meta.env.NG_APP_WEB_API_URL
  };

  // Validate environment variables using Zod (with defaults applied)
  const validatedEnv: EnvVars = envSchema.parse(rawEnv);

  // Transform to the structured interface
  return {
    // TODO: remove this URL - API does not exist anymore
    reefGuideApiUrl: 'http://todo-remove.com',
    adriaApiUrl: validatedEnv.ADRIA_API_URL,
    webApiUrl: validatedEnv.WEB_API_URL + '/api'
  };
}

// Singleton - buildConfig runs only once
export const environment: EnvironmentConfig = buildConfig();
