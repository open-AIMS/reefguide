import { StaticWebsite } from '@cloudcomponents/cdk-static-website';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { ReefGuideFrontendConfig } from '../infraConfig';
import { STANDARD_EXCLUSIONS } from '../infra';

/**
 * Properties for the ReefGuideFrontend construct
 */
export interface ReefGuideFrontendProps {
  /** Fully qualified domain name */
  domainName: string;
  /** The Hosted Zone to produce record in */
  hz: route53.IHostedZone;
  /** The DNS certificate to use for CloudFront */
  usEastCertificate: acm.ICertificate;
  /** The configuration object for the ReefGuideFrontend service */
  config: ReefGuideFrontendConfig;
  /** CSP entries and endpoints */
  cspEntries: string[];
  /** Enable debugging settings @default false*/
  debugMode?: boolean;
  /** Path to monorepo root (relative to infrastructure) @default '../..' */
  buildPath?: string;
  /** Endpoints for services needed */
  webApiEndpoint: string;
  /** Admin email address to contact for access */
  adminEmail: string;
  /** App name to display in login panel */
  appName: string;
  /** The Sentry DSN for the app */
  sentryDsn?: string;
}

/**
 * Construct for the ReefGuideFrontend service
 */
export class ReefGuideFrontend extends Construct {
  /** The S3 bucket used for static file hosting */
  public bucket!: s3.Bucket;
  /** The CloudFront distribution */
  public distribution!: cloudfront.Distribution;
  /** The full domain name */
  public endpoint!: string;
  /** Bucket ARN output */
  public bucketArnOutput!: cdk.CfnOutput;
  /** Bucket name output */
  public bucketNameOutput!: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: ReefGuideFrontendProps) {
    super(scope, id);

    // Setup distribution and static bucket hosting
    this.setupDistribution(props);

    // Build and deploy the frontend TODO this is not working at the moment due
    // to the BucketDeployment custom resource being extremely slow
    this.setupBundling(props);

    // Setup outputs
    this.setupOutputs();
  }

  private setupDistribution(props: ReefGuideFrontendProps) {
    const website = new StaticWebsite(this, 'staticweb', {
      hostedZone: props.hz,
      domainNames: [props.domainName],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300)
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(300),
          responsePagePath: '/index.html'
        }
      ],
      certificate: props.usEastCertificate,
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          // enable connection to the various API services needed
          contentSecurityPolicy: `connect-src 'self' ${props.cspEntries.join(' ')}`,
          override: true
        }
      }
    });

    this.bucket = website.bucket;
    this.distribution = website.distribution;
    this.endpoint = `https://${props.domainName}`;
  }

  private setupBundling(props: ReefGuideFrontendProps) {
    // Default to monorepo root
    const buildPath = props.buildPath ?? '../..';
    const packageName = '@reefguide/app';
    const outputPath = 'packages/app/dist/adria-app/browser';

    // Build environment variables from config
    const environment: { [key: string]: string } = {
      NODE_ENV: 'production',
      NG_APP_WEB_API_URL: props.webApiEndpoint,
      NG_APP_ADRIA_API_URL: 'https://fake.com',
      NG_APP_SPLASH_ADMIN_EMAIL: props.adminEmail,
      NG_APP_SPLASH_APP_NAME: props.appName,
      NG_APP_SPLASH_SHOW_BACKGROUND_MAP: 'true',
      NG_APP_DOCUMENTATION_LINK: 'https://open-aims.github.io/reefguide',
      NG_APP_ABOUT_LINK: 'https://github.com/open-AIMS/reefguide',
      // Sentry DSN
      ...(props.sentryDsn ? { NG_APP_SENTRY_DSN: props.sentryDsn } : {})
    };

    // Setup deployment with build process
    new s3deploy.BucketDeployment(this, 'deployment', {
      destinationBucket: this.bucket,
      // Setup with distribution so that deployment will invalidate cache
      distribution: this.distribution,
      distributionPaths: ['/*'],
      // Reasonable memory limit - 128MB is default which is extremely poro
      memoryLimit: 2048,
      sources: [
        s3deploy.Source.asset(buildPath, {
          // Exclude common directories that shouldn't be included
          exclude: STANDARD_EXCLUSIONS,
          // Generate asset hash based on the specific app directory
          // This ensures rebuilds only when the app code changes
          assetHashType: cdk.AssetHashType.SOURCE,

          // Use git style ignoring
          ignoreMode: cdk.IgnoreMode.GIT,

          bundling: {
            // Include environment variables for bundling
            environment,
            // Use Node.js 24 runtime image
            image: lambda.Runtime.NODEJS_LATEST.bundlingImage,
            // Docker build commands
            command: [
              'bash',
              '-c',
              `
                # Install pnpm globally
                npm install -g pnpm@latest
                
                # Navigate to source directory
                cd /asset-input
                
                # Install dependencies
                pnpm install --frozen-lockfile

                # Please don't use .env
                rm -f packages/app/.env

                # Run pnpm generate
                pnpm run generate
                
                # Build the specific package using turbo
                npx turbo build --filter=${packageName}
                
                # Copy built files to output, excluding map files
                cd ${outputPath} && find . -type f ! -name "*.js.map" ! -name "*.css.map" -exec cp --parents {} /asset-output/ \\;
              `
            ],
            // Local bundling for faster development
            local: {
              tryBundle(outputDir: string): boolean {
                console.log('Attempting local bundling for ReefGuide frontend...');

                try {
                  const { execSync } = require('child_process');

                  // Build environment variable exports
                  const envExports = Object.entries(environment)
                    .map(
                      ([key, value]) =>
                        `echo 'export ${key}="${value}"' && export ${key}="${value}"`
                    )
                    .join(' && ');

                  // Execute build commands
                  const commands = [
                    // Export environment variables
                    envExports,
                    // Navigate to build directory
                    `cd ${buildPath}`,
                    // Install dependencies
                    'pnpm install --frozen-lockfile',
                    // Ensure client is generated
                    'pnpm run generate',
                    // Double check there is no .env file!
                    '[ -f packages/app/.env ] && cp packages/app/.env packages/app/backup.env || echo "No .env file to backup"',
                    // Remove
                    'rm -f packages/app/.env',
                    // Build the app using turbo
                    `npx turbo build --filter=${packageName}`,
                    'ORIGINAL_PATH=$(pwd)',
                    // Copy output files excluding map files
                    `cd ${outputPath} && find . -type f ! -name "*.js.map" ! -name "*.css.map" -exec cp --parents {} ${outputDir} \\;`,
                    // Return to where we were
                    'cd $ORIGINAL_PATH',
                    // Restore backup if it exists
                    '[ -f packages/app/backup.env ] && cp packages/app/backup.env packages/app/.env && rm packages/app/backup.env || echo "No .env backup to restore"'
                  ];

                  console.log('Executing build commands:', commands.join(' && '));

                  execSync(commands.join(' && '), {
                    stdio: 'inherit',
                    cwd: process.cwd()
                  });

                  console.log('Local bundling completed successfully');
                  return true;
                } catch (error) {
                  console.log('Local bundling failed, falling back to Docker:', error);
                  return false;
                }
              }
            }
          }
        })
      ]
    });
  }

  private setupOutputs() {
    // Bucket ARN output
    this.bucketArnOutput = new cdk.CfnOutput(this, 'frontend-bucket-arn', {
      value: this.bucket.bucketArn,
      description: 'ARN of the S3 bucket used for website content'
    });

    // Bucket name output
    this.bucketNameOutput = new cdk.CfnOutput(this, 'frontend-bucket-name', {
      value: this.bucket.bucketName,
      description: 'Name of the S3 bucket used for website content'
    });

    //// CloudFront distribution URL
    new cdk.CfnOutput(this, 'distribution-url', {
      value: this.distribution.distributionDomainName,
      description: 'URL of the CloudFront distribution'
    });

    // Website URL
    new cdk.CfnOutput(this, 'website-url', {
      value: this.endpoint,
      description: 'URL of the website'
    });

    // Distribution ID for manual cache invalidation if needed
    new cdk.CfnOutput(this, 'distribution-id', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID'
    });
  }
}
