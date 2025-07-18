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
2. **ECS Cluster**: Hosts various Fargate services.
3. **Application Load Balancer (ALB)**: Handles incoming traffic and distributes it to the ECS services.
4. **API Gateway**: Manages the REST API for the Web API service.
5. **Lambda Function**: Runs the Web API service.
6. **EFS (Elastic File System)**: Provides persistent storage for the worker nodes.
7. **S3 Bucket**: Used for intermediary data transfer between the user and the EC2 service instance which mounts the EFS.
8. **EC2 Instance**: Manages the EFS filesystem.
9. **Route 53**: Handles DNS routing.
10. **ACM (AWS Certificate Manager)**: Manages SSL/TLS certificates.
11. **Secrets Manager**: Stores sensitive configuration data.

### Service Architecture

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

- Modify `src/components/` files to adjust individual service configurations.
- Update `src.ts` to change overall stack structure.
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

You can use the below manual process to connect to the EFS volume, or use the management scripts below in [efs scripts](#efs-management-scripts).

Connect to the instance using AWS SSM Connect (go to AWS -> EC2 -> Find the service instance -> Connect -> Connect using SSM)

then get into the ubuntu user and mount the volume

```bash
sudo su - ubuntu
cd ~
./mountefs.sh
```

This should mount the data into `/efs/data` with `/efs/data/reefguide` being the targeted data directory.

## EFS Management Scripts

A collection of scripts for managing files on AWS EFS through EC2 instances using AWS Systems Manager (SSM).

### Overview

These scripts provide a seamless way to:

- Upload files/directories to EFS without direct network access
- Auto-discover EFS connection details from CloudFormation stacks
- Connect interactively to EFS management instances
- Handle large transfers efficiently via the CDK deployed s3 data transfer bucket

### Scripts

#### `copy-to-efs.sh` - Core Transfer Script

Uploads local files or directories to EFS via EC2 instance using SSM.

```bash
./copy-to-efs.sh [--zip] <local_path> <remote_target> <s3_bucket> <ec2_instance_id>
```

**Options:**

- `--zip`: Compress directories before transfer

**Examples:**

```bash
# Upload single file
./copy-to-efs.sh ./data.csv reports/data.csv my-bucket i-1234567890abcdef0

# Upload directory
./copy-to-efs.sh ./dataset/ analysis/dataset/ my-bucket i-1234567890abcdef0

# Upload directory as zip (faster)
./copy-to-efs.sh --zip ./dataset/ analysis/dataset/ my-bucket i-1234567890abcdef0
```

#### `get-efs-target.sh` - Connection Discovery

Extracts EFS connection details from CloudFormation stack outputs.

```bash
CONFIG_FILE_NAME=test.json ./get-efs-target.sh [stack-name]
```

**Output:** `<s3_bucket> <ec2_instance_id>`

#### `copy-to-efs-auto.sh` - Automated Transfer

Combines discovery and transfer in one command.

```bash
CONFIG_FILE_NAME=test.json ./copy-to-efs-auto.sh [--zip] <local_path> <remote_target>
```

#### `connect-efs.sh` - Interactive Session

Connects to EFS management instance via SSM for direct access.

```bash
CONFIG_FILE_NAME=test.json ./connect-efs.sh [stack-name]
```

### Configuration

#### Environment Variables

- `CONFIG_FILE_NAME`: Your config file name (e.g., `test.json`, `prod.json`)

#### Config File Format

Place config files in `configs/${CONFIG_FILE_NAME}`:

```json
{
  "stackName": "your-cloudformation-stack-name",
  ...
}
```

### Prerequisites

#### Local Machine

1. **AWS CLI** configured with appropriate credentials
2. **jq** for JSON parsing: `brew install jq` (macOS) or `apt install jq` (Ubuntu)
3. **zip/unzip** utilities (usually pre-installed)
4. **AWS Session Manager plugin** (for `connect-efs.sh`):

   **macOS:**

   ```bash
   curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac/sessionmanager-bundle.zip" -o "sessionmanager-bundle.zip"
   unzip sessionmanager-bundle.zip
   sudo ./sessionmanager-bundle/install -i /usr/local/sessionmanagerplugin -b /usr/local/bin/session-manager-plugin
   ```

   **Ubuntu/Debian:**

   ```bash
   curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"
   sudo dpkg -i session-manager-plugin.deb
   ```

#### AWS Permissions

Your AWS credentials need:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:DescribeStacks",
        "cloudformation:ListStacks",
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ssm:SendCommand",
        "ssm:GetCommandInvocation",
        "ssm:DescribeInstanceInformation",
        "ssm:StartSession",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "*"
    }
  ]
}
```

#### EC2 Instance

The EFS management instance is deployed and configured automatically by the CDK stack with all necessary permissions and dependencies.

### Usage Patterns

#### Quick Transfer

```bash
export CONFIG_FILE_NAME=prod.json

# Upload and auto-discover connection details
./copy-to-efs-auto.sh --zip ./my-data target/location
```

#### Replace ReefGuideWorker sysimage (example)

```bash
/scripts/auto-copy-to-efs.sh ../../../ReefGuideWorker.jl/sysimages/reefguide_img.so data/reefguide/sysimages/ReefGuideWorker.so
```

#### Manual Transfer

```bash
# Get connection details
CONFIG_FILE_NAME=test.json ./get-efs-target.sh
# Output: my-transfer-bucket i-1234567890abcdef0

# Use details directly
./copy-to-efs.sh --zip ./data target/data my-transfer-bucket i-1234567890abcdef0
```

#### Interactive Management

```bash
# Connect to instance
CONFIG_FILE_NAME=test.json ./connect-efs.sh

# Once connected:
sudo su - ubuntu
./mountefs.sh
ls -la /home/ubuntu/efs/
```

### Troubleshooting

#### Common Issues

- **"jq not found"**: Install jq: `brew install jq` or `apt install jq`
- **"SessionManagerPlugin not found"**: Install Session Manager plugin (see Prerequisites)
- **"CONFIG_FILE_NAME not set"**: Export the environment variable
- **"Stack output not found"**: Verify your CloudFormation stack has the `efnConnectionInfo` output

#### Instance States

Scripts automatically handle starting stopped EC2 instances and waiting for SSM connectivity.
