# ReefGuide

## Quick start

Make sure you have `nvm` and `docker` (rootless) installed, then run 

```
./local-dev.sh
```

This will set everything up with reasonable defaults for a local dev.

## Manual setup

Use node e.g. v24

```
nvm install 24
nvm use 24
```

We are using pnpm, so make sure this is installed

```
npm i pnpm -g
```

## Installing dependencies

```
pnpm i
```

## Run turbo commands

Using the installed turbo

```
npx turbo ...
```

Or global install (using npm)

```
npm turbo -g
turbo ...
```

## Spinning up docker and minio

```
docker compose up -d
```

## Build

```
turbo build
```

## Dev

Make sure postgres and minio running with 

```
docker compose up -d
```

If you are using the minio bucket, you will need to create the bucket. The `local-dev.sh` script does this for you.

Then

```
turbo dev
```

Or just 

```
./local-dev.sh
```

## Format

```
turbo format:write
turbo format:check
```

## Linting and fixing

```
turbo lint
turbo fix
```
