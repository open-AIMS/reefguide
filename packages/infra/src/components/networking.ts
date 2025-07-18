import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { IVpc, Vpc } from 'aws-cdk-lib/aws-ec2';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib';

/**
 * Slugify a string for use in CloudFormation output names
 * CloudFormation output names must be alphanumeric only
 *
 * @param text - The text to slugify
 * @returns Alphanumeric string suitable for CloudFormation output names
 */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric characters
      .replace(/^[0-9]/, 'n$&') || // Prefix with 'n' if starts with number
    'empty'
  ); // Fallback if string becomes empty
}

/**
 * Properties for the SharedBalancers construct
 */
export interface SharedBalancersProps {
  /** The VPC in which to create the ALB */
  vpc: ec2.IVpc;
  /** Whether the ALB should be internet-facing */
  isPublic: boolean;
  /** The type of subnets to place the ALB in */
  subnetType: ec2.SubnetType;
  /** List of SSL/TLS certificates for the HTTPS listener */
  certificates: elb.ListenerCertificate[];
}

/**
 * A construct that manages a shared Application Load Balancer
 * along with its HTTP and HTTPS listeners and routing configurations.
 */
export class SharedBalancer extends Construct {
  /** The default HTTPS port */
  private readonly httpsPort: number = 443;

  /** The default HTTP port */
  private readonly httpPort: number = 80;

  /** The Application Load Balancer instance */
  public readonly alb: elb.ApplicationLoadBalancer;

  /** The HTTPS listener for the Application Load Balancer */
  public readonly httpsListener: elb.ApplicationListener;

  /** The HTTP listener for the Application Load Balancer */
  public readonly httpListener: elb.ApplicationListener;

  /**
   * Creates a new SharedBalancers instance.
   * @param scope The scope in which to define this construct
   * @param id The scoped construct ID
   * @param props Configuration properties for the SharedBalancers
   */
  constructor(scope: Construct, id: string, props: SharedBalancersProps) {
    super(scope, id);

    // Set up the Application Load Balancer
    this.alb = new elb.ApplicationLoadBalancer(this, 'alb', {
      vpc: props.vpc,
      internetFacing: props.isPublic,
      vpcSubnets: { subnetType: props.subnetType }
    });

    // Set up the HTTPS listener
    this.httpsListener = new elb.ApplicationListener(this, 'https-listener', {
      loadBalancer: this.alb,
      certificates: props.certificates,
      defaultAction: elb.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody:
          'Service does not exist. Contact administrator if you believe this is an error.'
      }),
      port: this.httpsPort
    });

    // Set up the HTTP listener
    this.httpListener = new elb.ApplicationListener(this, 'http-listener', {
      loadBalancer: this.alb,
      defaultAction: elb.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody:
          'Service does not exist. Contact administrator if you believe this is an error.'
      }),
      port: this.httpPort
    });
  }

  /**
   * Adds certificates to the HTTPS listener
   * @param id Unique identifier for this operation
   * @param certificates List of certificates to add
   */
  addHttpsCertificates(id: string, certificates: elb.ListenerCertificate[]): void {
    this.httpsListener.addCertificates(id, certificates);
  }

  /**
   * Adds a conditional HTTPS target with HTTP redirect
   * @param actionId Unique identifier for this action
   * @param targetGroup The target group to forward requests to
   * @param conditions List of conditions to match for this rule
   * @param priority Priority of the listener rule
   * @param httpRedirectPriority Priority of the HTTP to HTTPS redirect rule
   */
  addHttpRedirectedConditionalHttpsTarget(
    actionId: string,
    targetGroup: elb.ApplicationTargetGroup,
    conditions: elb.ListenerCondition[],
    priority: number,
    httpRedirectPriority: number
  ): void {
    // Add the listener action on HTTPS listener
    this.httpsListener.addAction(actionId, {
      action: elb.ListenerAction.forward([targetGroup]),
      conditions,
      priority
    });

    // Add HTTP redirect
    this.httpListener.addAction(`${actionId}-https-redirect`, {
      action: elb.ListenerAction.redirect({
        permanent: true,
        port: this.httpsPort.toString(),
        protocol: elb.Protocol.HTTPS
      }),
      conditions,
      priority: httpRedirectPriority
    });
  }

  /**
   * Adds a conditional HTTP route
   * @param id Unique identifier for this route
   * @param targetGroup The target group to forward requests to
   * @param conditions List of conditions to match for this rule
   * @param priority Priority of the listener rule
   */
  addConditionalHttpRoute(
    id: string,
    targetGroup: elb.ApplicationTargetGroup,
    conditions: elb.ListenerCondition[],
    priority: number
  ): void {
    this.httpListener.addAction(id, {
      action: elb.ListenerAction.forward([targetGroup]),
      conditions,
      priority
    });
  }
}

/**
 * Properties for the ReefGuideNetworking construct.
 */
export interface ReefGuideNetworkingProps {
  /** The SSL/TLS certificate to use for HTTPS connections */
  certificate: ICertificate;
}

/**
 * Represents the networking infrastructure for the ReefGuide application.
 */
export class ReefGuideNetworking extends Construct {
  /** The VPC where the networking resources are created */
  public readonly vpc: IVpc;

  /** The shared Application Load Balancer */
  public readonly sharedBalancer: SharedBalancer;

  /** The shared ECS cluster */
  public readonly cluster: ecs.Cluster;

  /** A bucket used for intermediary data transfer */
  public readonly dataBucket: s3.Bucket;

  /** Creates a file system - exposed here */
  public readonly efs: efs.FileSystem;

  /**
   * Creates a new ReefGuideNetworking instance.
   * @param scope The scope in which to define this construct
   * @param id The scoped construct ID
   * @param props Configuration properties for the ReefGuideNetworking
   */
  constructor(scope: Construct, id: string, props: ReefGuideNetworkingProps) {
    super(scope, id);

    // Setup basic VPC with some public subnet(s) as per default
    this.vpc = new Vpc(this, 'vpc', {
      // At least 2 needed for LB
      maxAzs: 2,
      // No need for nat gateways right now since no private subnet outbound traffic
      natGateways: 0
    });

    this.cluster = new ecs.Cluster(this, 'reef-guide-cluster', {
      vpc: this.vpc
    });

    // Create the shared ALB - public facing
    this.sharedBalancer = new SharedBalancer(this, 'shared-balancer', {
      vpc: this.vpc,
      certificates: [props.certificate],
      isPublic: true,
      subnetType: ec2.SubnetType.PUBLIC
    });

    // ========================
    // SERVICE INSTANCE FOR EFS
    // ========================

    // EC2 Instance for EFS management - be sure to shut down when not using
    const instanceType = ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM);

    // Use Ubuntu image as it is a bit easier for users
    const machineImage = ec2.MachineImage.lookup({
      // AMI: ami-0892a9c01908fafd1
      name: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-20240801'
    });

    // ===================
    // DATA TRANSFER SETUP
    // ===================

    // Create S3 Bucket - setup to be transient
    this.dataBucket = new s3.Bucket(this, 'job-transfer-bucket', {
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    // Create EFS File System
    const fileSystem = new efs.FileSystem(this, 'efs', {
      vpc: this.vpc,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      encrypted: true,
      removalPolicy: RemovalPolicy.RETAIN
    });
    this.efs = fileSystem;

    // Role for EC2 to use
    const efsManagementRole = new iam.Role(this, 'EFSManagementRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });

    // Allow SSM connection
    efsManagementRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    // Allow EFS operations
    efsManagementRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientReadWriteAccess')
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
      `sudo mount -t efs -o tls,iam ${fileSystem.fileSystemId} /home/ubuntu/efs/`,

      // Leave a script to help mount in the future
      `touch ${scriptLocation} && chmod +x ${scriptLocation} && echo "sudo mount -t efs -o tls,iam ${fileSystem.fileSystemId} /home/ubuntu/efs/" > ${scriptLocation}`,

      // Install AWS CLI
      'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
      'unzip awscliv2.zip',
      'sudo ./aws/install'
    );

    const efsManagementInstance = new ec2.Instance(this, 'EFSManagementInstance', {
      vpc: this.vpc,
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
          volume: ec2.BlockDeviceVolume.ebs(50)
        }
      ]
    });

    // Allow EC2 instance to access EFS
    fileSystem.connections.allowDefaultPortFrom(efsManagementInstance);

    // CfnOutputs
    new CfnOutput(this, 'efnConnectionInfo', {
      key: `${slugify(Stack.of(this).stackName)}efnConnectionInfo`,
      value: JSON.stringify({
        serviceInstanceId: efsManagementInstance.instanceId,
        transferBucketName: this.dataBucket.bucketName
      })
    });
  }
}
