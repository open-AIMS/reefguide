---
title: Clearing job cache
---

## What is the job cache?

The job cache is a cache layer which responds with existing jobs, rather than creating new ones, when the job parameters are identical. This saves wasteful repeated computation, and makes the user experience faster. It also provides a simple mechanism which allows projects to rapidly 'reload' from the cache, rather than having to recompute every time they are loaded up.

Unfortunately, caching can mean stale data. **If the data processing changes significantly, or the data layers which inform the processing change, you may want to invalidate the cache to force these jobs to recompute when next requested**.

This process is easy using the provided CLI tooling.

## Setup the CLI

Follow the [guide here](./setting-up-reefguide-cli.md) to setup the CLI.

All cache related CLI commands are available under

```bash
pnpm start cache <command>
```

you can list them with `--help`

```bash
pnpm start cache --help
```

## How to list job types

To list job types:

```
$> pnpm start cache list-types

📋 Available job types for cache management:

1. TEST
2. SUITABILITY_ASSESSMENT
3. REGIONAL_ASSESSMENT
4. DATA_SPECIFICATION_UPDATE
5. ADRIA_MODEL_RUN
```

## How to clear it for a specific job type

Use the `invalidate <type>` command, e.g.

```
$> pnpm start cache invalidate ADRIA_MODEL_RUN

🔄 Starting cache invalidation process...
Using API endpoint from environment: http://localhost:5000/api
Using username from environment: worker@email.com
Using password from environment variables
🔐 Logging in...
✅ Login successful
⚠️  You are about to invalidate cache for job type: ADRIA_MODEL_RUN
This will mark all existing results for this job type as invalid.
New job requests will not use cached results until new jobs complete.
🗑️  Invalidating cache for job type: ADRIA_MODEL_RUN...
✅ Cache invalidated for job type ADRIA_MODEL_RUN
📊 Affected results: 4
✅ Cache invalidation completed successfully.
```

## How to clear it for all job types

Use the `invalidate-all` command, e.g.

```
$>pnpm start cache invalidate-all

🔄 Starting cache invalidation for ALL job types...
Using API endpoint from environment: http://localhost:5000/api
Using username from environment: worker@email.com
Using password from environment variables
🔐 Logging in...
✅ Login successful
⚠️  WARNING: You are about to invalidate cache for ALL job types:
   - TEST
   - SUITABILITY_ASSESSMENT
   - REGIONAL_ASSESSMENT
   - DATA_SPECIFICATION_UPDATE
   - ADRIA_MODEL_RUN

This will mark ALL existing job results as invalid.
This is a destructive operation that cannot be undone.
🗑️  Invalidating cache for job type: TEST...
✅ Cache invalidated for job type TEST
📊 Affected results: 0
🗑️  Invalidating cache for job type: SUITABILITY_ASSESSMENT...
✅ Cache invalidated for job type SUITABILITY_ASSESSMENT
📊 Affected results: 15
🗑️  Invalidating cache for job type: REGIONAL_ASSESSMENT...
✅ Cache invalidated for job type REGIONAL_ASSESSMENT
📊 Affected results: 13
🗑️  Invalidating cache for job type: DATA_SPECIFICATION_UPDATE...
✅ Cache invalidated for job type DATA_SPECIFICATION_UPDATE
📊 Affected results: 8
🗑️  Invalidating cache for job type: ADRIA_MODEL_RUN...
✅ Cache invalidated for job type ADRIA_MODEL_RUN
📊 Affected results: 0

✅ Cache invalidation for all job types completed.
📊 Total results affected: 36
```
