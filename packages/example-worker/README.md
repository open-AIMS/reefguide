# @reefguide/example-worker

A sample TypeScript worker implementation for the ReefGuide job processing system. This package demonstrates how to create workers that can claim and process jobs from the ReefGuide job queue.

## ⚠️ Sample Implementation Only

**This is a test/sample worker package for demonstration and development purposes.** It simulates job processing with random delays and success rates. In production, you would replace the processing logic with your actual job processing implementation.

## Overview

This worker implementation:

1. **Polls the job queue** for available jobs of specified types
2. **Claims jobs** from the API and processes them
3. **Simulates processing** with configurable delays (5-15 seconds)
4. **Reports results** back to the API (90% success rate by default)
5. **Handles graceful shutdown** when idle or receiving termination signals
6. **Provides health checks** via HTTP endpoint

## Configuration

Configure the worker via environment variables:

```bash
# API Connection
API_ENDPOINT=http://localhost:5000
WORKER_USERNAME=worker@email.com
WORKER_PASSWORD=password

# Job Processing
JOB_TYPES=TEST,SUITABILITY_ASSESSMENT,REGIONAL_ASSESSMENT
MAX_CONCURRENT_JOBS=3
POLL_INTERVAL_MS=2000

# Worker Behavior
IDLE_TIMEOUT_MS=120000  # 2 minutes
PORT=3000
```

### Configuration Options

- **API_ENDPOINT**: Base URL of the ReefGuide API
- **WORKER_USERNAME/PASSWORD**: Credentials for API authentication
- **JOB_TYPES**: Comma-separated list of job types this worker can handle
- **MAX_CONCURRENT_JOBS**: Maximum number of jobs to process simultaneously
- **POLL_INTERVAL_MS**: How often to check for new jobs (minimum 1000ms)
- **IDLE_TIMEOUT_MS**: How long to wait before shutting down when idle (default: 2 minutes)
- **PORT**: Port for the health check HTTP server

## Usage

### Development

```bash
# Copy and configure environment
cp .env.dist .env
# Edit .env with your settings

# Install dependencies (from monorepo root)
npm install

# Start in development mode
npm run dev
```

### Production

```bash
# Build the worker
npm run build

# Start production worker
npm start
```

### Docker/ECS Deployment

When running in AWS ECS, the worker automatically detects its task metadata and includes it when claiming jobs for better tracking and debugging.

## Health Check

The worker exposes a health check endpoint at `GET /health` that returns:

```json
{
  "status": "healthy",
  "activeJobs": 2,
  "maxJobs": 3
}
```

## Job Processing Flow

1. **Polling**: Worker continuously polls the API for jobs of its configured types
2. **Claiming**: When jobs are available, worker attempts to claim them
3. **Processing**: Simulates work with a random delay (5-15 seconds)
4. **Completion**: Reports success/failure back to the API
5. **Idle Management**: Shuts down automatically after idle timeout when no jobs are active

## Graceful Shutdown

The worker handles shutdown signals gracefully:

- **SIGTERM/SIGINT**: Stops polling and waits for active jobs to complete
- **Idle Timeout**: Automatically shuts down when no jobs are processed for the configured timeout period
- **Active Job Cancellation**: Cancels any remaining jobs during forced shutdown

## Creating Custom Workers

To create your own worker implementation:

1. **Copy this package** as a starting point
2. **Replace the processing logic** in `TestWorker.completeJob()` with your actual job processing
3. **Update job types** in your configuration to match your use cases
4. **Modify health checks** if you need additional status information
5. **Adjust timing parameters** based on your job characteristics

## Development Notes

- The worker uses JWT authentication with automatic token refresh
- ECS task metadata is automatically detected when running in AWS
- All job assignments include task ARN information for tracking
- Error handling includes retry logic for API communication
- Memory usage and job state is logged for debugging

## Integration with Job Manager

This worker is designed to work with the `@reefguide/capacity-manager` capacity management service, which automatically scales worker instances based on job queue demand.
