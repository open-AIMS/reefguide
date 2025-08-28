# ReefGuide Documentation

Documentation for ReefGuide, a cloud-based platform for reef management and analysis, deployed on AWS infrastructure.

## Getting Started

### [Deploying with CDK](./deploying-with-cdk.md)

Guide to deploying ReefGuide infrastructure 'from-scratch' using AWS CDK, including prerequisites, configuration setup, and deployment operations.

### [Component overview](./component-overview.md)

Provides a high level description of the pieces that form ReefGuide.

## Development

### [Locally developing the capacity manager](./locally-developing-capacity-manager.md)

Guide for developing and debugging the capacity manager locally against AWS infrastructure, including environment setup and configuration generation.

**Use cases:** Developing capacity manager features, debugging job system issues, testing worker scaling

### [Unit tests and linting](./unit-tests-and-linting.md)

How to run the unit tests, format and lint code, locally.

## Operations & Management

### [Performing CDK operations on ReefGuide](./managing-deployment.md)

Once you have a deployed CDK ReefGuide stack, how do you maintain it i.e. run CDK deploy, diff, destroy. This guide explains the high level steps to deploy an update to ReefGuide.

### [Managing Users](./managing-user-access.md)

How to manage user registration, roles and bulk changes.

**Use cases:** Helping users register, pre-authorising users, managing users in bulk

### [Managing EFS Data](./managing-efs-data.md)

Instructions for reading, writing, and managing files in the shared job system storage using AWS Elastic File System (EFS).

**Use cases:** Updating data files, managing worker node data, file system operations

### [Clearing the job cache](./clearing-job-cache.md)

Instructions on how to invalidate jobs from the cache when data becomes stale.

**Use cases:** Invalidating individual job types, invalidating all job types, invalidate cache

### [Database Migration](./migrating-production-db.md)

Guide for migrating databases using the Prisma ORM, including credential management and verification procedures.

**When to use:** Schema updates, production database changes

### [Database Backup and Restore](./backup-and-restore-db.md)

Guide for dumping and restoring data from the PostgreSQL application database.

**When to use:** Taking backups, restoring from backups, disaster recovery

### [Setting up the ReefGuide CLI](./setting-up-reefguide-cli.md)

Configure the administrative command-line interface for managing ReefGuide instances, including user management and system operations.

**Features:** User auditing, cache management, administrative tasks

## Troubleshooting & Debugging

### [Debugging ReefGuide](./debugging-reefguide.md)

Troubleshooting guide for AWS ECS services, covering web API, capacity manager, and worker nodes with common issue resolution.

**Covers:** ECS task debugging, log analysis, startup failures, EFS mount issues

### [Data Specification Reload](./prompting-data-spec-reload.md)

Guide for updating the system's data specifications and clearing cached regional data to reflect new parameter configurations.

**When needed:** After data updates, parameter changes, cache invalidation

## Monitoring

### [Monitoring](./monitoring.md)

Overview of the monitoring stack including uptime monitoring with Uptime Kuma and error tracking with BugSink.

**Components:** Uptime monitoring, error tracking, status pages, alerting

## System Architecture

ReefGuide is built using:

- **Infrastructure:** AWS ECS Fargate, RDS PostgreSQL, EFS, CloudFront
- **Backend:** Node.js/Express API with Prisma ORM
- **Frontend:** Angular application
- **Workers:** Julia-based computation nodes
- **Deployment:** AWS CDK for Infrastructure as Code
- **Monitoring:** Open-source stack (Uptime Kuma + BugSink)

## Related Repositories

ReefGuide is part of a larger ecosystem of repositories:

- [**ReefGuide**](https://github.com/open-AIMS/reefguide) - Main application repository
- [**ReefGuide.jl**](https://github.com/open-AIMS/ReefGuide.jl) - Core Julia library
- [**ReefGuideWorker.jl**](https://github.com/open-AIMS/ReefGuideWorker.jl) - Julia job worker for ReefGuide algorithms
- [**ADRIAReefGuideWorker.jl**](https://github.com/open-AIMS/ADRIAReefGuideWorker.jl) - ADRIA model integration worker
- [**ADRIA.jl**](https://github.com/open-AIMS/ADRIA.jl) - ADRIA model library
- [**ReefGuideWorkerTemplate.jl**](https://github.com/open-AIMS/ReefGuideWorkerTemplate.jl) - Template for implementing workers
