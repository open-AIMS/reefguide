import express from 'express';
import {Config, loadConfig} from './config';
import {TestWorker} from './worker';
import {z} from 'zod';
import {AuthApiClient} from './authClient';
import {getTaskMetadataSafe} from './ecs';

async function main() {
  let config: Config;
  try {
    console.log('Loading configuration');
    config = loadConfig();
    console.log('Configuration loaded successfully');
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach(err => {
        console.error(`- ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('Failed to load configuration:', error);
    }
    process.exit(1);
  }

  // Get info about the task

  const metadata = await getTaskMetadataSafe();

  // Setup the api client
  const client = new AuthApiClient(config.apiEndpoint + '/api', {
    email: config.username,
    password: config.password,
  });

  // Create express app for health checks
  const app = express();

  // Create worker instance
  const worker = new TestWorker(config, client, metadata);

  // Health check endpoint
  app.get('/health', (req, res) => {
    const activeJobs = worker.getActiveJobCount();
    res.json({
      status: 'healthy',
      activeJobs,
      maxJobs: config.maxConcurrentJobs,
    });
  });

  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`Health check server listening on port ${config.port}`);
  });

  // Handle shutdown gracefully
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM signal, shutting down...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT signal, shutting down...');
    await worker.stop();
    process.exit(0);
  });

  // Start the worker
  await worker.start();
}

// Start the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
