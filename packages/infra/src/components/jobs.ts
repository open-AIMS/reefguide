import { JobType } from '@reefguide/db';
import { Annotations, Duration, IgnoreMode, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { STANDARD_EXCLUSIONS } from '../infra';

// Define job type configuration
export interface JobTypeConfig {
  // Which job types does this worker handle?
  jobTypes: JobType[];

  // Task configuration
  cpu: number;
  memoryLimitMiB: number;

  // This specifies the image to be used - should be in the full format
  // i.e. "ghcr.io/open-aims/reefguideapi.jl/reefguide-src:latest"
  workerImage: string;

  // Scaling configuration
  desiredMinCapacity: number;
  desiredMaxCapacity: number;
  cooldownSeconds: number;
  scalingSensitivity: number;
  scalingFactor: number;
  serverPort: number;
  command: string[];
  entrypoint?: string[];

  // Additional environment variables
  env?: Record<string, string>;
  secrets?: Record<string, ecs.Secret>;

  healthCheck?: ecs.HealthCheck;

  // efs mount config
  efsMounts?: {
    // Want to include volumes? NOTE: Ensure it follows this format:
    /**
     * {
     *  // for example
     *  name: 'efs-volume',
     *  efsVolumeConfiguration: {
     *    fileSystemId: fileSystem.fileSystemId,
     *    // for example
     *    rootDirectory: '/data/reefguide',
     *    transitEncryption: 'ENABLED',
     *    authorizationConfig: { iam: 'ENABLED' },
     *  },
     * }
     */
    volumes?: ecs.Volume[];

    // Corresponding mount points e.g. for the above
    /**
     *  {
     *    sourceVolume: 'efs-volume',
     *    // This is where to mount the EFS in the container
     *    containerPath: '/data/reefguide',
     *    readOnly: false,
     *  }
     */
    mountPoints?: ecs.MountPoint[];

    // File systems to grant rw access to
    efsReadWrite?: efs.IFileSystem[];
  };
}

export interface JobSystemProps {
  // Networking
  vpc: ec2.IVpc;
  // Base cluster to run in
  cluster: ecs.ICluster;
  // Domain and auth
  apiEndpoint: string;
  // Storage bucket
  storageBucket: s3.IBucket;

  // Capacity manager configuration
  capacityManager: {
    cpu: number;
    memoryLimitMiB: number;
    pollIntervalMs: number;
  };

  // Configuration for each job type
  workers: JobTypeConfig[];

  // The credentials to be used by the manager and worker nodes
  managerCreds: sm.Secret;
  workerCreds: sm.Secret;
}

export class JobSystem extends Construct {
  // Task definitions for each job type
  public readonly taskDefinitions: Record<string, ecs.TaskDefinition>;

  // The capacity manager service
  public readonly capacityManagerService: ecs.FargateService | undefined;

  constructor(scope: Construct, id: string, props: JobSystemProps) {
    super(scope, id);

    // Create task definitions for each job type
    this.taskDefinitions = {};

    // Ensure there are not duplicate job type configurations
    const allJobs = props.workers
      .map(w => w.jobTypes)
      .reduce((allJobs, currentJobs) => {
        return allJobs.concat(currentJobs);
      }, []);
    const uniqueJobs = new Set(allJobs);
    if (uniqueJobs.size !== allJobs.length) {
      Annotations.of(this).addError(
        'The configured workers contains duplicated task definitions for a job type.'
      );
      return;
    }

    // Create a security group for worker tasks
    const workerSg = new ec2.SecurityGroup(this, 'worker-sg', {
      vpc: props.vpc,
      description: 'Security group for workers',
      allowAllOutbound: true
    });

    for (const workerConfig of props.workers) {
      const jobId = workerConfig.jobTypes.join('-');
      const taskDef = new ecs.FargateTaskDefinition(this, `${jobId}-task-def`, {
        cpu: workerConfig.cpu,
        memoryLimitMiB: workerConfig.memoryLimitMiB
      });

      // Grant task role access to S3 bucket
      props.storageBucket.grantReadWrite(taskDef.taskRole);

      // Add efs config if necessary
      if (workerConfig.efsMounts) {
        // Add vols
        for (const vol of workerConfig.efsMounts.volumes ?? []) {
          taskDef.addVolume(vol);
        }
      }

      // Add container to task definition
      const containerDfn = taskDef.addContainer(`${jobId}-container`, {
        // This specifies the image to be used - should be in the full format
        // i.e. "ghcr.io/open-aims/reefguideapi.jl/reefguide-src:latest"
        image: ecs.ContainerImage.fromRegistry(workerConfig.workerImage),
        // Docker command and entrypoint overrides if provided
        command: workerConfig.command,
        entryPoint: workerConfig.entrypoint,
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: `worker-${jobId.toLowerCase()}`,
          logRetention: logs.RetentionDays.ONE_WEEK
        }),
        environment: {
          API_ENDPOINT: props.apiEndpoint,
          AWS_REGION: Stack.of(this).region,
          JOB_TYPES: workerConfig.jobTypes.join(','),
          S3_BUCKET_NAME: props.storageBucket.bucketName,
          // Custom additional environment variables
          ...(workerConfig.env ?? {})
        },
        // pass in the worker creds
        // TODO do we want separate users for each worker?
        secrets: {
          WORKER_USERNAME: ecs.Secret.fromSecretsManager(props.workerCreds, 'username'),
          WORKER_PASSWORD: ecs.Secret.fromSecretsManager(props.workerCreds, 'password'),
          // Custom secrets
          ...(workerConfig.secrets ?? {})
        },
        healthCheck: workerConfig.healthCheck
      });

      for (const jobType of workerConfig.jobTypes) {
        this.taskDefinitions[jobType] = taskDef;
      }

      for (const mountPoint of workerConfig.efsMounts?.mountPoints ?? []) {
        containerDfn.addMountPoints(mountPoint);
      }

      for (const fs of workerConfig.efsMounts?.efsReadWrite ?? []) {
        // Let the task r/w the EFS
        fs.grantReadWrite(taskDef.taskRole);
        // Also add to the execution role
        fs.grantReadWrite(taskDef.executionRole!);
        // Also allow connections from the sg
        fs.connections.allowDefaultPortFrom(workerSg);
      }
    }

    // Create task definition for capacity manager
    const capacityManagerTask = new ecs.FargateTaskDefinition(this, 'capacity-manager-task', {
      cpu: props.capacityManager.cpu,
      memoryLimitMiB: props.capacityManager.memoryLimitMiB
    });

    // Grant capacity manager permissions to manage ECS tasks
    capacityManagerTask.addToTaskRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecs:RunTask', 'ecs:StopTask', 'ecs:DescribeTasks', 'ecs:ListTasks'],
        resources: ['*']
      })
    );

    // Also enable describing subnets
    capacityManagerTask.addToTaskRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ec2:DescribeSubnets'],
        resources: ['*']
      })
    );

    // Add permissions to pass the task execution and task roles
    capacityManagerTask.addToTaskRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        // Allow role passing through to all the task definitions
        resources: Object.values(this.taskDefinitions).reduce((perms, taskDefinition) => {
          return perms.concat([
            // Allow passing the task execution role
            taskDefinition.executionRole!.roleArn,
            // Allow passing the task role
            taskDefinition.taskRole.roleArn
          ]);
        }, [] as string[]),
        conditions: {
          // Only allow passing these roles to ECS tasks
          StringLike: {
            'iam:PassedToService': 'ecs-tasks.amazonaws.com'
          }
        }
      })
    );

    // Add capacity manager container
    capacityManagerTask.addContainer('capacity-manager', {
      // Docker command - node entrypoint
      command: ['packages/capacity-manager/build/src/index.js'],
      image: ecs.ContainerImage.fromAsset('../..', {
        buildArgs: {
          PORT: String(3000),
          APP_NAME: '@reefguide/capacity-manager'
        },
        // Exclude common directories that shouldn't be included
        exclude: STANDARD_EXCLUSIONS,
        ignoreMode: IgnoreMode.GIT
      }),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'capacity-manager',
        logRetention: logs.RetentionDays.ONE_WEEK
      }),
      environment: {
        API_ENDPOINT: props.apiEndpoint,
        POLL_INTERVAL_MS: props.capacityManager.pollIntervalMs.toString(),
        AWS_REGION: Stack.of(this).region,
        // Which vpc to deploy into
        VPC_ID: props.vpc.vpcId,
        // Log level for manager
        LOG_LEVEL: 'info'
      },
      // pass in the manager creds
      secrets: {
        API_USERNAME: ecs.Secret.fromSecretsManager(props.managerCreds, 'username'),
        API_PASSWORD: ecs.Secret.fromSecretsManager(props.managerCreds, 'password')
      },
      healthCheck: {
        command: [
          'CMD-SHELL',
          'curl -f http://localhost:3000/health >> /proc/1/fd/1 2>&1 || exit 1'
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60)
      },
      portMappings: [
        {
          containerPort: 3000,
          hostPort: 3000,
          protocol: ecs.Protocol.TCP
        }
      ]
    });

    // Create security group for capacity manager
    const capacityManagerSg = new ec2.SecurityGroup(this, 'capacity-manager-sg', {
      vpc: props.vpc,
      description: 'Security group for job capacity manager',
      allowAllOutbound: true
    });

    // Create the capacity manager service
    this.capacityManagerService = new ecs.FargateService(this, 'capacity-manager', {
      cluster: props.cluster,
      taskDefinition: capacityManagerTask,
      desiredCount: 1, // We only need one instance
      securityGroups: [capacityManagerSg],
      assignPublicIp: true,
      // Ensure service stays running
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(60),
      // Circuit breaker to prevent failing deployments
      circuitBreaker: {
        rollback: true
      }
    });

    // Add task definition configurations to capacity manager environment
    const taskDefEnvVars: Record<string, string> = {};
    for (const workerConfig of props.workers) {
      for (const jobType of workerConfig.jobTypes) {
        const taskDef = this.taskDefinitions[jobType];
        taskDefEnvVars[`${jobType}_TASK_DEF`] = taskDef.taskDefinitionArn;
        taskDefEnvVars[`${jobType}_CLUSTER`] = props.cluster.clusterArn;
        taskDefEnvVars[`${jobType}_MIN_CAPACITY`] = workerConfig.desiredMinCapacity.toString();
        taskDefEnvVars[`${jobType}_MAX_CAPACITY`] = workerConfig.desiredMaxCapacity.toString();
        taskDefEnvVars[`${jobType}_SENSITIVITY`] = workerConfig.scalingSensitivity.toString();
        taskDefEnvVars[`${jobType}_FACTOR`] = workerConfig.scalingFactor.toString();
        taskDefEnvVars[`${jobType}_COOLDOWN`] = workerConfig.cooldownSeconds.toString();
        taskDefEnvVars[`${jobType}_SECURITY_GROUP`] = workerSg.securityGroupId;
      }
    }

    // Update capacity manager container with task definition configurations
    const capacityManagerContainer = capacityManagerTask.findContainer('capacity-manager');
    if (capacityManagerContainer) {
      Object.entries(taskDefEnvVars).forEach(([key, value]) => {
        capacityManagerContainer.addEnvironment(key, value);
      });
    }
  }
}
