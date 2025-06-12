# ReefGuide Web API - Developer Guide

A REST API to support Reef Guide (AIMS), built with Express, TypeScript, Zod and Prisma, deployable to AWS using CDK.

## Table of Contents

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

## Administering the EFS service instance

- connect to the instance using AWS SSM Connect (go to AWS -> EC2 -> Find the service instance -> Connect -> Connect using SSM)

then get into the ubuntu user and mount the volume

```bash
sudo su - ubuntu
cd ~
./mountefs.sh
```

This should mount the data into `/efs/data` with `/efs/data/reefguide` being the targeted data directory.
