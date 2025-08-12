import { config } from './config';

// Only import and use sentry if the DSN is provided
if (config.sentryDsn) {
  console.log('Setting up Sentry for error tracking...');
  // Import Sentry
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: config.sentryDsn,
    // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#sendDefaultPii
    sendDefaultPii: false,
    // Bugsink prefers no traces
    tracesSampleRate: 0,
    // Enable logs for winston integration
    enableLogs: true,
  });
  console.log('Sentry initialized successfully.');
}
