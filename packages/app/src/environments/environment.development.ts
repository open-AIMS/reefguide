import { z } from 'zod';

// Zod schema for environment variables validation with defaults
const envSchema = z.object({
  ADRIA_API_URL: z
    .string()
    .url('ADRIA_API_URL must be a valid URL')
    .default('http://localhost:4200/adria-api'),
  WEB_API_URL: z.string().url('WEB_API_URL must be a valid URL').default('http://localhost:5000'),
  SPLASH_ADMIN_EMAIL: z
    .string()
    .email('SPLASH_ADMIN_EMAIL must be a valid email')
    .default('admin@example.com'),
  SPLASH_APP_NAME: z.string().default('MADAME'),
  SPLASH_SHOW_BACKGROUND_MAP: z
    .string()
    .transform(val => val === 'true')
    .default('true')
});

// Interface for the structured environment configuration
export interface EnvironmentConfig {
  reefGuideApiUrl: string;
  adriaApiUrl: string;
  webApiUrl: string;
  splashConfig: {
    adminEmail: string;
    appName: string;
    showBackgroundMap: boolean;
    unauthorizedMessage: string;
  };
}

// Type for raw environment variables
type EnvVars = z.infer<typeof envSchema>;

function buildConfig(): EnvironmentConfig {
  // Get environment variables (let Zod handle defaults)
  const rawEnv = {
    ADRIA_API_URL: import.meta.env.NG_APP_ADRIA_API_URL,
    WEB_API_URL: import.meta.env.NG_APP_WEB_API_URL,
    SPLASH_ADMIN_EMAIL: import.meta.env.NG_APP_SPLASH_ADMIN_EMAIL,
    SPLASH_APP_NAME: import.meta.env.NG_APP_SPLASH_APP_NAME,
    SPLASH_SHOW_BACKGROUND_MAP: import.meta.env.NG_APP_SPLASH_SHOW_BACKGROUND_MAP
  };

  // Validate environment variables using Zod (with defaults applied)
  const validatedEnv: EnvVars = envSchema.parse(rawEnv);

  // Transform to the structured interface
  return {
    // TODO: remove this URL - API does not exist anymore
    reefGuideApiUrl: 'http://todo-remove.com',
    adriaApiUrl: validatedEnv.ADRIA_API_URL,
    webApiUrl: validatedEnv.WEB_API_URL + '/api',
    splashConfig: {
      adminEmail: validatedEnv.SPLASH_ADMIN_EMAIL,
      appName: validatedEnv.SPLASH_APP_NAME,
      showBackgroundMap: validatedEnv.SPLASH_SHOW_BACKGROUND_MAP,
      unauthorizedMessage:
        'Your account needs analyst or administrator access to use this application.'
    }
  };
}

// Singleton - buildConfig runs only once
export const environment: EnvironmentConfig = buildConfig();
