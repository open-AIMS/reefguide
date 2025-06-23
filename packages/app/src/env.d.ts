// Define the type of the environment variables.
declare interface Env {
  readonly NODE_ENV: string;
  NG_APP_ADRIA_API_URL: string;
  NG_APP_WEB_API_URL: string;
  [key: string]: any;
}

declare interface ImportMeta {
  readonly env: Env;
}
