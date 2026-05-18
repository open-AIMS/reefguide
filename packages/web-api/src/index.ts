// Sentry initialization for error tracking - must be run first
import './sentry-instrument';

import app from './apiSetup';
import { config } from './config';
import { getCronService } from './cron/cronService';
import { initialiseAdmins } from './initialise';
import { initializeS3Service } from './services/s3Storage';

console.debug('Initializing admins...');
initialiseAdmins();

console.debug('Setting up S3 storage service');
initializeS3Service(config.s3.bucketName, { minio: config.s3.minio });

// Start cron jobs
const cronService = getCronService();
cronService.start();

const port = config.port || 5000;
const server = app.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received, starting graceful shutdown...`);

  // Stop cron jobs
  cronService.stop();

  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
