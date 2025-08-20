# Prompting a data specification reload

The `ReefGuide` system provides information about parameters available to the frontend through an object called the `data spec`. This is updated daily as a cron-job, however, currently, you need to perform a cleanup process of the cached Regional Data to see these changes reflected.

This guide **follows on from [managing EFS data](./managing-efs-data.md)** - it is **assumed you have uploaded replacement data to your EC2 management instance and have an active SSM session** - if not, please see this guide first!

## Deleting old files

**Warning**: This could cause downtime - you may wish to schedule downtime for production systems and stop any active workers.

Assuming you have your new data ready, we are going to cleanup the old cache files.

**Proceed with caution** - ensure you are confident of your data structure, and what you wish to modify.

```bash
rm -f data/reefguide/cache/*
```

We are also going to remove all the ReefGuide data layers which are the files in `data/reefguide` which are not folders - I use ranger for these kind of operations.

### A note on Ranger

You can use the ranger file CLI utility for navigating the file system remotely and moving/modifying data - see [docs](https://github.com/ranger/ranger/wiki/Official-User-Guide) - launchable with `ranger` in the terminal directly. Or you can use regular shell commands.

So, proceed to remove any stale data files as needed in your use case.

## Move new files in

As per the previous guide, we have our zipped data folder in `~/efs/downloads/gbr.zip`, so

```bash
cd ~/efs/downloads
unzip gbr.zip
rm gbr.zip
mv ~/efs/downloads/GBR-ReefGuidance_processed_2025-07-01/* ~/efs/data/reefguide/
```

You can use ranger, or the normal CLI to validate your files are where you want them. Now, let's prompt a data spec reload operation!

## Setup the CLI

Setting up the CLI requires a few quick steps, this is detailed in [setting up the ReefGuide CLI](./setting-up-reefguide-cli.md). Follow these steps, and return here once you have setup the `ReefGuide CLI`.

## Run the data spec reload job

```bash
cd packages/cli
pnpm start data-spec reload
```

This task will take some time, as it involves

- launching a data spec job
- waiting for the worker to launch
- the worker starting up, and rebuilding a fresh regional data cache
- reporting this back and marking the job complete

After the job completes, validate the desired features/functions in the app.

## [Optional] Invalidate jobs from the job cache

You may wish to invalidate specific jobs or job types from the job system cache.

After [setting up the CLI](./setting-up-reefguide-cli.md), you can invalidate specific job types from the cache using the cache module of the CLI.

To see commands:

```bash
cd packages/cli
pnpm start cache --help
```

To see job types:

```
pnpm start cache list-types
```

To invalidate a job type:

```
pnpm start cache invalidate SUITABILITY_ASSESSMENT
```

## Debugging data spec reloads

To debug, if something goes wrong, consider

- is the file structure correct in the EFS?
- was the regional data cache rebuilt with the latest data?
- are you seeing old jobs (you may need to invalidate the job cache(s) as above)

If the job never, runs, is something going wrong with ECS?

See [debugging ReefGuide](./debugging-reefguide#debugging-ecs-worker-nodes) for details on how to monitor/debug ECS nodes that won't start, or fail.
