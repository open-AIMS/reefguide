require('./sentry-instrument');
import express from 'express';
import { config } from './config';
import { CapacityManager } from './manager';
import { AuthApiClient } from './authClient';
import { logger } from './logging';
import Sentry from '@sentry/node';

/**
 * Main entry point for the Capacity Manager service
 * Sets up the health check endpoint, loads configuration,
 * and initializes the capacity manager.
 */

// Create and start the express app for health checks
const app = express();
const port = process.env.PORT || 3000;

/**
 * Health check endpoint
 * Returns 200 OK to indicate the service is running
 */
app.get('/health', (req, res) => {
  logger.debug('Health check requested');
  res.status(200).send('OK');
});

// Create API client (base should include /api)
logger.info('Initializing API client');
const client = new AuthApiClient(config.apiEndpoint + '/api', {
  email: config.auth.email,
  password: config.auth.password
});

// Start the express server
app.listen(port, () => {
  logger.info(`Health check server listening on port ${port}`);
});

// Start the capacity manager
logger.info('Initializing capacity manager');
const manager = new CapacityManager(config, client);
logger.info('Starting capacity manager');
manager.start();

/**
 * Graceful shutdown helper function
 */
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal} signal, shutting down gracefully...`);

  try {
    // Stop the capacity manager
    manager.stop();
    logger.info('Capacity manager stopped successfully');

    // Close Sentry client and flush any pending reports
    await Sentry.close(2000);
    logger.info('Sentry client closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    await Sentry.close(1000);
    process.exit(1);
  }
}

/**
 * Handles graceful shutdown on SIGTERM
 */
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
});

/**
 * Handles graceful shutdown on SIGINT (Ctrl+C)
 */
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
});

/**
 * Additional error handling for uncaught exceptions
 */
process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error);

  // Attempt graceful shutdown
  manager.stop();
  // Flush Sentry and exit
  Sentry.close(2000).finally(() => {
    process.exit(1);
  });
});

/**
 * Additional error handling for unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled promise rejection:', error);

  // Attempt graceful shutdown
  manager.stop();

  // Flush Sentry and exit
  Sentry.close(2000).finally(() => {
    process.exit(1);
  });
});
