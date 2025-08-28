---
title: Running unit tests and linting checks
---

## Unit tests

The ReefGuide has unit tests for the web-api package - which constitutes most of the application logic for the system.
Currently, the unit tests involve reading and writing from the database (rather than mocking all of these operations). To keep this simple, we use a docker compose workflow to setup a local psql db for testing.

### Pre-requisites

You need to have `docker` installed, and the typical repo setup performed e.g.

Setup pnpm and turbo

```bash
# Install pnpm globally if not already installed
npm install -g pnpm
# setup pnpm if not done already
pnpm setup
# re-source your bashrc to apply pnpm config changes (or start a new terminal session)
source ~/.bashrc
# Install turbo globally
pnpm install -g turbo
```

Install dependencies:

```bash
# Install deps
pnpm i
```

Build the client

```bash
pnpm generate
```

Build the repo

```bash
turbo build
```

### Running tests

Start the local PostgreSQL database:

```bash
docker compose up -d
```

Now we setup the environment variables and the .env file for testing.

```bash
# Copy environment file and enable test mode
cd packages/web-api && cp .env.dist .env

# Put TEST_MODE=true in the bottom of the .env file
echo -e "\nTEST_MODE=true" >> .env

# Generate local keys
pnpm run local-keys

# Reset database
cd ../db && cp .env.dist .env && pnpm run db-reset
```

Run the tests (from the repository root)

```bash
# From repo root
npx turbo test --filter=@reefguide/web-api
```

Clean up (from repo root)

```bash
# From repo root
docker compose down
```

and to remove volumes:

```bash
# From repo root
docker compose down -v
```

## Linting checks

### Normal setup

Perform the setup steps as above, i.e.

```bash
# Install deps
pnpm i
```

Build the client

```bash
pnpm generate
```

Build the repo

```bash
turbo build
```

### Type checks

Run type checking:

```bash
turbo type-check --force
```

### Linting

Run linter:

```bash
turbo lint --force
```

### Fixing lint issues

Some lint problems can be fixed i.e.

```bash
turbo fix --force
```

### Combined lint and fix

The `format-lint.sh` script combines some helpful linting and checking operations:

```bash
turbo='pnpm turbo'
$turbo format:write --force && $turbo fix --force && $turbo lint --force
```

so you can run

```
./format-lint.sh
```
