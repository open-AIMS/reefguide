# Deploying ReefGuide with CDK

This guide describes how we use CDK to deploy ReefGuide, and explains common operational procedures.

## What is CDK

AWS CDK (Cloud Development Kit) is an infrastructure-as-code framework that allows you to define cloud resources using familiar programming languages. CDK synthesizes your code into CloudFormation templates, providing type safety and IDE support while managing AWS resources declaratively.

## Deployment with CDK

### Pre-requisites

Before deploying, ensure you have:

- **CDK Bootstrap**: Run `cdk bootstrap` in your target AWS account/region. Click [here](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) to learn more
- **AWS Account Access**: IAMPowerUser permissions minimum to create IAM roles, VPCs, and other resources
- **Node.js and pnpm**: Follow the main repository setup instructions (available at https://github.com/open-AIMS/reefguide).

### Domains and certificates

ReefGuide requires:

- **Route 53 Hosted Zone**: A hosted zone you can deploy routes to
- **SSL Certificates**:
  - Primary certificate for your domain region
  - CloudFront certificate in `us-east-1` region (required for CloudFront distributions)

Both certificates must be validated and cover your intended domain names.

### Config

ReefGuide uses a detached configuration management approach with a private configuration repository.

**Create a private configuration repository** with the following structure:

```
.
└── STAGE
    ├── prod
    │   ├── cdk.context.json
    │   └── configs
    │       └── prod.json
    └── test
        ├── cdk.context.json
        └── configs
            └── test.json
```

Where `STAGE` is replaced with the name of your namespace and `test`/`prod` are your deployment stages.

**Configuration files:**

- `cdk.context.json`: Copy this after your first deployment to ensure deterministic deployments
- `test.json`/`prod.json`: Stage-specific configuration (see sample below)

**Sample configuration** (adapt from `packages/infra/configs/sample.json`):

```json
{
  "stackName": "reef-guide-stack",
  "hostedZone": {
    "id": "Z1234567890ABCDEFGHIJ",
    "name": "example.com"
  },
  "certificates": {
    "primary": "arn:aws:acm:ap-southeast-2:123456789012:certificate/12345678-1234-1234-1234-123456789012",
    "cloudfront": "arn:aws:acm:us-east-1:123456789012:certificate/98765432-9876-9876-9876-987654321098"
  },
  "domains": {
    "baseDomain": "example.com",
    "webAPI": "api",
    "frontend": "app"
  },
  "aws": {
    "account": "123456789012",
    "region": "ap-southeast-2"
  },
  "webAPI": {
    "apiSecretsArn": "arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:api-secrets-123456",
    "nodeEnv": "production",
    "port": 5000,
    "mode": {
      "ecs": {
        "cpu": 1024,
        "memory": 2048,
        "autoScaling": {
          "enabled": true,
          "minCapacity": 1,
          "maxCapacity": 5,
          "targetCpuUtilization": 70,
          "targetMemoryUtilization": 95,
          "scaleInCooldown": 300,
          "scaleOutCooldown": 150
        }
      }
    }
  },
  "frontend": {
    "indexDocument": "index.html",
    "errorDocument": "error.html",
    "adminEmail": "admin@example.com",
    "appName": "ReefGuide"
  },
  "db": {
    "instanceSize": "SMALL",
    "storageGb": 20
  }
}
```

### Follow instructions in the CDK package to create your configuration

Navigate to the CDK package directory and follow the README instructions to:

1. **Setup API Secrets**: Create an AWS Secrets Manager secret containing your API secrets (there is a script to help with this)
2. **Configure CDK deployment**: Set up the required config values

The following values in the config JSON are not valid without modification:

```json
{
  "hostedZone": {
    "id": "Z1234567890ABCDEFGHIJ",
    "name": "example.com"
  },
  "certificates": {
    "primary": "arn:aws:acm:ap-southeast-2:123456789012:certificate/12345678-1234-1234-1234-123456789012",
    "cloudfront": "arn:aws:acm:us-east-1:123456789012:certificate/98765432-9876-9876-9876-987654321098"
  },
  "aws": {
    "account": "123456789012",
    "region": "ap-southeast-2"
  },
  "webAPI": {
    "apiSecretsArn": "arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:api-secrets-123456"
  },
  "frontend": {
    "adminEmail": "admin@example.com",
    "appName": "ReefGuide"
  }
}
```

You should save your configuration to your config repo as you work on it!

## CDK Operations

The below documents common CDK operations. To deploy your app, you can use the deploy operation below.

First, setup your config and environment, then run CDK operations.

### Configure to target your deployment

1. **Setup AWS Access**:

   ```bash
   # Export credentials or login with SSO
   export AWS_ACCESS_KEY_ID=your_key
   export AWS_SECRET_ACCESS_KEY=your_secret
   # OR use AWS SSO: aws sso login
   ```

2. **Set Configuration**:

   ```bash
   export CONFIG_FILE_NAME=test.json  # or other stage.json
   ```

3. **Install Dependencies**:

   ```bash
   pnpm install
   turbo build
   ```

4. **Load Configuration**:

   ```bash
   ./config aims test --target git@github.com:your-org/your-config-repo.git
   ```

### Synth

Generate CloudFormation templates without deploying:

```bash
cd packages/infra
pnpm cdk synth
```

This validates your CDK code and shows the generated CloudFormation template.

### Diff

Compare your current CDK code with the deployed stack:

```bash
cd packages/infra
pnpm cdk diff
```

Review changes before deploying to understand what resources will be modified.

### Deploy

Deploy the stack to AWS:

```bash
cd packages/infra
pnpm cdk deploy
```

Add `--require-approval never` to skip manual approval prompts in automated deployments.

### Destroy

Remove the entire stack and all resources:

```bash
cd packages/infra
pnpm cdk destroy
```

**⚠️ Warning**: This will delete all resources including databases, S3 buckets, and other persistent data. Use with extreme caution in production environments.
