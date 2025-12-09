# Using CDK to manage a ReefGuide AWS deployment

## What is CDK?

Cloud Development Kit is an open-source Infrastructure as Code solution built by AWS (and the open source community) which allows you to programmatically define infrastrucutre using code (in this case Typescript).

CDK compiles or 'synths' to Cloudformation templates, which AWS's CloudFormation can use to create, manage and destroy resources as part of a managed collection known as a 'stack'.

ReefGuide has it's infrastructure defined in a stack in the `packages/infra` folder.

## How to update your stack

Usually, after merging changes to whatever git source you are deploying from, updating ReefGuide is a matter of:

- ensuring git is updated/pushed
- running the CDK deploy pipeline
- running any DB migrations if needed - see [here](./migrating-production-db.md)
- managing any data changes needed - see [here](./managing-efs-data.md)

The process below explains the two methods to run the CDK deploy operation:

- [manually](#manual-cdk-operations)
- [GH actions pipeline](#github-actions-and-cdk)

## Manual CDK operations

To run manual CDK operations, refer to the extensive guide [here](./deploying-with-cdk). If you have an existing deployment, you can skip to [CDK operations](./deploying-with-cdk#cdk-operations).

## GitHub Actions and CDK

We have defined a pipeline which can deploy/diff the CDK stack for ReefGuide as a GitHub actions workflow.

The pipeline has the following required configuration, which should be part of the GitHub environment you are targetting.

### Environment Variables

Set in GitHub repository settings under `Environments > dev > Environment variables`:

| Variable                 | Description                                                                      |
| ------------------------ | -------------------------------------------------------------------------------- |
| `CDK_CONFIG_REPO_PATH`   | Path to configuration repository                                                 |
| `CDK_DEPLOY_BRANCH`      | Branch to use from config repo                                                   |
| `CDK_DEPLOY_ENVIRONMENT` | Target deployment environment (must match a path/environment in the config repo) |
| `CDK_DEPLOY_GA_ROLE_ARN` | AWS IAM role ARN for GitHub Actions                                              |
| `CDK_DEPLOY_NAMESPACE`   | Deployment namespace                                                             |

### Environment Secrets

Set in GitHub repository settings under `Environments > dev > Environment secrets`:

| Secret                  | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `CDK_CONFIG_REPO_TOKEN` | GitHub token with access to read the configuration repository |

### Triggering the pipeline

Use the workflow dispatch on the action to select:

- action (diff or deploy)
- environment (currently test or dev) - these are defined as dropdown options in the workflow file - so you may need to update to include additional options

The pipeline final stage should console log the diff/deploy steps. This is the preferred operational deployment pathway as it reduces the chance of localised build environment differences to deployed artifacts.

### What code was deployed?

Currently, we do not version releases and the commit sha is not captured in the deployment itself.
To determine what code was deployed:

1. open the [CDK Deploy workflow run on GitHub](https://github.com/open-AIMS/reefguide/actions/workflows/deploy-aws-cdk.yml)
2. expand "Display Repository Info"
3. copy the Commit SHA
4. lookup this commit in your git log viewer or GitHub
  `https://github.com/open-AIMS/reefguide/tree/<commit sha>`

#### Worker Image Version?

In the config project `imageTag` is `latest`, which makes deployment less deterministic. The Image URL is something like:  
`ghcr.io/open-aims/reefguideworker.jl/reefguide-worker:latest`

Open AWS Console, look at a ECS Task and find the "Image Digest"

<img width="1290" height="344" alt="image" src="https://github.com/user-attachments/assets/c701679d-39fc-404f-b0ea-4862a2d57e22" />

In the corresponding worker GitHub project, view the [Packages](https://github.com/open-AIMS/ReefGuideWorker.jl/pkgs/container/reefguideworker.jl%2Freefguide-worker). 
Find the matching digest SHA (expand `...`).

<img width="1053" height="311" alt="image" src="https://github.com/user-attachments/assets/12a1f291-c5e2-4186-afc4-4c38ed89a714" />

The other sha is the git commit that was built and uploaded to the container registry. In this example, it's [sha-600005f](https://github.com/open-AIMS/ReefGuideWorker.jl/commit/600005fc677bd06ff5df0b6c72bd84b22eb826a0)

_TODOC is there a way to query on this digest SHA?_  
_TODOC - does AWS ECS pull the image at cdk deploy time, or when tasks are created?_
