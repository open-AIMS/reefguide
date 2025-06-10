import express from 'express';
import { z } from 'zod';
import { Config, loadConfig } from './config';
import { CapacityManager } from './manager';
import { AuthApiClient } from './authClient';
import { logger } from './logging';

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

let config: Config;

try {
  // Load and validate configuration from environment variables
  config = loadConfig();
  logger.info('Configuration loaded successfully');
} catch (error) {
  if (error instanceof z.ZodError) {
    logger.error('Configuration validation failed:', { errors: error.errors });
  } else {
    logger.error('Failed to load configuration:', { error });
  }
  // Exit with error code if configuration cannot be loaded
  process.exit(1);
}

// Create API client (base should include /api)
logger.info('Initializing API client');
const client = new AuthApiClient(config.apiEndpoint + '/api', {
  email: config.auth.email,
  password: config.auth.password,
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
 * Handles graceful shutdown on SIGTERM
 * Stops the capacity manager before process exit
 */
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal, shutting down...');
  manager.stop();
});

/**
 * Handles graceful shutdown on SIGINT (Ctrl+C)
 * Stops the capacity manager before process exit
 */
process.on('SIGINT', () => {
  logger.info('Received SIGINT signal, shutting down...');
  manager.stop();
});

// Additional error handling for uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught exception, shutting down:', { error });
  manager.stop();
  process.exit(1);
});

// Additional error handling for unhandled promise rejections
process.on('unhandledRejection', reason => {
  logger.error('Unhandled rejection, shutting down:', { reason });
  manager.stop();
  process.exit(1);
});
