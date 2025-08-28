# ReefGuide component overview

ReefGuide is an AWS cloud based system composed of four main components:

- an Angular browser frontend
- an ExpressJS REST Web API
- a PostgreSQL DB
- an asynchronous worker node based job system including
  - worker node Docker containers
  - capacity manager for ECS worker nodes

## System Components

### Core Application Layer

**Frontend (Angular Application)**

- Single-page application served via AWS CloudFront CDN
- Authentication and user session management
- Interactive mapping interface for site selection
- Job submission and result visualization
- Real-time job status monitoring

**Web API (Node.js/Express)**

- RESTful API server with JWT-based authentication
- Job lifecycle management and queue coordination
- User management with role-based access control
- Database operations through Prisma ORM
- Integration with AWS services (ECS, Secrets Manager)

**Database (PostgreSQL on RDS)**

- User accounts and authentication data
- Project and job metadata storage
- Result caching and retrieval
- Prisma schema definitions with migration support

### Compute and Processing Layer

**Capacity Manager (ECS Service)**

- Monitors job queues for pending work
- Auto-scales worker node capacity based on demand in ECS Fargate
- Manages ECS task lifecycle (creation, monitoring, cleanup)
- Integrates with AWS ECS APIs for container orchestration

**Worker Nodes (ECS Tasks)**

- Julia-based computational containers running on Fargate
- Process-specific workers: ReefGuideWorker.jl and ADRIAReefGuideWorker.jl
- Mount shared EFS storage for data access
- Report job progress and results back to API

### Data and Storage Layer

**Elastic File System (EFS)**

- Shared network storage mounted across all worker nodes
- Contains spatial data layers for reef analysis
- ADRIA model data packages and configuration files
- Regional assessment cache and processed datasets

**AWS Secrets Manager**

- Database credentials and connection strings
- Worker authentication tokens
- API keys and service credentials

### Infrastructure Layer

**AWS CDK Deployment**

- Infrastructure as Code definitions in TypeScript
- VPC, subnets, and security group configurations
- ECS cluster and service definitions
- RDS database and EFS file system setup
- Route 53 DNS and SSL certificate management

## Configuration Management

ReefGuide uses a detached configuration approach with a separate private repository containing environment-specific JSON configurations. This enables secure credential management and environment isolation while maintaining version control of infrastructure definitions.

The configuration system supports multiple deployment environments (e.g. dev, test, production) with stage-specific settings for AWS resources, domains, scaling parameters, and integration endpoints.

## Getting Started

For local development, run `./local-dev.sh` to set up the complete development environment with Docker containers for PostgreSQL and MinIO.

For production deployment, follow the **[Deploying with CDK](./deploying-with-cdk.md)** guide to establish AWS infrastructure and configure the system components.

For operational tasks on existing deployments, consult the relevant guides in the [home page](./index.md).
