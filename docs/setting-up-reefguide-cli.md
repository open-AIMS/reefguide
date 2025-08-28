---
title: Setting up the ReefGuide CLI
---

The CLI provides administrative management functions for operating a running ReefGuide instance. It requires some quick setup.

## Install dependencies

Follow the typical workflow to setup the repo for operations:

The below is required once for a from-scratch setup:

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

Now move into the cli package and build

```bash
cd packages/cli
turbo build
```

## Setup .env file template

```bash
cp .env.dist .env
```

## Populate real values

The following values must be configured in `.env`

```
# Username to use for commands
CLI_USERNAME=worker@email.com
# Password to use for commands
CLI_PASSWORD=password
# Endpoint for the CLI to connect to
CLI_ENDPOINT=http://localhost:5000/api
```

The `CLI_ENDPOINT` should the URL of the API deployed for your ReefGuide system.

The username and password can be either:

- an auto-generated administrative credential such as the worker or admin accounts
- your suitable user account for an admin user

I recommend the latter, so, in this `.env` file, enter the username and password for your account which has sufficient permissions for the operations you wish to perform.

## Run commands

Once you have setup your `.env` file for your needs, you can run a test command to ensure things are configured.

Commands should be run with the following structure:

```bash
pnpm start <commands for the CLI here>
```

e.g.

```
pnpm start user-audit list
```

## Operate ReefGuide

For other commands, you can explore with

```
pnpm start --help
```

including `--help` on subcommands,

or read the [README](https://github.com/open-AIMS/reefguide/blob/main/packages/cli/README.md).
