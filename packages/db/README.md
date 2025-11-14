# @reefguide/db

Database client and schema for ReefGuide platform.

## Overview

This package provides the Prisma-based database layer for ReefGuide, including schema definitions, migrations, and a configured client instance.

## Database Structure

The ReefGuide database is built around several core entities:

### User Management

- **User**: Core user accounts with email/password authentication
- **UserRole**: Enum defining user permissions (ADMIN only at the moment)
- **UserLog**: Audit trail for user actions (login, logout, password changes)
- **RefreshToken**: JWT refresh token management

### Geographic Data

- **Polygon**: User-submitted geographic polygons stored as GeoJSON
- **PolygonNote**: Comments and annotations on polygons

### Job Processing System

- **Job**: Asynchronous job definitions (suitability assessments, regional assessments)
- **JobRequest**: User requests that trigger job creation
- **JobAssignment**: ECS task assignments for job processing
- **JobResult**: Completed job outputs and storage references

### Assessment Criteria

- **Region**: Geographic regions for assessments
- **Criteria**: Assessment parameters with display information
- **RegionalCriteria**: Region-specific criteria bounds and defaults

## Available Scripts

### Development

```bash
# Generate Prisma client
npm run generate

# Open Prisma Studio (database GUI)
npm run studio

# Build the package
npm run build
```

### Database Management

```bash
# Reset database (⚠️ DESTRUCTIVE - removes all data)
npm run db-reset

# Apply schema changes to database
npx prisma db push

# Create a new migration
npx prisma migrate dev --name <migration-name>

# Apply migrations in production
npx prisma migrate deploy
```

### Code Quality

```bash
# Type checking
npm run type-check

# Linting
npm run lint
npm run fix

# Formatting
npm run format:check
npm run format:write
```

## Database Management

### Creating Migrations

When you modify the Prisma schema (`prisma/schema.prisma`):

1. **Development Environment**:

   ```bash
   npx prisma migrate dev --name describe-your-changes
   ```

   This creates a new migration file and applies it to your development database.

2. **Review the Migration**:
   Check the generated SQL in `prisma/migrations/` to ensure it matches your intentions.

### Applying Migrations

- **Development**: Migrations are applied automatically with `prisma migrate dev`
- **Production**: Use `npx prisma migrate deploy` in your deployment pipeline

### Schema Changes Workflow

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name your-change-description`
3. Test your changes locally
4. Commit both schema and migration files
5. Deploy using `npx prisma migrate deploy`

### Database Reset and Seeding

⚠️ **Warning**: The `db-reset` command will completely wipe your database.

```bash
# Complete database reset (development only)
npm run db-reset

# If you have seed data
npx prisma db seed
```

### Inspecting the Database

```bash
# Open Prisma Studio web interface
npm run studio

# Generate client after schema changes
npm run generate
```

## Usage in Applications

The package exports a configured Prisma client singleton:

```typescript
import { prisma } from '@reefguide/db';

// Use the client
const users = await prisma.user.findMany();
```

For cases requiring multiple instances:

```typescript
import { PrismaClient } from '@reefguide/db';

const customClient = new PrismaClient();
```

## Environment Variables

### Setup

1. Copy the example environment file:

   ```bash
   cp .env.dist .env
   ```

2. Edit `.env` and update the variables for your environment:
   ```bash
   # Example values - replace with your actual database credentials
   DATABASE_URL="postgresql://username:password@localhost:5432/reefguide"
   DIRECT_URL="postgresql://username:password@localhost:5432/reefguide"
   ```

### Required Variables

- `DATABASE_URL`: Primary database connection string (used for application queries)
- `DIRECT_URL`: Direct database connection (used for migrations and schema operations - [Prisma documentation](https://www.prisma.io/docs/orm/reference/prisma-config-reference#datasourcedirecturl))

## Binary Targets

The package is configured for deployment on RHEL with OpenSSL 1.0.x:

```prisma
binaryTargets = ["native", "rhel-openssl-1.0.x"]
```

## Key Features

- **Type Safety**: Full TypeScript support with generated types
- **Connection Pooling**: Configured for production workloads
- **Logging**: Development query logging, production error logging
- **Multi-environment**: Supports different database configurations per environment

## Troubleshooting

### Migration Issues

- If migrations fail, check your database connection and permissions
- Use `npx prisma migrate status` to see migration state
- For production issues, consider `npx prisma migrate resolve` for manual intervention

### Client Generation

- Run `npm run generate` after schema changes
- Restart your application after client regeneration

### Connection Problems

- Verify `DATABASE_URL` and `DIRECT_URL` environment variables
- Check database connectivity and credentials
- Ensure database exists and is accessible
