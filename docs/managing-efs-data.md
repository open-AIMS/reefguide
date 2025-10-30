# Managing EFS Data for AWS deployment

The job system uses elastic file system (EFS) which is Amazon's solution for network mounted file systems.

This allows nodes in the ECS Fargate deployments to share files seamlessly so long as they are volume mounted into the docker containers at runtime.

## Current uses

- data files for ReefGuideWorker.jl (i.e. critiera layers, reef data)
- data packages for ADRIAReefGuideWorker.jl (data packages for Moore reef and GBR)

## How we manage data in the EFS file store

There is no obvious way to move data from your local system to EFS directly - instead you use an S3 bucket as a middle-man storage.

## Helper scripts

`ReefGuide` provides a suite of EFS scripts which help manage this process. They are documented thoroughly [here](https://github.com/open-AIMS/reefguide/blob/main/packages/infra/README.md#efs-management-scripts). The below guide will provide a worked example of updating the data files for an existing deployment, and clearing out the EFS cache files.

## Process guide

Below we will show a worked example of performing a complete update of the `ReefGuideWorker` data files, removing the regional data cache and other cached layers, and prompting a data spec reload.

### Setup the `infra` package

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

Now move into the infra package and build

```bash
cd packages/infra
turbo build
```

### Establish CDK configuration

ReefGuide uses a detached config management approach where the config repo stores a JSON configuration for the target stages separately. The below will show a quick guide, but the system is thoroughly documented in [Configuring CDK](https://github.com/open-AIMS/reefguide/blob/main/packages/infra/README.md#configuring-cdk).

First, **identify the repo clone URL, namespace and stage for your private config repo**, then

```
./config <namespace> <stage> --target <repo clone url>
```

e.g.

```
./config aims test --target git@github.com:open-AIMS/reefguide-config.git
```

You should see an output similar to

```
Cloning repository into temporary directory: /tmp/tmp.Wn0N8YcVSR
Cloning into '/tmp/tmp.Wn0N8YcVSR'...
remote: Enumerating objects: 133, done.
remote: Counting objects: 100% (133/133), done.
remote: Compressing objects: 100% (68/68), done.
remote: Total 133 (delta 19), reused 131 (delta 17), pack-reused 0 (from 0)
Receiving objects: 100% (133/133), 13.20 KiB | 13.20 MiB/s, done.
Resolving deltas: 100% (19/19), done.
Warning: Directory /tmp/tmp.Wn0N8YcVSR/aims/base does not exist. Skipping.
Copying files from /tmp/tmp.Wn0N8YcVSR/aims/test to current directory
Cleaning up temporary directory: /tmp/tmp.Wn0N8YcVSR
Configuration update complete for namespace: aims, stage: test, branch: main
```

And should now have the corresponding JSON config file in `configs/*.json` e.g. we have a `test` stage file `test.json`.

Now, in the same terminal session, export the name of your config file

```bash
export CONFIG_FILE_NAME=test.json
```

### Setup AWS credentials

You will need active credentials to the target deployment in AWS, so via whatever usual means, ensure your terminal session has the appropriate permissions. You can check with a command such as

```
aws sts get-caller-identity
```

Also **ensure the region is setup** e.g. `export AWS_DEFAULT_REGION=ap-southeast-2`.

### [Terminal 1] Connect to management EC2 instance

As part of the ReefGuide stack, an EC2 instance is deployed which has the correct networking and security configuration to enable reading and writing into the EFS instance. We will now connect to this instance.

I recommend having two terminals running, in each

- ensure `export CONFIG_FILE_NAME=<file name>.json` has been run
- AWS credentials are active
- AWS region is setup

On our first terminal, we are going to establish a AWS Session Manager (SSM) connection to the instance. We use a helper script to achieve this.

Run (from within `packages/infra`)

```bash
./scripts/connect-efs.sh
```

This will

- lookup your config file
- determine the AWS account and stack name
- lookup a CloudFormation output for the deployed ReefGuide stack to retrieve the instance ID
- determine if the instance is on, if not, start it up
- start an SSM session (a SSH session) once the instance is ready

If the instance is not warmed up, you may need to run the script a few times until it connects:

```
./scripts/connect-efs.sh
```

Once connected you will see output similar to

```
[CONNECT] Starting interactive SSM session with instance: i-abcd
[CONNECT] You will be connected as ssm-user. Use 'sudo su - ubuntu' to switch to ubuntu user.
[CONNECT] Type 'exit' to end the session.

Starting session with SessionId: 1234
$
```

You can now follow the tip and run

```bash
sudo su - ubuntu
```

Once connected and in `/home/ubuntu` as above, run the following:

```bash
./mountefs.sh
```

You should see files inside `~/efs`, where the elastic file system is mounted, if you previously have set things up, otherwise, it could be empty.

You can use the ranger file CLI utility for navigating the file system remotely and moving data - see [docs](https://github.com/ranger/ranger/wiki/Official-User-Guide) - launchable with `ranger` in the terminal directly. Or you can use regular shell commands.

Leave this connection active, and we will now move some data over!

### [Terminal 2] Upload data files

We have a zip file in our local file system containing the `ReefGuideWorker` files, so let's upload it to the EC2 instance. This can be done using the helper scripts.

Note

- the local file path
- the desired remote file path **relative to the `~/efs` path**

I am going to make a folder to hold these temporary files, so **in our SSM session Terminal 1** run:

```bash
cd ~/efs
mkdir downloads
```

Then **in terminal 2**,

you can see the command structure with:

```bash
./scripts/auto-copy-to-efs.sh --help
```

We are going to copy a zip file, so we use:

```bash
./scripts/auto-copy-to-efs.sh ~/GBR-ReefGuidance_processed_2025-07-01.zip downloads/gbr.zip
```

noting the first argument is the file path to the source file, and the latter the file path relative `~/efs` to upload to.

This script will

- follow a similar process to get the instance details
- upload the file to S3 (zipping it first if --zip is applied)
- use SSM to execute commands remotely to download the files to the EC2 instance

The script polls the command status, which can take some time (as it may involve large file downloads on the server side). The script should validate the success of the commands, but we can check the data downloaded correctly using the session in **Terminal 1**.

```bash
cd ~/efs
cd downloads
ls
```

You should see your downloaded files e.g. `gbr.zip`.

**Note**: You don't have to download to a temporary folder, if you just want to overwrite a specific file/folder, you can specify the upload directly to that location, potentially meaning **you don't even need to connect to the instance**!

## Managing the data using the SSM session

Now the data is uploaded to the instance, you can use a typical SSH file management approach to move that data to the correct locations.

In our case, I am going to a) delete the existing data for ReefGuideWorker b) unzip and copy the new data in c) prompt a data spec reload d) validate functionality - but this will be in a separate guide.

See [forcing a complete data spec reload](./prompting-data-spec-reload.md).

## Tidying up

Once finished, don't leave superfluous data on the EFS store, as this is charged per GBhour. Additionally, shutdown (but don't terminate) i.e. 'stop' the EC2 management instance. It can just be started up again next time it is needed.
