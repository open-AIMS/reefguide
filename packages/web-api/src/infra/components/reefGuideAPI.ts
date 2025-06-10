import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as r53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { ReefGuideAPIConfig } from '../infraConfig';
import { SharedBalancer } from './networking';

/**
 * Properties for the ReefGuideAPI construct
 */
export interface ReefGuideAPIProps {
  /** VPC to produce ECS cluster in */
  vpc: ec2.IVpc;
  /** Shared balancer to use */
  sharedBalancer: SharedBalancer;
  /** Full domain name for service e.g. website.com */
  domainName: string;
  /** The Hosted Zone to produce record in */
  hz: r53.IHostedZone;
  /** The DNS certificate to use for Load Balancer */
  certificate: acm.ICertificate;
  /** The configuration object for the reefGuide service */
  config: ReefGuideAPIConfig;
}

/**
 * Construct for the ReefGuideAPI service
 */
export class ReefGuideAPI extends Construct {
  /** Internal port for the reefGuide service */
  public readonly internalPort: number;

  /** External HTTPS port */
  public readonly externalPort: number = 443;

  /** Endpoint for reefGuide access (format: https://domain:port) */
  public readonly endpoint: string;

  /** The Fargate Service */
  public readonly fargateService: ecs.FargateService;

  /** A bucket used for intermediary data transfer */
  public readonly dataBucket: s3.Bucket;

  /** Creates a file system - exposed here */
  public readonly efs: efs.FileSystem;

  constructor(scope: Construct, id: string, props: ReefGuideAPIProps) {
    super(scope, id);

    // ================
    // OUTPUTS
    // ================

    // Internal port
    this.internalPort = props.config.port;

    // Build the public URL and expose
    this.endpoint = `https://${props.domainName}:${this.externalPort}`;

    // ===================
    // DATA TRANSFER SETUP
    // ===================

    // Create S3 Bucket - setup to be transient
    this.dataBucket = new s3.Bucket(this, 'bucket', {
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // Create EFS File System
    const fileSystem = new efs.FileSystem(this, 'efs', {
      vpc: props.vpc,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      encrypted: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.efs = fileSystem;

    // CONTAINER SETUP
    // ================

    // If you want to use a local build for debugging (not recommended for production, set this to false)
    const reefGuideContainerImage = ecs.ContainerImage.fromRegistry(
      `${props.config.reefGuideDockerImage}:${props.config.reefGuideDockerImageTag}`,
    );

    // Create the Fargate task definition
    const reefGuideTaskDfn = new ecs.FargateTaskDefinition(
      this,
      'reefguide-task-dfn',
      {
        ephemeralStorageGiB: 21, // 21GB ephemeral storage (minimum)
        cpu: props.config.cpu,
        memoryLimitMiB: props.config.memory,
      },
    );

    // Add EFS volume to the task definition
    reefGuideTaskDfn.addVolume({
      name: 'efs-volume',
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        // The /data/reefguide path in EFS is targeted - must exist!
        rootDirectory: '/data/reefguide',
        // This means the TLS encryption applies in transit - requires IAM auth
        transitEncryption: 'ENABLED',
        // This adds the -o tls,iam flag which is needed for EFS to mount -
        // silliness just plain silliness! (Why is this not done
        // automatically??)
        authorizationConfig: { iam: 'ENABLED' },
      },
    });

    // Add container to the task definition
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const reefGuideContainerDfn = reefGuideTaskDfn.addContainer(
      'reefguide-container-dfn',
      {
        image: reefGuideContainerImage,
        portMappings: [
          {
            containerPort: this.internalPort,
            appProtocol: ecs.AppProtocol.http,
            name: 'reefguide-port',
          },
        ],
        environment: {
          // TODO configure any env variables
        },
        secrets: {
          // TODO configure any secrets
        },
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: 'reefguideapi',
          logRetention: logs.RetentionDays.ONE_MONTH,
        }),
      },
    );

    // Mount EFS to the container
    reefGuideContainerDfn.addMountPoints({
      sourceVolume: 'efs-volume',
      // This is where to mount the EFS in the container
      containerPath: '/data/reefguide',
      readOnly: false,
    });

    // Let the task r/w the EFS
    fileSystem.grantReadWrite(reefGuideTaskDfn.taskRole);
    // Also add to the execution role
    fileSystem.grantReadWrite(reefGuideTaskDfn.executionRole!);

    // CLUSTER AND SERVICE SETUP
    // =========================

    // Create the ECS Cluster
    const cluster = new ecs.Cluster(this, 'reef-guide-cluster', {
      vpc: props.vpc,
    });

    // Create Security Group for the Fargate service
    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'reef-guide-sg', {
      vpc: props.vpc,
      allowAllOutbound: true,
      description: 'Security group for reef guide Fargate service',
    });

    // Create Fargate Service
    this.fargateService = new ecs.FargateService(this, 'reefguide-service', {
      cluster: cluster,
      taskDefinition: reefGuideTaskDfn,
      desiredCount: 1,
      securityGroups: [serviceSecurityGroup],
      assignPublicIp: true, // TODO Change this if using private subnets with NAT
      // give plenty of time
      healthCheckGracePeriod: Duration.minutes(15),
    });

    // Allow Fargate instance to access EFS
    fileSystem.connections.allowDefaultPortFrom(this.fargateService);

    // ========
    // ALERTING
    // ========

    // Do we want memory alerting?
    if (!!props.config.memoryAlerting) {
      const alertConfig = props.config.memoryAlerting;

      // Create SNS topic for alerts
      const alertTopic = new sns.Topic(this, 'MemoryAlertTopic', {
        displayName: 'ReefGuide API Cluster Memory Alerts',
      });

      // Add email subscription
      alertTopic.addSubscription(
        new subscriptions.EmailSubscription(alertConfig.emailAddress),
      );

      // Create base memory metric
      const baseMemoryMetric = this.fargateService.metricMemoryUtilization({
        period: Duration.seconds(alertConfig.metricPeriod),
      });

      // Create average memory alarm
      const avgMemoryMetric = baseMemoryMetric.with({
        statistic: 'Average',
      });

      const avgMemoryAlarm = new cloudwatch.Alarm(
        this,
        'AvgMemoryUtilizationAlarm',
        {
          metric: avgMemoryMetric,
          threshold: alertConfig.averageThreshold,
          evaluationPeriods: alertConfig.evaluationPeriods,
          comparisonOperator:
            cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          actionsEnabled: true,
          alarmDescription: `Average memory utilization exceeded ${
            alertConfig.averageThreshold
          }% for ${alertConfig.evaluationPeriods} periods`,
        },
      );

      // Create maximum memory alarm
      const maxMemoryMetric = baseMemoryMetric.with({
        statistic: 'Maximum',
      });

      const maxMemoryAlarm = new cloudwatch.Alarm(
        this,
        'MaxMemoryUtilizationAlarm',
        {
          metric: maxMemoryMetric,
          threshold: alertConfig.maxThreshold,
          evaluationPeriods: alertConfig.evaluationPeriods,
          comparisonOperator:
            cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          actionsEnabled: true,
          alarmDescription: `Maximum memory utilization exceeded ${
            alertConfig.maxThreshold
          }% for ${alertConfig.evaluationPeriods} periods`,
        },
      );

      // Add SNS actions to both alarms
      avgMemoryAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
      maxMemoryAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
    }

    // LOAD BALANCING SETUP
    // =========================

    // Create the target group
    const tg = new elb.ApplicationTargetGroup(this, 'reef-guide-tg', {
      port: this.internalPort,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '200,201,302',
        protocol: elb.Protocol.HTTP,
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        interval: Duration.seconds(60),
        timeout: Duration.seconds(30),
        port: this.internalPort.toString(),
        path: '/health',
      },
      vpc: props.vpc,
      // Add stickiness configuration - this means the LB will preferentially
      // route users back to the same instance
      stickinessCookieDuration: Duration.hours(1),
      stickinessCookieName: 'ReefGuideSessionId',
    });

    // Add the Fargate service to target group
    tg.addTarget(this.fargateService);

    // Add HTTP redirected HTTPS service to ALB against target group
    props.sharedBalancer.addHttpRedirectedConditionalHttpsTarget(
      'reef-guide',
      tg,
      [elb.ListenerCondition.hostHeaders([props.domainName])],
      100, // TODO: Understand and consider priorities
      100,
    );

    // AUTO SCALING SETUP
    // ==================

    if (props.config.autoScaling.enabled) {
      // ECS Auto Scaling
      const scaling = this.fargateService.autoScaleTaskCount({
        minCapacity: props.config.autoScaling.minCapacity,
        maxCapacity: props.config.autoScaling.maxCapacity,
      });

      // Configure CPU utilization based auto scaling
      scaling.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: props.config.autoScaling.targetCpuUtilization,
        scaleInCooldown: Duration.seconds(
          props.config.autoScaling.scaleInCooldown,
        ),
        scaleOutCooldown: Duration.seconds(
          props.config.autoScaling.scaleOutCooldown,
        ),
      });

      // Configure memory utilization based auto scaling
      scaling.scaleOnMemoryUtilization('MemoryScaling', {
        targetUtilizationPercent:
          props.config.autoScaling.targetMemoryUtilization,
        scaleInCooldown: Duration.seconds(
          props.config.autoScaling.scaleInCooldown,
        ),
        scaleOutCooldown: Duration.seconds(
          props.config.autoScaling.scaleOutCooldown,
        ),
      });
    }

    // DNS ROUTES
    // ===========

    // Route from reefGuide domain to ALB
    new r53.ARecord(this, 'reef-guide-api-route', {
      zone: props.hz,
      recordName: props.domainName,
      comment: `Route from ${props.domainName} to ReefGuideAPI.jl ECS service through ALB`,
      ttl: Duration.minutes(30),
      target: r53.RecordTarget.fromAlias(
        new r53Targets.LoadBalancerTarget(props.sharedBalancer.alb),
      ),
    });

    // NETWORK SECURITY
    // ================

    // Allow inbound traffic from the ALB
    serviceSecurityGroup.connections.allowFrom(
      props.sharedBalancer.alb,
      ec2.Port.tcp(this.internalPort),
      'Allow traffic from ALB to ReefGuideAPI.jl Fargate Service',
    );

    // ========================
    // SERVICE INSTANCE FOR EFS
    // ========================

    // EC2 Instance for EFS management - be sure to shut down when not using
    const instanceType = ec2.InstanceType.of(
      ec2.InstanceClass.T3,
      ec2.InstanceSize.MEDIUM,
    );

    // Use Ubuntu image as it is a bit easier for users
    const machineImage = ec2.MachineImage.lookup({
      // AMI: ami-0892a9c01908fafd1
      name: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-20240801',
    });

    // Role for EC2 to use
    const efsManagementRole = new iam.Role(this, 'EFSManagementRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    // Allow SSM connection
    efsManagementRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonSSMManagedInstanceCore',
      ),
    );

    // Allow EFS operations
    efsManagementRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonElasticFileSystemClientReadWriteAccess',
      ),
    );

    // Allow EFS read write
    fileSystem.grantReadWrite(efsManagementRole);

    // grant rw for bucket
    this.dataBucket.grantReadWrite(efsManagementRole);

    const userData = ec2.UserData.forLinux();
    const scriptLocation = '/home/ubuntu/mountefs.sh';
    userData.addCommands(
      // update etc
      'sudo apt -y update',
      // get deps
      'sudo apt -y install unzip git binutils rustc cargo pkg-config libssl-dev ranger',
      // efs utils install
      'git clone https://github.com/aws/efs-utils',
      'cd efs-utils',
      './build-deb.sh',
      'sudo apt -y install ./build/amazon-efs-utils*deb',
      'cd home/ubuntu',
      // setup reefguide mount in /efs of ubuntu user
      'mkdir /home/ubuntu/efs',
      `mount -t efs -o tls,iam ${fileSystem.fileSystemId} /home/ubuntu/efs/`,

      // Leave a script to help mount in the future
      `touch ${scriptLocation} && chmod +x ${scriptLocation} && echo "sudo mount -t efs -o tls,iam fs-0badb6b5a6eac95ea /home/ubuntu/efs/" > ${scriptLocation}`,

      // Install AWS CLI
      'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
      'unzip awscliv2.zip',
      'sudo ./aws/install',
    );

    const efsManagementInstance = new ec2.Instance(
      this,
      'EFSManagementInstance',
      {
        vpc: props.vpc,
        instanceType: instanceType,
        allowAllOutbound: true,
        vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        machineImage: machineImage,
        userData: userData,
        role: efsManagementRole,
        associatePublicIpAddress: true,
        blockDevices: [
          {
            deviceName: '/dev/xvda',
            volume: ec2.BlockDeviceVolume.ebs(50),
          },
        ],
      },
    );

    // Allow EC2 instance to access EFS
    fileSystem.connections.allowDefaultPortFrom(efsManagementInstance);

    // Output the URL of the API
    new CfnOutput(this, 'reef-guide-endpoint', {
      value: this.endpoint,
      description: 'ReefGuideAPI.jl endpoint',
    });
  }
}
