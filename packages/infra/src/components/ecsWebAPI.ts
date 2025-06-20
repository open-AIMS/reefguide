import * as cdk from 'aws-cdk-lib';
import { Duration, aws_iam as iam, aws_secretsmanager as sm } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as r53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { WebAPIConfig } from '../infraConfig';
import { SharedBalancer } from './networking';
import { STANDARD_EXCLUSIONS } from '../infra';

/**
 * Properties for the WebAPI construct
 */
export interface ECSWebAPIProps {
  // Fully qualified domain name
  domainName: string;
  /** The Hosted Zone to produce record in */
  hz: r53.IHostedZone;
  /** The DNS certificate to use for API Gateway */
  certificate: acm.ICertificate;
  /** The configuration object for the web api service */
  config: WebAPIConfig;
  /** The VPC to put this service into */
  vpc: ec2.IVpc;
  /** Shared balancer to use */
  sharedBalancer: SharedBalancer;
  /** The ECS cluster to put this service into */
  cluster: ecs.ICluster;
  /** The name of the ECS cluster service which hosts the Julia compute nodes */
  reefguideApiClusterName: string;
  /** The name of the ECS service which hosts the Julia compute nodes */
  reefguideApiServiceName: string;
  /** Creds to initialise for the manager and worker services */
  managerCreds: sm.Secret;
  workerCreds: sm.Secret;
  adminCreds: sm.Secret;
  /** The name of jobs system s3 bucket to store in */
  storageBucket: s3.IBucket;
}

/**
 * Construct for the web api service
 */
export class ECSWebAPI extends Construct {
  /** Internal port for the Web API service */
  public readonly internalPort: number;

  /** External HTTPS port for the Web API service */
  public readonly externalPort: number = 443;

  /** Endpoint for Web API access (format: https://domain:port) */
  public readonly endpoint: string;

  /** The underlying ECS service */
  public readonly fargateService: ecs.FargateService;

  private readonly taskDefinition: ecs.TaskDefinition;

  constructor(scope: Construct, id: string, props: ECSWebAPIProps) {
    super(scope, id);

    const config = props.config;
    const ecsConfig = props.config.mode.ecs;

    if (ecsConfig === undefined) {
      cdk.Annotations.of(this).addError(
        'You cannot deploy an ECS web API without providing the ECS mode configuration'
      );
      throw new Error(
        'You cannot deploy an ECS web API without providing the ECS mode configuration'
      );
    }

    // Build the public URL and expose
    this.internalPort = props.config.port;
    this.endpoint = `https://${props.domainName}`;

    // ==================
    // Web API deployment
    // ==================

    // CONTAINER SETUP

    // Image asset - build from repo root TODO optimise files included in build
    // cache here - going to rebuild a lot
    const image = ecs.ContainerImage.fromAsset('../..', {
      buildArgs: {
        PORT: String(this.internalPort),
        APP_NAME: '@reefguide/web-api'
      },
      exclude: STANDARD_EXCLUSIONS
    });

    // Task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'web-api-task-dfn', {
      ephemeralStorageGiB: 21, // 21GB ephemeral storage (minimum)
      cpu: ecsConfig.cpu,
      memoryLimitMiB: ecsConfig.memory
    });

    // R/W S3 bucket
    props.storageBucket.grantReadWrite(this.taskDefinition.taskRole);

    // DB secrets and JWT key info
    const apiSecrets = sm.Secret.fromSecretCompleteArn(this, 'db-creds', config.apiSecretsArn);

    // Attach container to task definition
    this.taskDefinition.addContainer('web-api-container-dfn', {
      image,
      portMappings: [
        {
          containerPort: this.internalPort,
          appProtocol: ecs.AppProtocol.http,
          name: 'web-api-port'
        }
      ],
      // entrypoint is node - so specify target file
      command: ['packages/web-api/build/src/index.js'],
      // Non secrets
      environment: {
        NODE_ENV: config.nodeEnv,
        PORT: String(this.internalPort),

        // Fully qualified domain for API domain - this defines the JWT iss
        API_DOMAIN: this.endpoint,
        AWS_REGION: cdk.Stack.of(this).region,

        // ECS cluster of ReefGuideAPI
        ECS_CLUSTER_NAME: props.reefguideApiClusterName,
        ECS_SERVICE_NAME: props.reefguideApiServiceName,

        // Storage bucket name
        S3_BUCKET_NAME: props.storageBucket.bucketName
      },
      secrets: {
        // API Secret
        DATABASE_URL: ecs.Secret.fromSecretsManager(apiSecrets, 'DATABASE_URL'),
        DIRECT_URL: ecs.Secret.fromSecretsManager(apiSecrets, 'DIRECT_URL'),
        JWT_PRIVATE_KEY: ecs.Secret.fromSecretsManager(apiSecrets, 'JWT_PRIVATE_KEY'),
        JWT_PUBLIC_KEY: ecs.Secret.fromSecretsManager(apiSecrets, 'JWT_PUBLIC_KEY'),
        JWT_KEY_ID: ecs.Secret.fromSecretsManager(apiSecrets, 'JWT_KEY_ID'),

        // Worker creds
        MANAGER_USERNAME: ecs.Secret.fromSecretsManager(props.managerCreds, 'username'),
        MANAGER_PASSWORD: ecs.Secret.fromSecretsManager(props.managerCreds, 'password'),

        WORKER_USERNAME: ecs.Secret.fromSecretsManager(props.workerCreds, 'username'),
        WORKER_PASSWORD: ecs.Secret.fromSecretsManager(props.workerCreds, 'password'),
        ADMIN_USERNAME: ecs.Secret.fromSecretsManager(props.adminCreds, 'username'),
        ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(props.adminCreds, 'password')
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'webapi',
        logRetention: logs.RetentionDays.ONE_MONTH
      })
    });

    // CLUSTER AND SERVICE SETUP
    // =========================

    // Create Security Group for the Fargate service
    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'web-api-sg', {
      vpc: props.vpc,
      allowAllOutbound: true,
      description: 'Security group for reef guide web-api Fargate service'
    });

    // Create Fargate Service
    this.fargateService = new ecs.FargateService(this, 'web-api-service', {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 1,
      securityGroups: [serviceSecurityGroup],
      assignPublicIp: true,
      healthCheckGracePeriod: Duration.minutes(3)
    });

    // LOAD BALANCING SETUP
    // =========================

    // Create the target group
    const tg = new elb.ApplicationTargetGroup(this, 'web-api-tg', {
      port: this.internalPort,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '200,201,302',
        protocol: elb.Protocol.HTTP,
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        interval: Duration.seconds(30),
        timeout: Duration.seconds(15),
        port: this.internalPort.toString(),
        path: '/api'
      },
      vpc: props.vpc
    });

    // Add the Fargate service to target group
    tg.addTarget(this.fargateService);

    // Add HTTP redirected HTTPS service to ALB against target group
    props.sharedBalancer.addHttpRedirectedConditionalHttpsTarget(
      'web-api',
      tg,
      [elb.ListenerCondition.hostHeaders([props.domainName])],
      110,
      110
    );

    // AUTO SCALING SETUP
    // ==================

    if (ecsConfig.autoScaling.enabled) {
      // ECS Auto Scaling
      const scaling = this.fargateService.autoScaleTaskCount({
        minCapacity: ecsConfig.autoScaling.minCapacity,
        maxCapacity: ecsConfig.autoScaling.maxCapacity
      });

      // Configure CPU utilization based auto scaling
      scaling.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: ecsConfig.autoScaling.targetCpuUtilization,
        scaleInCooldown: Duration.seconds(ecsConfig.autoScaling.scaleInCooldown),
        scaleOutCooldown: Duration.seconds(ecsConfig.autoScaling.scaleOutCooldown)
      });

      // Configure memory utilization based auto scaling
      scaling.scaleOnMemoryUtilization('MemoryScaling', {
        targetUtilizationPercent: ecsConfig.autoScaling.targetMemoryUtilization,
        scaleInCooldown: Duration.seconds(ecsConfig.autoScaling.scaleInCooldown),
        scaleOutCooldown: Duration.seconds(ecsConfig.autoScaling.scaleOutCooldown)
      });
    }

    // DNS ROUTES
    // ===========

    // Route from reefGuide domain to ALB
    new r53.ARecord(this, 'web-api-route', {
      zone: props.hz,
      recordName: props.domainName,
      comment: `Route from ${props.domainName} to web-api ECS service through ALB`,
      ttl: Duration.minutes(30),
      target: r53.RecordTarget.fromAlias(
        new r53Targets.LoadBalancerTarget(props.sharedBalancer.alb)
      )
    });

    // NETWORK SECURITY
    // ================

    // Allow inbound traffic from the ALB
    serviceSecurityGroup.connections.allowFrom(
      props.sharedBalancer.alb,
      ec2.Port.tcp(this.internalPort),
      'Allow traffic from ALB to web-api Fargate Service'
    );

    // Output the URL of the API
    new cdk.CfnOutput(this, 'web-api-url', {
      value: this.endpoint,
      description: 'Web REST API endpoint'
    });
  }

  /**
   * Registers an ECS service with this API by granting the necessary permissions
   * to the ECS service to manage the service
   * @param service The ECS Fargate service to register
   */
  public registerCluster(service: ecs.FargateService) {
    // Create a policy that allows the Lambda to describe and update the ECS service
    const ecsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        // Permissions to get service status
        'ecs:DescribeServices',
        'ecs:ListServices',
        // Permissions to modify service
        'ecs:UpdateService'
      ],
      // Scope the permissions to just this specific service and its cluster
      resources: [service.serviceArn, service.cluster.clusterArn]
    });

    // Add the policy to the service's role
    this.taskDefinition.addToTaskRolePolicy(ecsPolicy);
  }
}
