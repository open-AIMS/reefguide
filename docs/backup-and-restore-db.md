# Database backup and restore

## Table of Contents

1. [System Overview](#system-overview)
2. [Taking Backups](#taking-backups)
   - [AWS RDS Snapshots](#aws-rds-snapshots)
   - [Manual Database Dumps](#manual-database-dumps)
3. [Restoring from Backups](#restoring-from-backups)
   - [From AWS Snapshots](#from-aws-snapshots)
   - [From Database Dump Files](#from-database-dump-files)
4. [Quick Reference](#quick-reference)

## Quick Reference

The below commands are from within `packages/db`.

**Remember:** Always update your `.env` file to target the correct database before running backup or restore operations.

| Task                 | Command                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| Create manual dump   | `pnpm run db:dump`                                                      |
| Restore from dump    | `pnpm run db:restore backup.sql`                                        |
| View RDS snapshots   | AWS Console → RDS → DB Instances → [instance] → Maintenance and backups |
| Take manual snapshot | AWS Console → "Take snapshot" button                                    |

## System Overview

The ReefGuide system uses AWS RDS PostgreSQL with two backup approaches:

- **RDS Snapshots**: Full database instance backups managed by AWS. These capture the entire database state but require creating a new RDS instance to restore from.
- **PostgreSQL Dumps**: Logical backups created using `pg_dump`. These create SQL files that can be restored directly into existing databases.

**Key Constraint**: RDS snapshots cannot be applied directly to existing databases. You must restore to a new instance, then dump and restore the data to your target database.

## Taking Backups

### AWS RDS Snapshots

AWS automatically creates daily snapshots of the ReefGuide database. Manual snapshots can also be created on demand.

**To view snapshots:**

1. Navigate to AWS RDS console
2. Go to DB Instances and select your instance
3. Open the "Maintenance and backups" tab
4. View available snapshots or click "Take snapshot" for manual backup

![snapshots](./assets/snapshots.png)

### Manual Database Dumps

Database dumps create portable SQL files using PostgreSQL tools.

**Prerequisites:**
Install PostgreSQL client tools:

```bash
sudo apt update
sudo apt install postgresql-client
```

**Create a dump:**

1. Navigate to the database package:

   ```bash
   cd packages/db
   cp .env.dist .env
   ```

2. Update the `DATABASE_URL` in `.env` file:

   ```
   DATABASE_URL=postgresql://reefguide:PASSWORD@HOSTNAME/reefguide?sslmode=require
   ```

3. Create the backup:
   ```bash
   pnpm run db:dump
   ```

This creates a `backup.sql` file in the current directory.

## Restoring from Backups

### From AWS Snapshots

Since snapshots cannot be applied directly to existing databases, you need to create a temporary instance:

1. **Create new RDS instance from snapshot:**
   - Follow [AWS documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RestoreFromSnapshot.html)
   - Deploy to the same VPC, subnet, and security group as your target database
   - The new instance uses the same credentials as the original

2. **Dump data from temporary instance:**
   - Update `.env` to target the temporary instance
   - Run `pnpm run db:dump` to create a backup file

3. **Restore to target database:**
   - Update `.env` to target your application database
   - Follow the dump file restore process below

### From Database Dump Files

Restore SQL dump files directly into your target database:

1. **Configure environment:**

   ```bash
   cd packages/db
   ```

   Update `.env` to target your destination database

2. **Restore the dump:**

   ```bash
   pnpm run db:restore <path/to/dump.sql>
   ```

   Example:

   ```bash
   pnpm run db:restore backup.sql
   ```

**Note:** The restore includes Prisma migration status. See [migrating DB documentation](./migrating-production-db.md) for post-restore migration steps.
