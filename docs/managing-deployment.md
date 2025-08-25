---
title: Using CDK to manage a ReefGuide AWS deployment
---

## What is CDK?

Cloud Development Kit is an open-source Infrastructure as Code solution built by AWS (and the open source community) which allows you to programmatically define infrastrucutre using code (in this case Typescript).

CDK compiles or 'synths' to Cloudformation templates, which AWS's CloudFormation can use to create, manage and destroy resources as part of a managed collection known as a 'stack'.

ReefGuide has it's infrastructure defined in a stack in the `packages/infra` folder.

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
