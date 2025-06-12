# ReefGuide Web API - Developer Guide

A REST API to support Reef Guide (AIMS), built with Express, TypeScript, Zod and Prisma, deployable to AWS using CDK.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Testing Your Setup](#testing-your-setup)
- [Development Workflow](#development-workflow)
- [Database Management](#database-management)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
  - [Authentication](#authentication)
  - [Polygons](#polygons)
  - [Notes](#notes)
  - [Cluster Management](#cluster-management)
- [AWS Deployment](#aws-deployment)
  - [Configuration Methods](#configuration-methods)
  - [Deployment Steps](#deployment-steps)
- [CDK Infrastructure](#cdk-infrastructure)
  - [Components](#components)
  - [Service Architecture](#service-architecture)
  - [Networking](#networking)
  - [Security](#security)
  - [CDK Deployment](#cdk-deployment)
  - [Customization](#customization)
- [Configuring CDK](#configuring-cdk)
  - [Config Definitions](#config-definitions)
  - [Config Repository](#config-repository)
  - [Structure](#structure)
  - [File Organization](#file-organization)
  - [Usage by Config Scripts](#usage-by-config-scripts)
  - [Interaction with Repository](#interaction-with-repository)
  - [Best Practices](#best-practices)
- [Using Prisma ORM](#using-prisma-orm)
- [Job System](#job-system)
  - [Architecture](#architecture)
  - [Key Files](#key-files)
  - [Entity Relationships](#entity-relationships)
  - [Job Lifecycle](#job-lifecycle)
  - [Job Sequence Diagram](#job-sequence-diagram)
  - [API Routes](#api-routes)
  - [Job Types](#job-types)
- [Security](#security-1)
- [Notes](#notes-1)
- [Troubleshooting](#troubleshooting)

## Features

- Express.js backend with TypeScript
- Prisma ORM for database operations
- Passport based JWT authentication
- AWS CDK for infrastructure as code
- Serverless deployment using AWS Lambda and API Gateway
- Environment-based configuration with Zod validation
- Basic docker compose

## Quick Start

Get up and running with the API in minutes:

```bash
# Clone the repository
git clone https://github.com/open-AIMS/reefguide-web-api.git
cd reefguide-web-api

# Install dependencies
nvm use 20  # Or your preferred Node.js v18+ version
npm install

# Configure environment
cp .env.example .env
npm run local-keys  # Generate JWT keys

# Start PostgreSQL and setup database
docker-compose up -d
npm run prisma-generate
npm run db-reset

# Start development server
npm run dev
```

### Testing the API

```bash
# Create a test user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login to get JWT token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Use the token for authenticated requests
curl -X GET http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

For detailed setup instructions, see the [Local Development Setup](#local-development-setup) section.

## Prerequisites

- Node.js (v18+)
- AWS CLI configured with appropriate permissions
- Docker (for local development with Prisma)

## Local Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Generate Prisma client: `npm run prisma-generate`
4. Set up environment variables: Copy `.env.example` to `.env`
5. Generate JWT keys: `npm run local-keys`
6. Start up psql `docker compose up`
7. Run DB migration `npm run db-reset`
8. Start server with auto-restart `npm run dev`

If you experience connection issues with the database, try using `127.0.0.1` instead of `localhost` in your connection strings:

```
DATABASE_URL=postgresql://admin:password@127.0.0.1:5432
DIRECT_URL=postgresql://admin:password@127.0.0.1:5432
```

## Testing Your Setup

### Health Check

Verify the API is running:

```bash
curl http://localhost:5000/api/health
# Expected response: {"status":"ok"}
```

### User Registration

Create a test user:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### User Login

Get an authentication token:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Using Authentication with Postman

After obtaining your JWT token:

1. In Postman, create a new request
2. Go to the "Authorization" tab
3. Select "Bearer Token" from the Type dropdown
4. Paste your token into the "Token" field

Alternatively, use environment variables in Postman to store your token for reuse across multiple requests.

## Development Workflow

```bash
# Start the development server with auto-restart
npm run dev

# Run the linter
npm run lint

# Run type checking
npm run typecheck

# Run tests
npm run test
```

## Database Management

```bash
# View and edit data with Prisma Studio
npm run studio

# Reset the database (WARNING: Deletes all data)
npm run db-reset

# Create a new migration after changing schema.prisma
npx prisma migrate dev --name your_migration_name

# Other Prisma operations
npx prisma ...
```

## Testing

**WARNING**: Running the tests involves resetting the specified DB in your .env file. Double check you are not targeting a production DB before running tests.

Setup a local psql DB for integration testing:

```bash
docker-compose up
```

Then, keeping this running, change your .env to specify the local DB.
If you get a connection error, try `127.0.0.1` instead of `localhost`.

```
DATABASE_URL=postgresql://admin:password@localhost:5432
DIRECT_URL=postgresql://admin:password@localhost:5432
```

Then migrate the DB to latest:

```bash
npm run db-reset
```

Also ensure the rest of your .env file is suitable, specifically, generating local keys is needed:

```bash
npm run local-keys
```

Now run tests:

```bash
npm run test
```

Tests use Jest and Supertest for API testing.

## Project Structure

- `src/`: Source code
  - `api/`: API-related code
  - `db/`: Database schemas and migrations
  - `infra/`: AWS CDK infrastructure code
- `test/`: Test files
- `configs/`: Environment-specific configurations
- `scripts/`: Utility scripts
- `config.ts`: Loads and validates environment variables
- `infra_config.ts`: Defines CDK stack configuration schema

## API Endpoints

All routes are prefixed with `/api`.

### Authentication

All auth routes are prefixed with `/auth`.

#### 1. Register

- **Endpoint:** POST `/register`
- **Body:**
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Response:**
  - Success (200): `{ "userId": "string" }`
  - Error (400): `{ "message": "User already exists" }`

#### 2. Login

- **Endpoint:** POST `/login`
- **Body:**
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Response:**
  - Success (200): `{ "token": "JWT_token_string", "refreshToken": "refresh_token_string" }`
  - Error (401): `{ "message": "Invalid credentials" }`

#### 3. Refresh Token

- **Endpoint:** POST `/token`
- **Body:**
  ```json
  {
    "refreshToken": "string"
  }
  ```
- **Response:**
  - Success (200): `{ "token": "new_JWT_token_string" }`
  - Error (401): `{ "message": "Invalid refresh token" }`

#### 4. Get User Profile

- **Endpoint:** GET `/profile`
- **Headers:** `Authorization: Bearer JWT_token_string`
- **Response:**
  - Success (200): `{ "user": { "id": "string", "email": "string", "roles": ["string"] } }`
  - Error (401): `{ "message": "Unauthorized" }`
  - Error (500): `{ "message": "User object was not available after authorisation." }`

**Notes**:

- All endpoints use JSON for request and response bodies.
- The register endpoint returns only the user ID on success.
- The login endpoint returns both a JWT token and a refresh token.
- The profile endpoint includes user roles in the response.
- Error responses may vary based on the specific error encountered.

### Polygons

#### GET /polygons/:id

Retrieves a specific polygon by ID.

- **Authentication**: Required (JWT)
- **Authorization**: User must own the polygon or be an admin
- **Parameters**:
  - `id` (path parameter): ID of the polygon
- **Response**: Returns the polygon object

#### GET /polygons

Retrieves all polygons for the authenticated user, or all polygons if the user is an admin.

- **Authentication**: Required (JWT)
- **Response**: Returns an array of polygon objects

#### POST /polygons

Creates a new polygon.

- **Authentication**: Required (JWT)
- **Request Body**:
  - `polygon` (JSON): GeoJSON representation of the polygon
- **Response**: Returns the created polygon object

#### PUT /polygons/:id

Updates an existing polygon.

- **Authentication**: Required (JWT)
- **Authorization**: User must own the polygon or be an admin
- **Parameters**:
  - `id` (path parameter): ID of the polygon to update
- **Request Body**:
  - `polygon` (JSON): Updated GeoJSON representation of the polygon
- **Response**: Returns the updated polygon object

#### DELETE /polygons/:id

Deletes a polygon.

- **Authentication**: Required (JWT)
- **Authorization**: User must own the polygon or be an admin
- **Parameters**:
  - `id` (path parameter): ID of the polygon to delete
- **Response**: 204 No Content on success

### Notes

#### GET /notes

Retrieves all notes for the authenticated user, or all notes if the user is an admin.

- **Authentication**: Required (JWT)
- **Response**: Returns an array of note objects

#### GET /notes/:id

Retrieves all notes for a specific polygon.

- **Authentication**: Required (JWT)
- **Authorization**: User must own the polygon or be an admin
- **Parameters**:
  - `id` (path parameter): ID of the polygon
- **Response**: Returns an array of note objects associated with the polygon

#### POST /notes

Creates a new note for a given polygon.

- **Authentication**: Required (JWT)
- **Authorization**: User must own the polygon or be an admin
- **Request Body**:
  - `content` (string): Content of the note
  - `polygonId` (number): ID of the polygon to associate the note with
- **Response**: Returns the created note object

#### PUT /notes/:id

Updates an existing note.

- **Authentication**: Required (JWT)
- **Authorization**: User must own the note or be an admin
- **Parameters**:
  - `id` (path parameter): ID of the note to update
- **Request Body**:
  - `content` (string): Updated content of the note
- **Response**: Returns the updated note object

All endpoints require JWT authentication. Admin users have access to all resources, while regular users can only access their own resources. Invalid requests or unauthorized access attempts will result in appropriate error responses.

### Cluster Management

Routes for managing the ReefGuideAPI ECS cluster scaling and status. All routes are prefixed with `/admin`.

#### GET /admin/status

Retrieves the current status of the ECS cluster.

- **Authentication**: Required (JWT)
- **Authorization**: Admin only
- **Parameters**: None
- **Response**: Returns the cluster status object

```json
{
  "runningCount": 5,
  "pendingCount": 0,
  "desiredCount": 3,
  "deployments": [
    {
      "status": "PRIMARY",
      "taskDefinition": "arn:aws:ecs:ap-southeast-2:xxx:task-definition/xxx:8",
      "desiredCount": 3,
      "pendingCount": 0,
      "runningCount": 3,
      "failedTasks": 0,
      "rolloutState": "IN_PROGRESS",
      "rolloutStateReason": "ECS deployment ecs-svc/1311621013630114425 in progress."
    },
    {
      "status": "ACTIVE",
      "taskDefinition": "arn:aws:ecs:ap-southeast-2:xxx:task-definition/xxx:8",
      "desiredCount": 0,
      "pendingCount": 0,
      "runningCount": 2,
      "failedTasks": 0,
      "rolloutState": "COMPLETED",
      "rolloutStateReason": "ECS deployment ecs-svc/4408993298399279146 completed."
    }
  ],
  "events": [
    {
      "createdAt": "2024-10-23T01:03:38.329Z",
      "message": "(service reefguide-reefguideapireefguideserviceService9CF43A7C-warFx9zMuB8k) registered 2 targets in (target-group arn:aws:elasticloadbalancing:ap-southeast-2:xxx:targetgroup/reefgu-reefg-PAREXETNHOCW/e5dd5bec27f8064b)"
    },
    {
      "createdAt": "2024-10-23T01:03:17.851Z",
      "message": "(service reefguide-reefguideapireefguideserviceService9CF43A7C-warFx9zMuB8k) registered 1 targets in (target-group arn:aws:elasticloadbalancing:ap-southeast-2:xxx:targetgroup/reefgu-reefg-PAREXETNHOCW/e5dd5bec27f8064b)"
    },
    {
      "createdAt": "2024-10-23T01:02:36.941Z",
      "message": "(service reefguide-reefguideapireefguideserviceService9CF43A7C-warFx9zMuB8k) has started 2 tasks: (task 04dfb8c773cc47a1b0442dc1cabc497a) (task 239bccf79b8841c2afc9009496987dc0)."
    },
    {
      "createdAt": "2024-10-23T01:02:14.081Z",
      "message": "(service reefguide-reefguideapireefguideserviceService9CF43A7C-warFx9zMuB8k, taskSet ecs-svc/4408993298399279146) has begun draining connections on 1 tasks."
    },
    {
      "createdAt": "2024-10-23T01:02:14.077Z",
      "message": "(service reefguide-reefguideapireefguideserviceService9CF43A7C-warFx9zMuB8k) deregistered 1 targets in (target-group arn:aws:elasticloadbalancing:ap-southeast-2:xxx:targetgroup/reefgu-reefg-PAREXETNHOCW/e5dd5bec27f8064b)"
    }
  ],
  "serviceStatus": "ACTIVE"
}
```

#### POST /admin/scale

Scales the ECS cluster to a specified number of tasks.

- **Authentication**: Required (JWT)
- **Authorization**: Admin only
- **Parameters**: None
- **Request Body**:

```json
{
  "desiredCount": number // Between 0 and 10 inclusive
}
```

- **Response**: 200 OK

#### POST /admin/redeploy

Forces a new deployment of the service, which will pull the latest version of the container image.

- **Authentication**: Required (JWT)
- **Authorization**: Admin only
- **Parameters**: None
- **Request Body**: None
- **Response**: 200 OK
- **Notes**:
  - This operation will perform a rolling update with zero downtime
  - Old tasks will be replaced with new tasks pulling the latest image
  - The deployment uses a minimum healthy percent of 50% and maximum percent of 200% to ensure service availability
  - Progress can be monitored via the `/admin/status` endpoint

## AWS Deployment

### Configuration Methods

Ensure you have your `npm` environment setup and installed:

```bash
nvm use 20
npm install
```

Start by creating a configuration file, using either the local or remote method below.

#### Local Configuration Method (New Deployment)

1. Create a config JSON file in `configs/` (e.g., `dev.json`). The `sample.json` includes example values.
2. Run `npm run aws-keys -- <secret name e.g. dev-reefguide-creds>` with appropriate AWS credentials.
3. Open the created secret in AWS Secrets Manager and add `DATABASE_URL` and `DIRECT_URL` fields for the PostgreSQL DB provider.

#### Remote Configuration Method (Existing Configuration)

With a configuration repo that follows the specifications in the [Configuring CDK](#configuring-cdk) section:

```bash
./config <stage> <namespace> --target <repo clone string>
```

Example:

```bash
./config org dev --target git@github.com:org/repo.git
```

### Deployment Steps

1. Export your config file path:

   ```bash
   export CONFIG_FILE_NAME=<file name.json e.g. dev.json>
   ```

2. Ensure you have AWS credentials active for the target environment:

   ```bash
   aws sts get-caller-identity
   ```

3. Bootstrap CDK environment (if on new account):

   ```bash
   npx cdk bootstrap
   ```

4. Preview changes:

   ```bash
   npx cdk diff
   ```

5. Deploy:
   ```bash
   npx cdk deploy
   ```

### A note on the secret string

The above `npm run aws-keys` script will create a secret with the following keys:

- `JWT_PRIVATE_KEY`
- `JWT_PUBLIC_KEY`
- `JWT_KEY_ID`

However it will not include the

- `DATABASE_URL`
- `DIRECT_URL`

This has been intentionally left out of the CDK managed portion of the infrastructure to allow easily plugging in any PostgreSQL DB connection string, however it does mean additional setup.

You can either:

- use the provided RDS DB
- use your own DB

#### Using the RDS DB

In your configuration, include the `db` field like so:

```json
  "db": {
    "instanceSize": "small",
    "storageGb": 50
  },
```

The instance size is one of the standard CDK RDS T4G instance size enums - defined here for reference [ec2 instance size](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.InstanceSize.html).

Deploy the system, then go and look at the auto generated credentials secret in AWS Secret Manager, and retrieve the host, username and password. Build the connection strings with the following format:

```text
DATABASE_URL="postgresql://reefguide:<PASSWORD>@<HOST>/reefguide?sslmode=require?connect_timeout=15&pool_timeout=15"
DIRECT_URL="postgresql://reefguide:<PASSWORD>@<HOST>/reefguide?connect_timeout=15&pool_timeout=15"
```

replacing the password and host from the connection secret.

Update the secret which you generated earlier, using the AWS console, to include the

- `DATABASE_URL`
- `DIRECT_URL`

keys/values as above.

Your web-api will now use this database.

#### Using your own DB

If you would like to use an alternative psql DB, then

1. do not include the `db` field in the config (to avoid deploying an unused instance)
2. build your own db and associated connection strings in the below format (noting you'll need to specify the db name as prisma will target this DB)

```text
DATABASE_URL="postgresql://reefguide:<PASSWORD>@<HOST>/<DB NAME>?sslmode=require?connect_timeout=15&pool_timeout=15"
DIRECT_URL="postgresql://reefguide:<PASSWORD>@<HOST>/<DB NAME>?connect_timeout=15&pool_timeout=15"
```

3. update your generated keys secret with these key/values

Your web-api will now target your DB.

## CDK Infrastructure

### Components

1. **VPC**: A Virtual Private Cloud with public subnets.
2. **ECS Cluster**: Hosts the ReefGuideAPI Fargate service.
3. **Application Load Balancer (ALB)**: Handles incoming traffic and distributes it to the ECS services.
4. **API Gateway**: Manages the REST API for the Web API service.
5. **Lambda Function**: Runs the Web API service.
6. **EFS (Elastic File System)**: Provides persistent storage for the ReefGuideAPI service.
7. **S3 Bucket**: Used for intermediary data transfer between the user and the EC2 service instance which mounts the EFS.
8. **EC2 Instance**: Manages the EFS filesystem.
9. **Route 53**: Handles DNS routing.
10. **ACM (AWS Certificate Manager)**: Manages SSL/TLS certificates.
11. **Secrets Manager**: Stores sensitive configuration data.

### Service Architecture

#### ReefGuideAPI

- Runs as a Fargate service in the ECS cluster.
- Uses an Application Load Balancer for traffic distribution.
- Implements auto-scaling based on CPU and memory utilization.
- Utilizes EFS for persistent storage.

#### WebAPI

- Deployed as a Lambda function.
- Exposed via API Gateway.
- Uses AWS Secrets Manager for storing sensitive data.

### Networking

- Uses a shared Application Load Balancer for the ReefGuideAPI.
- API Gateway handles routing for the WebAPI.
- Route 53 manages DNS records for both services.

### Security

- SSL/TLS certificates are managed through ACM.
- Secrets are stored in AWS Secrets Manager.
- IAM roles control access to various AWS services.

### CDK Deployment

1. Ensure AWS CLI is configured with appropriate permissions.
2. Create a configuration file in `configs/` (e.g., `dev.json`).
3. Run `npm run aws-keys -- <secret name>` to set up JWT keys in Secrets Manager.
4. Add database connection strings to the created secret.
5. Bootstrap CDK environment: `npx cdk bootstrap`
6. Review changes: `npx cdk diff`
7. Deploy: `CONFIG_FILE_NAME=[env].json npx cdk deploy`

### Customization

- Modify `src/infra/components/` files to adjust individual service configurations.
- Update `src/infra/infra.ts` to change overall stack structure.
- Adjust auto-scaling, instance types, and other parameters in the configuration JSON files.

## Configuring CDK

**This config management system is courtesy of [github.com/provena/provena](https://github.com/provena/provena)**

This repo features a detached configuration management approach. This means that configuration should be stored in a separate private repository. This repo provides a set of utilities which interact with this configuration repository, primarily the `./config` bash script.

```text
config - Configuration management tool for interacting with a private configuration repository

Usage:
  config NAMESPACE STAGE [OPTIONS]
  config --help | -h
  config --version | -v

Options:
  --target, -t REPO_CLONE_STRING
    The repository clone string

  --repo-dir, -d PATH
    Path to the pre-cloned repository

  --help, -h
    Show this help

  --version, -v
    Show version number

Arguments:
  NAMESPACE
    The namespace to use (e.g., 'rrap')

  STAGE
    The stage to use (e.g., 'dev', 'stage')

Environment Variables:
  DEBUG
    Set to 'true' for verbose output
```

The central idea of this configuration approach is that each namespace/stage combination contains a set of files, which are gitignored by default in this repo, which are 'merged' into the user's clone of the this repository, allowing temporary access to private information without exposing it in git.

### Config path caching

The script builds in functionality to cache the repo which makes available a given namespace/stage combination. These are stored in `env.json`, at the repository root, which has a structure like so:

```json
{
  "namespace": {
    "stage1": "git@github.com:org/repo.git",
    "stage2": "git@github.com:org/repo.git",
    "stage3": "git@github.com:org/repo.git"
  }
}
```

This saves using the `--target` option on every `./config` invocation. You can share this file between team members, but we do not recommend committing it to your repository.

### Config Definitions

**Namespace**: This is a grouping that we provide to allow you to separate standalone sets of configurations into distinct groups. For example, you may manage multiple organisation's configurations in one repo. You can just use a single namespace if suitable.

**Stage**: A stage is a set of configurations within a namespace. This represents a 'deployment' of Provena.

### Config Repository

The configuration repository contains configuration files for the this project.

#### `cdk.context.json`

The configuration repo does not contain sample `cdk.context.json` files, but we recommend including this in this repo to make sure deployments are deterministic. This will be generated upon first CDK deploy.

### Structure

The configuration repository is organized using a hierarchical structure based on namespaces and stages:

```
.
├── README.md
└── <your-namespace>
    ├── base
    ├── dev
    └── feat
```

#### Namespaces

A namespace represents a set of related deployment stages, usually one namespace per organisation/use case.

#### Stages

Within each namespace, there are multiple stages representing different environments/deployment specifications:

- `base`: Contains common base configurations shared across all stages within the namespace
- `dev`: Sample development environment configurations
- `feat`: Sample feature branch workflow environment configurations

#### Feat stage

The feat stage supports the feature branch deployment workflow which is now a part of the open-source workflow. This makes use of environment variable substitution which is described later.

### File Organization

Configuration files are placed within the appropriate namespace and stage directories. Currently:

```
.
├── README.md
└── your-namespace
    └──── dev
        └── configs
            └── dev.json
```

### Usage by Config Scripts

#### Base Configurations

Files in the `base` directory of a namespace are applied first, regardless of the target stage. This allows you to define common configurations that are shared across all stages within a namespace.

#### Stage-Specific Configurations

Files in stage-specific directories (e.g., `dev`, `test`, `prod`) are applied after the base configurations. They can override or extend the base configurations as needed.

### Interaction with Repository

The main repository contains a configuration management script that interacts with this configuration repository. Here's how it works:

1. The script clones or uses a pre-cloned version of this configuration repository.
2. It then copies the relevant configuration files based on the specified namespace and stage.
3. The process follows these steps:
   a. Copy all files from the `<namespace>/base/` directory (if it exists).
   b. Copy all files from the `<namespace>/<stage>/` directory, potentially overwriting files from the base configuration.
4. The copied configuration files are then used by the this system for the specified namespace and stage.

### Best Practices

1. Use version control: Commit and push changes to this repository regularly.
2. Document changes: Use clear, descriptive commit messages and update this README if you make structural changes.
3. Minimize secrets: Avoid storing sensitive information like passwords or API keys directly in these files. Instead, use secure secret management solutions.

## Using Prisma ORM

### Creating a new entity

1. Update the `src/db/schema.prisma` with your new models
2. Apply the migration - heeding warnings

```bash
npx prisma migrate dev
```

## Job System

A job processing system built on top of Postgres and ECS. Uses Postgres as a job queue and tracks job status, assignments, and results.

### Architecture

The system consists of three main components:

1. Job Queue (Postgres table)
2. API Server (Express)
3. Worker Nodes (ECS Tasks)

### Key Files

```
src/
├── api/
│   ├── routes/
│   │   └── jobs.ts      # API routes for job management
│   └── services/
│       └── jobs.ts      # Business logic for job processing
prisma/
└── schema.prisma        # Database schema including job tables
```

### Entity Relationships

```mermaid
erDiagram
    Job ||--o{ JobAssignment : "has"
    Job ||--o{ JobResult : "has"
    JobAssignment ||--o| JobResult : "produces"
    User ||--o{ Job : "creates"

    Job {
        int id
        datetime created_at
        datetime updated_at
        enum type
        enum status
        int user_id
        json input_payload
    }

    JobAssignment {
        int id
        datetime created_at
        datetime updated_at
        int job_id
        string ecs_task_arn
        string ecs_cluster_arn
        datetime expires_at
        enum storage_scheme
        string storage_uri
        datetime heartbeat_at
        datetime completed_at
    }

    JobResult {
        int id
        datetime created_at
        int job_id
        int assignment_id
        json result_payload
        enum storage_scheme
        string storage_uri
        json metadata
    }
```

### Job Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: Job Created

    PENDING --> IN_PROGRESS: Worker Assignment
    note right of IN_PROGRESS
        Job is assigned to ECS task
        Has 1:1 assignment record
    end note

    IN_PROGRESS --> SUCCEEDED: Task Completed
    IN_PROGRESS --> FAILED: Task Error
    IN_PROGRESS --> TIMED_OUT: Assignment Expired

    PENDING --> CANCELLED: User Cancelled
    IN_PROGRESS --> CANCELLED: User Cancelled

    SUCCEEDED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
    TIMED_OUT --> [*]
```

### Job Sequence Diagram

```mermaid
sequenceDiagram
    critical Launch Job
    User->>Web API: launch(payload)
    Web API->>DB: create Job
    DB-->>Web API: job_id
    Web API-->>User: job_id
    end

    critical Job Manager Polling
    loop Poll loop
    Manager->>Web API: /poll
    Web API->>DB: query (unassigned)
    DB-->>Web API: jobs[]
    Web API-->>Manager: jobs[]
    Note left of Manager: If jobs.length > 0...
    end

    critical Job Manager Capacity
    option Cooldown period complete
    Manager->>ECS: launch task type
    Note left of Manager: Task dfn corresponds<br/>to task type
    end


    critical Worker lifecycle

    loop Worker poll loop
    Worker->>Web API: /poll
    Web API-->>Worker: jobs[]
    end

    option Assign job
    Worker->>Web API: assign(task info)
    Web API->>DB: Create assignment<br/>update status

    option Complete job
    Worker->>Worker: Start job
    activate Worker
    Worker-->>Worker: Job finished
    deactivate Worker

    option Store result files
    Note left of Worker: job includes S3 location
    Worker->>S3: Upload files

    option Report result
    Worker->>Web API: Result(status, payload)
    Web API->>DB: Create JobResult<br/>Update JobAssignment<br/>Update Job

    end

    critical User workflow
    loop User status checks
    User->>Web API: GET /:id
    Web API-->>User: Job status + details
    end

    option complete task
    User->>Web API: GET /:id
    Web API-->>User: Job results
    User->>Web API: GET /:id/download
    Web API->>S3: Presign URLs
    S3-->>Web API: Presigned URLs[]
    Web API-->>User: urls: Map<key, url>
    User->>User: download files
    User->>User: visualise results
    end

    end
```

### Job cache

Jobs are cached in the following way. When you request to create a job, the payload and type are cached. Job(s) in the system may exist with this hash - these are retrieved. If no matching hashes, then the job is created and cached is false in the response. If there are matches, we first disregard failed jobs (so we aren't hitting stale fails in the job system), then sort by status (succeeded is priority), then by time (newest first). The 'best' cached result is returned, by letting the user instead know about the existing ID, rather than a new item.

This request is still logged as a JobRequest, however no new Job is created.

The interface can then blindly accept the job ID and poll it as usual, finding in this case that there may be a successful result already.

### API Routes

#### Job Management

- POST /api/jobs - Create new job
- GET /api/jobs/:id - Get job details
- POST /api/jobs/:id/cancel - Cancel a job

#### Worker Node API

- GET /api/jobs/poll - Get available jobs, optional query param: jobType. Returns jobs that are PENDING and have no valid assignments.
- POST /api/jobs/assign - Assign job to worker. Creates assignment record with storage location.
- POST /api/jobs/assignments/:id/result - Submit job results - Updates job status and stores result if successful.

### Job Types

Each job type must define:

1. Input payload schema (required)
2. Result payload schema (optional)

Example job type configuration:

```typescript
const jobTypeSchemas = {
  SUITABILITY_ASSESSMENT: {
    input: z.object({
      fieldsHere: z.string()
    }),
    result: z
      .object({
        fieldsHere: z.string()
      })
      .optional()
  }
};
```

## Security

- Uses `helmet` for HTTP headers
- JWT-based authentication with RS256 algorithm
- Secrets management using AWS Secrets Manager

## Notes

- Include the JWT token in the Authorization header for authenticated requests
- Handle token expiration (default 1 hour) by refreshing or redirecting to login

## Troubleshooting

### Database Connection Issues

- **Issue**: Can't connect to database with `localhost`

  - **Solution**: Try using `127.0.0.1` instead in your connection string

- **Issue**: "Connection refused" error
  - **Solution**: Make sure Docker is running and the container is up
  - **Check**: `docker ps` to confirm PostgreSQL container is running

### JWT Authentication Issues

- **Issue**: Invalid token errors
  - **Solution**: Make sure you've run `npm run local-keys` to generate keys
  - **Check**: `.env` file for JWT-related environment variables

### Prisma Client Generation Errors

- **Issue**: Prisma client not found

  - **Solution**: Run `npm run prisma-generate`

- **Issue**: Migration errors
  - **Solution**: Check your database connection and try `npm run db-reset`

## Administering the EFS service instance

- connect to the instance using AWS SSM Connect (go to AWS -> EC2 -> Find the service instance -> Connect -> Connect using SSM)

then get into the ubuntu user and mount the volume

```bash
sudo su - ubuntu
cd ~
./mountefs.sh
```

This should mount the data into `/efs/data` with `/efs/data/reefguide` being the targeted data directory.
