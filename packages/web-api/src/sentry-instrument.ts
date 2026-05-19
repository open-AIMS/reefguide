// import * as Sentry from '@sentry/node';
import { config } from './config';

const sentryPromise = import('@sentry/node');

// Only import and use sentry if the DSN is provided
if (config.sentryDsn) {
  console.debug('Setting up Sentry for error tracking...');
  // async import Sentry and initialize
  sentryPromise.then(Sentry => {
    Sentry.init({
      dsn: config.sentryDsn,
      // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#sendDefaultPii
      sendDefaultPii: false,
      // Bugsink prefers no traces
      tracesSampleRate: 0
    });
    console.debug('Sentry initialized successfully.');
  });
}

/**
 * Custom sentry logger
 * @param message The message
 * @param level the log level
 */
export async function logSentryMessage(message: string, level: 'info' | 'warning' | 'error') {
  if (config.sentryDsn) {
    const Sentry = await sentryPromise;
    Sentry.captureMessage(message, level);
  } else {
    console.debug('Swallowing sentry log since DSN is not configured. ', { message, level });
  }
}
