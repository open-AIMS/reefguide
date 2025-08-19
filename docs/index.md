---
title: ReefGuide Docs
---

Welcome to the docs, pages are listed below

- [Managing EFS data](./managing-efs-data.md) - instructions on how to read and write files to the shared job system node storage
- [Migrating production DB](./migrating-production-db.md) - instructions on how to migrate your databases using the Prisma ORM
- [Deploying CDK app](./deploying-with-cdk.md) - instructions on how to configure and use CDK to deploy the AWS infrastructure
- [Monitoring](./monitoring.md) - guidance on monitoring solution employed for ReefGuide's production deployment

`ReefGuide`, along with [this repo](https://github.com/open-AIMS/reefguide), utilises or refers to components in the following repos:

- [ReefGuide.jl](https://github.com/open-AIMS/ReefGuide.jl) - ReefGuide Julia library code
- [ReefGuideWorkerTemplate.jl](https://github.com/open-AIMS/ReefGuideWorkerTemplate.jl) - A foundational template to implement Julia workers
- [ReefGuideWorker.jl](https://github.com/open-AIMS/ReefGuideWorker.jl) - Julia Job Worker to run ReefGuide algorithms
- [ADRIAReefGuideWorker.jl](https://github.com/open-AIMS/ADRIAReefGuideWorker.jl) - Julia Job Worker to run ADRIA algorithms for ReefGuide
- [ADRIA.jl](https://github.com/open-AIMS/ADRIA.jl) - The ADRIA model Julia library code, used by ADRIAReefGuideWorker.jl
