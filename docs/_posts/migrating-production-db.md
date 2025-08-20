# Database Migration Guide

This guide will describe how to use our ORM `prisma`, to migrate your production database.

## Install dependencies

Ensure the ReefGuide repository is installed and configured:

```bash
# Install pnpm globally if not already installed
npm install -g pnpm
# setup pnpm if not done already
pnpm setup
# re-source your bashrc to apply pnpm config changes (or start a new terminal session)
source ~/.bashrc
# Install turbo globally
pnpm install -g turbo
# Install deps
pnpm i
# Build prisma client
pnpm generate
```

## Build DB package

```bash
cd packages/db
turbo build
```

## Setup placeholder .env file

```bash
cp .env.dist .env
```

## Fill out .env with DB connection details

Database credentials are stored in AWS Secrets Manager as an auto-generated secret.

1. **Access AWS Console** - Navigate to AWS Secrets Manager
2. **Locate Secret** - Find the secret named: `reefguidedbinstancesecret` or similar
3. **Retrieve Credentials** - Note/copy the database connection details

Now fill out your `.env` template file:

```env
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
```

You will need to map the fields in this format, i.e.

```
postgreslql://<username>:<password>@<host>:<port>/<dbname>?sslmode=require
```

For example, below is a complete example

```
DATABASE_URL=postgresql://reefguide:<REDACTED>@reefguide-dbinstance123456-x3rxwnt9bwli.cukzufj87cty.ap-southeast-2.rds.amazonaws.com/reefguide?sslmode=require?connect_timeout=15&pool_timeout=15
```

You can verify connection with

```
pnpm prisma migrate status
```

**⚠️ Security Note**: Never commit production credentials to version control. Use environment variables or secure secret management in production deployments.

## Run prisma commands

All Prisma commands can be run using:

```bash
pnpm prisma <command>
```

To see status:

```
pnpm prisma migrate status
```

To apply migrations to a DB:

```bash
pnpm prisma migrate deploy
```

## Verification

After migration, verify the deployment:

```bash
# Check migration status
pnpm prisma migrate status

# Optionally run Prisma Studio to inspect the database
pnpm prisma studio
```
