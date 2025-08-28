# Locally developing the capacity manager

## Purpose

The capacity manager is critical to spin up workers which poll for jobs in the job system. However, it is a piece of the ReefGuide infrastructure which is heavily tied to AWS services (namely ECS).

For this reason, it is not part of the local development workflow.

However, the below process can be used to develop features locally against AWS infrastructure.

## AWS Pre-reqs

**Authentication**:

You need to have a session/environment with AWS permissions e.g. PowerUserAccess. Use your usual method to setup an environment where a running Node process will have AWS credentials (e.g. environment variable keys, SSO session etc).

**Deployment**:

You need to have a working AWS deployment to target (given this is about developing against a real ECS cluster).

## Usual setup

Perform the usual repository setup steps, i.e.

Ensure the ReefGuide repository is installed and configured.

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

Build the client

```
pnpm generate
```

## Building a capacity manager `.env` file

The capacity manager's configuration is largely auto-generated from a large number of dynamic AWS resources, and therefore is very difficult to build manually. `infra` provides a script to automate this process by inspecting a deployed cloudformation stack and it's task definition.

Move into the `infra` folder and build

```
cd packages/infra
turbo build
```

Now, identify your CDK configuration file name - you can see more details about this in [deploying with CDK](./deploying-with-cdk#config) and export it

```
export CONFIG_FILE_NAME=test.json
```

then run the script

```
./scripts/build-capacity-env.sh
```

You should see an output similar to:

```
[INFO] Starting build-capacity-env script
[INFO] No stack name provided as argument, reading from config file
[INFO] Reading config from: configs/test.json
[INFO] Found stack name in config: test-reefguide
[INFO] Using stack: test-reefguide
[INFO] Output file: ../capacity-manager/.env
[INFO] Slugified stack name: testreefguide
[INFO] Looking for output key: testreefguidecapacityManagerTaskDfn
[INFO] Getting output 'testreefguidecapacityManagerTaskDfn' from stack: test-reefguide
[INFO] Task definition ARN: arn:aws:ecs:ap-southeast-2:xxxx:task-definition/testreefguidejobsystemcapacitymanagertask26B0B0E5:17
[INFO] Getting task definition details: arn:aws:ecs:ap-southeast-2:xxxx:task-definition/testreefguidejobsystemcapacitymanagertask26B0B0E5:17
[INFO] Building .env file: ../capacity-manager/.env
[WARN] Output file already exists: ../capacity-manager/.env
Do you want to overwrite it? [y/N]: y
[INFO] Overwriting existing file
[INFO] Processing regular environment variables...
[INFO] Processing secrets...
[INFO] Processing secret: API_USERNAME -> arn:aws:secretsmanager:ap-southeast-2:xxxx:secret:manageruserpass03861B03-ZuLoTihRXiA7-TsFher:username::
[INFO] Parsed secret ARN: arn:aws:secretsmanager:ap-southeast-2:xxxx:secret:manageruserpass03861B03-ZuLoTihRXiA7-TsFher
[INFO] Parsed field: 'username'
[INFO] Fetching secret: arn:aws:secretsmanager:ap-southeast-2:xxxx:secret:manageruserpass03861B03-ZuLoTihRXiA7-TsFher (key: username)
[INFO] Successfully resolved secret for: API_USERNAME
[INFO] Processing secret: API_PASSWORD -> arn:aws:secretsmanager:ap-southeast-2:xxxx:secret:manageruserpass03861B03-ZuLoTihRXiA7-TsFher:password::
[INFO] Parsed secret ARN: arn:aws:secretsmanager:ap-southeast-2:xxxx:secret:manageruserpass03861B03-ZuLoTihRXiA7-TsFher
[INFO] Parsed field: 'password'
[INFO] Fetching secret: arn:aws:secretsmanager:ap-southeast-2:xxxx:secret:manageruserpass03861B03-ZuLoTihRXiA7-TsFher (key: password)
[INFO] Successfully resolved secret for: API_PASSWORD
[INFO] Generated .env file with 53 lines
[INFO] Successfully created .env file: ../capacity-manager/.env
[INFO] You can now use this file with: source ../capacity-manager/.env
```

You may be prmopted to overrwrite an existing .env file - press yes if you would like to do this.

## Running the capacity manager

From the repo root:

```
cd packages/capacity-manager
```

Build/install

```
pnpm i
turbo build
```

Then run the capacity manager:

```
pnpm run start
```

You should see output similar to

```
Setting up config
Validating configuration
Loading application configuration
Processing job type: TEST
Building config for job type: TEST
Validated config for job type: TEST
Processing job type: SUITABILITY_ASSESSMENT
Building config for job type: SUITABILITY_ASSESSMENT
Validated config for job type: SUITABILITY_ASSESSMENT
Processing job type: REGIONAL_ASSESSMENT
Building config for job type: REGIONAL_ASSESSMENT
Validated config for job type: REGIONAL_ASSESSMENT
Processing job type: DATA_SPECIFICATION_UPDATE
Building config for job type: DATA_SPECIFICATION_UPDATE
Validated config for job type: DATA_SPECIFICATION_UPDATE
Processing job type: ADRIA_MODEL_RUN
Building config for job type: ADRIA_MODEL_RUN
Validated config for job type: ADRIA_MODEL_RUN
Grouping job types by task ARN
Validating complete configuration
Configuration successfully loaded and validated
Setting up sentry logger integration
[2025-08-28T00:38:59.491Z] [INFO] Initializing API client
[2025-08-28T00:38:59.495Z] [INFO] Initializing capacity manager
[2025-08-28T00:38:59.500Z] [INFO] Starting capacity manager
[2025-08-28T00:38:59.500Z] [INFO] Starting capacity manager...
[2025-08-28T00:38:59.501Z] [INFO] Poll started
[2025-08-28T00:38:59.502Z] [INFO] Health check server listening on port 3000
[2025-08-28T00:38:59.504Z] [INFO] Logging in to API
[2025-08-28T00:39:02.949Z] [INFO] Poll started
[2025-08-28T00:39:05.969Z] [INFO] Poll started
```

This will be a live reloading instance of the capacity manager, with which you can debug against the real stack.

**Warning**: You will be competing against/racing against another deployed capacity manager. If this is an issue you could manually update it's service configuration to deploy zero instances, or otherwise just deal with the race conditions.
