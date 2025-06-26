// Define the type of the environment variables.
declare interface Env {
  readonly NODE_ENV: string;
  NG_APP_ADRIA_API_URL: string;
  NG_APP_WEB_API_URL: string;
  NG_APP_SPLASH_ADMIN_EMAIL: string;
  NG_APP_SPLASH_APP_NAME: string;
  NG_APP_SPLASH_SHOW_BACKGROUND_MAP: string;
}

declare interface ImportMeta {
  readonly env: Env;
}
