import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ReefGuideNetworking } from './components/networking';
import { DeploymentConfig } from './infraConfig';
import { ReefGuideFrontend } from './components/reefGuideFrontend';
import { JobSystem } from './components/jobs';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { Db } from './components/db';
import { JobType } from '@reefguide/db';
import { ECSWebAPI } from './components/ecsWebAPI';

export const STANDARD_EXCLUSIONS = [
  'node_modules',
  '.git',
  '.turbo',
  'packages/infra',
  '.env',
  '.env**',
  '.github',
  '.turbo',
  '.vscode',
  'build',
  'dist',
  'cdk.out'
];

export interface ReefguideWebApiProps extends cdk.StackProps {
  config: DeploymentConfig;
}

// All of these endpoints need to be added to CSP for front-end
const ARC_GIS_ENDPOINTS = ['https://*.arcgis.com', 'https://*.arcgisonline.com'];

export class ReefguideStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ReefguideWebApiProps) {
    super(scope, id, props);

    // Pull out main config
    const config = props.config;

    /**
     * Generates an AWS secret manager secret for a given email to be used as
     * seeded credentials by the API
     * @param id The id of the secret to generate
     * @param email The email to use as username field
     * @returns Secret generated with {username: <email>, password: <random>}
     */
    const credBuilder = (id: string, email: string) => {
      return new sm.Secret(this, id, {
        // {username, password}
        generateSecretString: {
          passwordLength: 16,
          secretStringTemplate: JSON.stringify({
            username: email
          }),
          excludePunctuation: true,
          includeSpace: false,
          generateStringKey: 'password'
        },
        removalPolicy: cdk.RemovalPolicy.DESTROY
      });
    };

    // Manager service creds
    const managerCreds = credBuilder('manager-userpass', 'manager@service.com');
    const adminCreds = credBuilder('admin-userpass', 'admin@service.com');
    const workerCreds = credBuilder('worker-userpass', 'worker@service.com');

    // DNS SETUP
    // =========

    // Setup the hosted zone for domain definitions
    const hz = route53.HostedZone.fromHostedZoneAttributes(this, 'hz', {
      hostedZoneId: config.hostedZone.id,
      zoneName: config.hostedZone.name
    });

    // Domain configurations
    const domains = {
      webAPI: `${config.domains.webAPI}.${config.domains.baseDomain}`,
      frontend: `${config.domains.frontend}.${config.domains.baseDomain}`
    };

    // CERTIFICATES
    // ============

    // Primary certificate for the hosted zone
    const primaryCert = acm.Certificate.fromCertificateArn(
      this,
      'primary-cert',
      config.certificates.primary
    );

    // CloudFront certificate
    const cfnCert = acm.Certificate.fromCertificateArn(
      this,
      'cfn-cert',
      config.certificates.cloudfront
    );

    // NETWORKING
    // ==========

    // Setup networking infrastructure
    const networking = new ReefGuideNetworking(this, 'networking', {
      certificate: primaryCert
    });
    const cluster = networking.cluster;

    // Setup RDS if desired TODO it would be nice to automatically provide these
    // credentials rather than require the user to inject them into the secret
    // themselves! It creates a chicken and egg issue
    if (config.db) {
      // Deploy RDS postgresql 16_4 instance if specified
      new Db(this, 'db', {
        vpc: networking.vpc,
        instanceSize: config.db.instanceSize,
        storageGb: config.db.storageGb
      });
    }

    // ==============
    // STORAGE BUCKET
    // ==============

    // Create S3 bucket for job results
    const storageBucket = new s3.Bucket(this, 'job-storage', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          // Clean up after 30 days
          expiration: cdk.Duration.days(30)
        }
      ],
      cors: [
        {
          // Needed for presigned URLs to work with various headers
          allowedHeaders: ['*'],
          // Typically only GET and PUT are needed for presigned operations
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          // TODO tighten this for security - okay for now as only presigned
          // URLs exposed and want them to be easy to use from anywhere
          allowedOrigins: ['*']
        }
      ]
    });

    // ========
    // Web API
    // ========

    let webAPI: ECSWebAPI;

    // ECS mode
    if (config.webAPI.mode.ecs !== undefined) {
      webAPI = new ECSWebAPI(this, 'web-api', {
        certificate: primaryCert,
        config: config.webAPI,
        storageBucket,
        domainName: domains.webAPI,
        hz: hz,
        managerCreds: managerCreds,
        workerCreds: workerCreds,
        adminCreds: adminCreds,
        cluster: cluster,
        sharedBalancer: networking.sharedBalancer,
        vpc: networking.vpc
      });
    } else {
      // Lambda mode
      cdk.Annotations.of(this).addDeprecation('LambdaWebAPI', 'Lambda deployment depcreated');
      cdk.Annotations.of(this).addError(
        'Deployment failed - no lambda deployment target. See historic open-AIMS/reefguide-web-api'
      );
      throw Error('Deployment failed.');
    }

    // ========
    // FRONTEND
    // ========
    const _reefGuideFrontend = new ReefGuideFrontend(this, 'frontend', {
      usEastCertificate: cfnCert,
      config: config.frontend,
      domainName: domains.frontend,
      hz: hz,
      // This overrides CSP to allow the browser to use these endpoints
      // App may generate blob object URLs.
      cspEntries: [
        // S3 bucket downloads within this region
        `https://*.s3.${cdk.Stack.of(this).region}.amazonaws.com`,
        webAPI.endpoint,
        'blob:'
      ].concat(ARC_GIS_ENDPOINTS),
      webApiEndpoint: webAPI.endpoint,
      adminEmail: config.frontend.adminEmail,
      appName: config.frontend.appName
    });

    const { jobSystem } = config;
    const { capacityManager, workers } = jobSystem;
    const { reefguide, adria } = workers;

    new JobSystem(this, 'job-system', {
      vpc: networking.vpc,
      cluster: cluster,
      storageBucket,
      apiEndpoint: webAPI.endpoint,
      capacityManager: {
        cpu: capacityManager.cpu,
        memoryLimitMiB: capacityManager.memoryLimitMiB,
        pollIntervalMs: capacityManager.pollIntervalMs
      },
      workers: [
        // Reefguide Worker
        {
          // This worker handles both tests and suitability assessments, as well
          // as some misc jobs
          jobTypes: [
            JobType.SUITABILITY_ASSESSMENT,
            JobType.REGIONAL_ASSESSMENT,
            JobType.TEST,
            JobType.DATA_SPECIFICATION_UPDATE
          ],
          // Use configurable image tag
          workerImage: `ghcr.io/open-aims/reefguideworker.jl/reefguide-worker:${reefguide.imageTag}`,
          // Configurable performance settings
          cpu: reefguide.cpu,
          memoryLimitMiB: reefguide.memoryLimitMiB,
          serverPort: 3000,

          // Launch the worker
          ...(reefguide.sysimage
            ? // Sysimage mode!
              {
                command: [
                  '--project=@app',
                  '-t',
                  'auto',
                  '-J',
                  reefguide.sysimage.sysimagePath,
                  '--sysimage-native-code=yes',
                  '-e',
                  'using ReefGuideWorker; ReefGuideWorker.start_worker()'
                ],
                entrypoint: ['julia']
              }
            : // Normal mode
              {
                command: [
                  '--project=@app',
                  '-t',
                  'auto',
                  '-e',
                  'using ReefGuideWorker; ReefGuideWorker.start_worker()'
                ],
                entrypoint: ['julia']
              }),
          // Configurable scaling parameters
          desiredMinCapacity: reefguide.scaling.desiredMinCapacity,
          desiredMaxCapacity: reefguide.scaling.desiredMaxCapacity,
          scalingFactor: reefguide.scaling.scalingFactor,
          scalingSensitivity: reefguide.scaling.scalingSensitivity,
          cooldownSeconds: reefguide.scaling.cooldownSeconds,

          // This specifies where the config file path can be found for the
          // worker task
          env: {
            CONFIG_PATH: '/data/reefguide/config.toml',
            JULIA_DEBUG: 'ReefGuideWorker',
            DATA_PATH: '/data/reefguide',
            CACHE_PATH: '/data/reefguide/cache'
          },

          // Mount up the reefguide API shared storage
          efsMounts: {
            efsReadWrite: [networking.efs],
            volumes: [
              {
                name: 'efs-volume',
                efsVolumeConfiguration: {
                  fileSystemId: networking.efs.fileSystemId,
                  rootDirectory: '/data/reefguide',
                  transitEncryption: 'ENABLED',
                  authorizationConfig: { iam: 'ENABLED' }
                }
              }
            ],
            mountPoints: [
              {
                sourceVolume: 'efs-volume',
                containerPath: '/data/reefguide',
                readOnly: false
              }
            ]
          }
        },
        // ADRIA worker
        {
          jobTypes: [JobType.ADRIA_MODEL_RUN],
          // Use configurable image tag
          workerImage: `ghcr.io/open-aims/adriareefguideworker.jl/adria-reefguide-worker:${adria.imageTag}`,
          // Configurable performance settings
          cpu: adria.cpu,
          memoryLimitMiB: adria.memoryLimitMiB,
          serverPort: 3000,
          command: ['using ADRIAReefGuideWorker; ADRIAReefGuideWorker.start_worker()'],
          // Configurable scaling parameters
          desiredMinCapacity: adria.scaling.desiredMinCapacity,
          desiredMaxCapacity: adria.scaling.desiredMaxCapacity,
          scalingFactor: adria.scaling.scalingFactor,
          scalingSensitivity: adria.scaling.scalingSensitivity,
          cooldownSeconds: adria.scaling.cooldownSeconds,
          env: {
            // ADRIA PARAMS
            ADRIA_OUTPUT_DIR: '/tmp/reefguide',
            ADRIA_NUM_CORES: '4',
            ADRIA_DEBUG: 'false',
            ADRIA_THRESHOLD: '1e-8',

            // worker config
            JULIA_DEBUG: 'ADRIAReefGuideWorker',
            // Moore cluster data package
            MOORE_DATA_PACKAGE_PATH: '/data/reefguide/adria/datapackages/Moore_2025-01-17_v070_rc1',
            // GBR RME cluster data package
            GBR_DATA_PACKAGE_PATH: '/data/reefguide/adria/datapackages/rme_ml_2024_01_08',
            // Don't use network FS for this - to speed up IO and reduce $
            DATA_SCRATCH_SPACE: '/tmp/reefguide'
          },

          // Mount up the reefguide API shared storage
          efsMounts: {
            efsReadWrite: [networking.efs],
            volumes: [
              {
                name: 'efs-volume',
                efsVolumeConfiguration: {
                  fileSystemId: networking.efs.fileSystemId,
                  rootDirectory: '/data/reefguide',
                  transitEncryption: 'ENABLED',
                  authorizationConfig: { iam: 'ENABLED' }
                }
              }
            ],
            mountPoints: [
              {
                sourceVolume: 'efs-volume',
                containerPath: '/data/reefguide',
                readOnly: false
              }
            ]
          }
        }
      ],
      workerCreds,
      managerCreds
    });
  }
}
