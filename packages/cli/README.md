# @reefguide/capacity-manager

A capacity management service for the ReefGuide job system that automatically scales ECS tasks based on job queue demand.

## Overview

This service monitors the job queue and dynamically launches/manages AWS ECS Fargate tasks to process pending jobs. It uses a logarithmic scaling algorithm to efficiently balance resource usage with processing demand.

## ⚠️ AWS Deployment Only

**This service is only required for AWS deployments and is not needed for local
development.** When running the ReefGuide system locally, job processing can be
handled directly with local runners without the need for capacity management.

## How It Works

1. **Polls the job queue** at configurable intervals to check for pending jobs
2. **Calculates optimal worker count** using logarithmic scaling based on:
   - Number of pending jobs
   - Configured sensitivity and scaling factors
   - Min/max capacity limits
3. **Launches ECS tasks** on AWS Fargate to handle the workload
4. **Tracks worker status** and removes completed/failed tasks from tracking
5. **Respects cooldown periods** to prevent rapid scaling oscillations

## Configuration (if needed)

The service is configured via environment variables. Copy `.env.dist` to `.env` and update with your AWS resources:

### Required Environment Variables

```bash
# Base Configuration
POLL_INTERVAL_MS=1000
API_ENDPOINT=http://localhost:5000
AWS_REGION=ap-southeast-2
API_USERNAME=worker@email.com
API_PASSWORD=password
VPC_ID=vpc-xxxxxxxxx

# Job Type Configuration (for each JobType enum value)
{JOB_TYPE}_TASK_DEF=arn:aws:ecs:region:account:task-definition/name:version
{JOB_TYPE}_CLUSTER=arn:aws:ecs:region:account:cluster/cluster-name
{JOB_TYPE}_MIN_CAPACITY=0
{JOB_TYPE}_MAX_CAPACITY=10
{JOB_TYPE}_COOLDOWN=300
{JOB_TYPE}_SENSITIVITY=1.5
{JOB_TYPE}_FACTOR=2
{JOB_TYPE}_SECURITY_GROUP=sg-xxxxxxxxx
```

### Scaling Parameters

- **MIN_CAPACITY**: Minimum number of workers to maintain
- **MAX_CAPACITY**: Maximum number of workers allowed
- **SENSITIVITY**: Controls scaling aggressiveness (higher = more workers)
- **FACTOR**: Base job count for logarithmic scaling calibration
- **COOLDOWN**: Seconds to wait between scaling operations

## Development

```bash
# Install dependencies (from monorepo root)
npm install

# Start in development mode
npm run dev

# Build
npm run build

# Start production
npm start
```

## Health Check

The service exposes a health check endpoint at `/health` on port 3000 (or `PORT` env var).

## Logging

Logs are output to console with configurable levels via the `LOG_LEVEL` environment variable:

- `error`, `warn`, `info` (default), `verbose`, `debug`, `silly`

## Job Type Integration

The service automatically reads job types from the `@reefguide/db` package's `JobType` enum. Each job type requires corresponding environment variables following the pattern above.
