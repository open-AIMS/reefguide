import {
  AssignPublicIp,
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
  Task
} from '@aws-sdk/client-ecs';
import { EC2Client, DescribeSubnetsCommand } from '@aws-sdk/client-ec2';
import { Config, ConfigSchema, JobTypeConfig } from './config';
import { AuthApiClient } from './authClient';
import { JobType } from '@prisma/client';
import { PollJobsResponse } from '../../api/jobs/routes';
import { logger } from './logging';

/**
 * Interface for tracking worker status
 * Contains details for a worker which is pending or running
 */
interface TrackedWorker {
  /** Unique ARN for the ECS task */
  taskArn: string;
  /** Task definition ARN for the ECS task */
  taskDefinitionArn: string;
  /** The cluster ARN where the task is running */
  clusterArn: string;
  /** When the worker was started */
  startTime: Date;
  /** Types of jobs this worker can handle */
  jobTypes: JobType[];
  /** Current status of the worker */
  status: 'PENDING' | 'RUNNING' | 'STOPPED';
}

/**
 * CapacityManager handles the automatic scaling of ECS tasks based on job queue demand.
 * It tracks workers, polls for pending jobs, and adjusts the number of workers
 * to efficiently process the jobs while respecting scaling constraints.
 */
export class CapacityManager {
  private config: Config;

  private ecsClient: ECSClient;

  private ec2Client: EC2Client;

  // Tracks the last scaled time for a given task definition ARN
  private lastScaleTime: Record<string, number> = {};

  private client: AuthApiClient;

  private isRunning = false;

  private pollTimeout: NodeJS.Timeout | null = null;

  // Tracking data for workers
  private trackedWorkers: TrackedWorker[] = [];

  /**
   * Creates a new CapacityManager
   * @param config - Configuration for the capacity manager
   * @param client - Authentication client for API requests
   */
  constructor(config: Config, client: AuthApiClient) {
    this.config = ConfigSchema.parse(config);
    this.ecsClient = new ECSClient({ region: this.config.region });
    this.ec2Client = new EC2Client({ region: this.config.region });
    this.client = client;
    logger.debug('CapacityManager initialized', { region: this.config.region });
  }

  /**
   * Polls the job queue and adjusts capacity as needed
   * @private
   */
  private async pollJobQueue() {
    if (!this.isRunning) return;

    const used = process.memoryUsage();
    logger.debug('Memory usage', {
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
      rss: `${Math.round(used.rss / 1024 / 1024)} MB`
    });

    try {
      logger.info('Poll started', { timestamp: new Date().toISOString() });
      logger.debug('Current tracked workers status', {
        count: this.trackedWorkers.length
      });

      // Update worker statuses
      await this.updateWorkerStatuses();

      // Get jobs with their IDs
      logger.debug('Fetching pending jobs from API');
      const response = await this.client.get<PollJobsResponse>('/jobs/poll');
      logger.debug('Received job poll response', {
        jobCount: response.jobs.length,
        jobTypes: response.jobs.map(j => j.type)
      });

      await this.adjustCapacity({ pollResponse: response.jobs });
    } catch (error) {
      logger.error('Error polling job queue', { error });
    } finally {
      // Only schedule next poll if still running
      if (this.isRunning) {
        logger.debug('Scheduling next poll', {
          ms: this.config.pollIntervalMs
        });
        this.pollTimeout = setTimeout(() => this.pollJobQueue(), this.config.pollIntervalMs);
      }
    }
  }

  /**
   * Updates the status of all tracked workers by querying ECS
   * @private
   */
  private async updateWorkerStatuses() {
    if (this.trackedWorkers.length === 0) {
      logger.debug('No workers to update');
      return;
    }

    try {
      // Build set of distinct worker types from the tracked workers
      const clusterArns = new Set(this.trackedWorkers.map(w => w.clusterArn));
      logger.debug('Updating worker statuses', {
        workerCount: this.trackedWorkers.length,
        clusterCount: clusterArns.size
      });

      // Create a Set to track which task ARNs were found in the API response
      const foundTaskArns = new Set<string>();

      // Now loop through each worker type and figure out the cluster ARN/task ARNs
      for (const clusterArn of clusterArns) {
        const relevantWorkers = this.trackedWorkers.filter(w => w.clusterArn === clusterArn);
        // Which task ARNs to fetch
        const taskArns = relevantWorkers.map(w => w.taskArn);

        logger.debug('Checking tasks in cluster', {
          clusterArn,
          taskCount: taskArns.length
        });

        // Split into chunks if there are many tasks (ECS API has limits)
        const chunkSize = 100;
        for (let i = 0; i < taskArns.length; i += chunkSize) {
          const chunk = taskArns.slice(i, i + chunkSize);
          logger.debug('Processing task chunk', {
            chunkSize: chunk.length,
            startIndex: i
          });

          const command = new DescribeTasksCommand({
            cluster: clusterArn,
            tasks: chunk
          });

          const response = await this.ecsClient.send(command);

          if (response.tasks) {
            logger.debug('Received task details', {
              requestedCount: chunk.length,
              receivedCount: response.tasks.length
            });

            // Add all found task ARNs to our tracking set
            response.tasks.forEach(task => {
              if (task.taskArn) {
                foundTaskArns.add(task.taskArn);
              }
            });

            this.updateWorkerStatusesFromTasks(response.tasks);
          }

          // Check if any tasks weren't found but were requested
          // AWS ECS API returns info in response.failures for tasks that weren't found
          if (response.failures && response.failures.length > 0) {
            logger.warn('Some tasks were not found', {
              failureCount: response.failures.length
            });

            response.failures.forEach(failure => {
              if (failure.arn && failure.reason === 'MISSING') {
                logger.info('Task not found in ECS, removing from tracked workers', {
                  taskArn: failure.arn
                });
                // We explicitly don't add this to foundTaskArns since it's missing
              }
            });
          }
        }
      }

      // Remove workers that weren't found in the API response
      const previousCount = this.trackedWorkers.length;
      this.trackedWorkers = this.trackedWorkers.filter(worker => {
        // Keep workers that were found in the API response
        return foundTaskArns.has(worker.taskArn);
      });

      const removedCount = previousCount - this.trackedWorkers.length;
      if (removedCount > 0) {
        logger.info('Removed workers not found in ECS', {
          count: removedCount
        });
      }

      logger.debug('Worker status update complete', {
        originalCount: previousCount,
        currentCount: this.trackedWorkers.length,
        removed: removedCount
      });
    } catch (error) {
      logger.error('Error updating worker statuses', { error });
    }
  }

  /**
   * Updates worker statuses based on ECS task information
   * @param tasks - Task information from ECS
   * @private
   */
  private updateWorkerStatusesFromTasks(tasks: Task[]) {
    logger.debug('Updating worker statuses from tasks', {
      taskCount: tasks.length
    });
    let statusChanges = 0;

    for (const task of tasks) {
      if (!task.taskArn) {
        logger.warn('Task without ARN found in response');
        continue;
      }

      const worker = this.trackedWorkers.find(w => w.taskArn === task.taskArn);
      if (!worker) {
        logger.debug('Task not in tracked workers', { taskArn: task.taskArn });
        continue;
      }

      const lastStatus = task.lastStatus || '';
      let newStatus: 'PENDING' | 'RUNNING' | 'STOPPED';

      // Map AWS ECS task statuses to our internal tracking statuses
      if (['PROVISIONING', 'PENDING', 'ACTIVATING'].includes(lastStatus)) {
        newStatus = 'PENDING';
      } else if (lastStatus === 'RUNNING') {
        newStatus = 'RUNNING';
      } else if (
        ['DEACTIVATING', 'STOPPING', 'STOPPED', 'DEPROVISIONING', 'DEPROVISIONED'].includes(
          lastStatus
        )
      ) {
        newStatus = 'STOPPED';
      } else {
        // For any unexpected status, log it but don't change worker status
        logger.warn('Worker has unknown status', {
          taskArn: task.taskArn,
          status: lastStatus
        });
        continue;
      }

      // Only log if status changed
      if (worker.status !== newStatus) {
        logger.info('Worker status changed', {
          taskArn: task.taskArn,
          oldStatus: worker.status,
          newStatus: newStatus
        });
        worker.status = newStatus;
        statusChanges++;
      }
    }

    // Count workers by status before cleanup
    const workerStatusCounts = {
      PENDING: this.trackedWorkers.filter(w => w.status === 'PENDING').length,
      RUNNING: this.trackedWorkers.filter(w => w.status === 'RUNNING').length,
      STOPPED: this.trackedWorkers.filter(w => w.status === 'STOPPED').length
    };

    logger.debug('Worker status counts before cleanup', workerStatusCounts);

    // Remove stopped workers after updating
    const beforeCleanup = this.trackedWorkers.length;
    this.trackedWorkers = this.trackedWorkers.filter(worker => worker.status !== 'STOPPED');
    const cleanupRemoved = beforeCleanup - this.trackedWorkers.length;

    if (cleanupRemoved > 0) {
      logger.info('Removed stopped workers from tracking', {
        count: cleanupRemoved
      });
    }

    logger.debug('Worker status update summary', {
      statusChanges,
      stoppedWorkersRemoved: cleanupRemoved,
      remainingWorkers: this.trackedWorkers.length
    });
  }

  /**
   * Adjust capacity for each task definition based on pending jobs
   * @param pollResponse - Response from the job queue poll
   * @private
   */
  private async adjustCapacity({
    pollResponse
  }: {
    pollResponse: PollJobsResponse['jobs'];
  }): Promise<void> {
    logger.debug('Adjusting capacity based on poll response', {
      jobCount: pollResponse.length
    });

    // Count pending jobs by task definition
    const pendingByDfnArn: Record<string, number> = pollResponse.reduce<Record<string, number>>(
      (current, acc) => {
        const arn = this.config.jobTypes[acc.type]?.taskDefinitionArn;
        if (!arn) {
          logger.warn('Missing config definition for task type.', {
            jobType: acc.type
          });
          return current;
        }
        current[arn] = current[arn] ? current[arn] + 1 : 1;
        return current;
      },
      {} as Record<string, number>
    );

    // Determine how many workers are already tracked for each type of job
    const workersByDfnArn: Record<string, number> = this.trackedWorkers.reduce<
      Record<string, number>
    >(
      (current, acc) => {
        const arn = acc.taskDefinitionArn;
        current[arn] = current[arn] ? current[arn] + 1 : 1;
        return current;
      },
      {} as Record<string, number>
    );

    logger.debug('Job distribution', {
      pendingByType: pendingByDfnArn,
      workersByType: workersByDfnArn
    });

    for (const taskDefArn of Object.keys(pendingByDfnArn)) {
      const taskConfig = Object.values(this.config.jobTypes).find(
        c => c.taskDefinitionArn === taskDefArn
      );
      if (!taskConfig) {
        logger.warn('No configuration found for job with task definition arn needed', {
          taskDefArn
        });
        continue;
      }

      const pending: number = pendingByDfnArn[taskDefArn] ?? 0;
      const workers: number = workersByDfnArn[taskDefArn] ?? 0;

      logger.debug('Considering capacity adjustment', {
        taskDefinitionArn: taskDefArn,
        pendingJobs: pending,
        currentWorkers: workers
      });

      await this.adjustCapacityForTask({
        jobTypes: taskConfig.jobTypes,
        pending,
        workers,
        config: taskConfig
      });
    }
  }

  /**
   * Launches n tasks of the specified type/config
   * @param count - Number of tasks to launch
   * @param jobType - Type of job the tasks will handle
   * @param config - Configuration for the job type
   * @private
   */
  private async launchTask({ count = 1, config }: { count?: number; config: JobTypeConfig }) {
    try {
      logger.info('Attempting to launch tasks', {
        count,
        arn: config.taskDefinitionArn
      });
      let done = 0;
      let failures = 0;

      while (done < count) {
        const now = Date.now();

        // Get a random public subnet for this task
        logger.debug('Getting random public subnet', {
          vpcId: this.config.vpcId
        });
        const subnet = await this.getRandomPublicSubnet(this.config.vpcId);

        logger.debug('Constructing RunTaskCommand', {
          cluster: config.clusterArn,
          taskDef: config.taskDefinitionArn,
          subnet
        });

        const command = new RunTaskCommand({
          cluster: config.clusterArn,
          taskDefinition: config.taskDefinitionArn,
          launchType: 'FARGATE',
          count: 1,
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: [subnet],
              securityGroups: [config.securityGroup],
              assignPublicIp: AssignPublicIp.ENABLED
            }
          }
        });

        const result = await this.ecsClient.send(command);

        // If task was created successfully, track it
        if (result.tasks && result.tasks.length > 0 && result.tasks[0].taskArn) {
          this.lastScaleTime[config.taskDefinitionArn] = now;
          this.trackedWorkers.push({
            clusterArn: config.clusterArn,
            taskArn: result.tasks[0].taskArn,
            startTime: new Date(),
            jobTypes: config.jobTypes,
            taskDefinitionArn: config.taskDefinitionArn,
            status: 'PENDING'
          });

          logger.info('Started new task', {
            taskArn: result.tasks[0].taskArn
          });
          done += 1;
        } else {
          failures += 1;
          logger.error('Failed to launch task', {
            result
          });
        }
      }

      logger.debug('Task launch summary', {
        requested: count,
        launched: done,
        failures
      });
    } catch (e) {
      logger.error('Failed to launch task(s)', {
        error: e
      });
    }
  }

  /**
   * Computes the optimal number of workers to handle pending jobs using a logarithmic scale.
   *
   * This function uses a logarithmic relationship between pending jobs and worker count,
   * which provides diminishing returns as the number of jobs increases - appropriate for
   * many distributed processing scenarios.
   *
   * @param pendingJobs - The number of jobs waiting to be processed
   * @param sensitivity - Controls how aggressively to scale workers (higher = more workers)
   *                      Recommended range: 1.0 (conservative) to 3.0 (aggressive)
   * @param minWorkers - Minimum number of workers to maintain regardless of job count
   * @param maxWorkers - Maximum number of workers allowed regardless of job count
   * @param baseJobCount - Reference job count that maps to roughly 1×sensitivity workers
   *                      (helps calibrate the scale for your specific workload)
   * @returns The target number of workers as an integer
   * @private
   */
  private computeOptimalWorkers({
    pendingJobs,
    sensitivity,
    minWorkers,
    maxWorkers,
    baseJobCount
  }: {
    pendingJobs: number;
    sensitivity: number;
    minWorkers: number;
    maxWorkers: number;
    baseJobCount: number;
  }): number {
    // Handle edge cases
    if (pendingJobs <= 0) {
      logger.debug('No pending jobs, using minWorkers', { minWorkers });
      return minWorkers;
    }

    // Compute workers using logarithmic scaling
    // The formula: sensitivity * log(pendingJobs/baseJobCount + 1) + minWorkers
    //
    // This gives us:
    // - When pendingJobs = 0: minWorkers
    // - When pendingJobs = baseJobCount: roughly minWorkers + sensitivity
    // - As pendingJobs grows, workers increase logarithmically
    const computedWorkers = sensitivity * Math.log(pendingJobs / baseJobCount + 1) + minWorkers;

    // Round to nearest integer and enforce bounds
    let result = Math.min(Math.max(Math.round(computedWorkers), minWorkers), maxWorkers);

    // You should always deploy at least one worker if there is at least one job
    if (pendingJobs > 0 && result < 1) {
      logger.debug(
        'Optimal workers found < 1 when there was at least one pending job...forcing result to 1',
        {
          pendingJobs,
          minWorkers
        }
      );
      result = 1;
    }

    logger.debug('Computed optimal workers', {
      pendingJobs,
      sensitivity,
      minWorkers,
      maxWorkers,
      baseJobCount,
      rawComputed: computedWorkers,
      finalResult: result
    });

    return result;
  }

  /**
   * Adjust capacity for a specific job type
   * @param jobType - The job type to adjust capacity for
   * @param pending - Number of pending jobs of this type
   * @param workers - Current worker count for this type
   * @param config - Configuration for this job type
   * @private
   */
  private async adjustCapacityForTask({
    jobTypes,
    pending,
    workers,
    config
  }: {
    jobTypes: JobType[];
    pending: number;
    workers: number;
    config: JobTypeConfig;
  }) {
    const now = Date.now();
    const lastScale = this.lastScaleTime[config.taskDefinitionArn] || 0;
    const cooldownMs = config.scaling.cooldownSeconds * 1000;
    const timeInCooldown = now - lastScale;
    const inCooldown = timeInCooldown < cooldownMs;

    // Check cooldown
    if (inCooldown) {
      logger.debug('Still in cooldown period', {
        jobTypes,
        elapsed: timeInCooldown,
        cooldownMs,
        remaining: cooldownMs - timeInCooldown
      });
      return;
    }

    // Determine the ideal number of workers
    logger.debug('Calculating target capacity', {
      jobTypes,
      pending,
      currentWorkers: workers,
      scalingConfig: config.scaling
    });

    const idealTarget = this.computeOptimalWorkers({
      pendingJobs: pending,
      sensitivity: config.scaling.sensitivity,
      minWorkers: config.scaling.min,
      maxWorkers: config.scaling.max,
      baseJobCount: config.scaling.factor
    });

    const diff = idealTarget - workers;

    if (diff > 0) {
      logger.info('Launching additional tasks', {
        count: diff,
        jobTypes,
        currentWorkers: workers,
        targetWorkers: idealTarget,
        pendingJobs: pending
      });
      void this.launchTask({ count: diff, config });
    } else if (diff < 0) {
      logger.debug('Capacity reduction not implemented', {
        jobTypes,
        currentWorkers: workers,
        targetWorkers: idealTarget,
        excess: -diff
      });
      // Note: No implementation for scaling down - tasks will terminate themselves
    } else {
      logger.debug('No capacity adjustment needed', {
        jobTypes,
        currentWorkers: workers,
        targetWorkers: idealTarget
      });
    }
  }

  /**
   * Starts the capacity manager
   */
  public start() {
    if (this.isRunning) {
      logger.info('Capacity manager already running');
      return;
    }

    logger.info('Starting capacity manager...');
    this.isRunning = true;
    this.pollJobQueue();

    // Add error handlers for uncaught errors
    process.on('uncaughtException', error => {
      logger.error('Uncaught exception', { error });
      this.stop();
    });

    process.on('unhandledRejection', error => {
      logger.error('Unhandled rejection', { error });
      this.stop();
    });
  }

  /**
   * Stops the capacity manager
   */
  public stop() {
    logger.info('Stopping capacity manager...');
    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  /**
   * Gets a random public subnet from the VPC
   * @param vpcId - The VPC ID to get subnets from
   * @returns The subnet ID
   * @private
   */
  private async getRandomPublicSubnet(vpcId: string): Promise<string> {
    try {
      logger.debug('Fetching public subnets', { vpcId });
      const command = new DescribeSubnetsCommand({
        Filters: [
          {
            Name: 'vpc-id',
            Values: [vpcId]
          },
          {
            Name: 'map-public-ip-on-launch',
            Values: ['true']
          }
        ]
      });

      const response = await this.ec2Client.send(command);
      const publicSubnets = response.Subnets || [];

      if (publicSubnets.length === 0) {
        logger.error('No public subnets found', { vpcId });
        throw new Error(`No public subnets found in VPC ${vpcId}`);
      }

      // Randomly select a subnet
      const randomIndex = Math.floor(Math.random() * publicSubnets.length);
      const selectedSubnet = publicSubnets[randomIndex];

      logger.info('Selected subnet', {
        subnetId: selectedSubnet.SubnetId,
        availabilityZone: selectedSubnet.AvailabilityZone
      });
      return selectedSubnet.SubnetId!;
    } catch (error) {
      logger.error('Error getting public subnets', { error });
      throw error;
    }
  }

  /**
   * Returns information about the current worker distribution
   * @returns Summary of current workers
   */
  public getWorkerStats() {
    const byStatus = {
      PENDING: this.trackedWorkers.filter(w => w.status === 'PENDING').length,
      RUNNING: this.trackedWorkers.filter(w => w.status === 'RUNNING').length
    };

    const byJobType = Object.values(JobType).reduce<Record<string, number>>((acc, jobType) => {
      acc[jobType] = 0;
      return acc;
    }, {});

    this.trackedWorkers.forEach(worker => {
      worker.jobTypes.forEach(jobType => {
        byJobType[jobType]++;
      });
    });

    return {
      totalWorkers: this.trackedWorkers.length,
      byStatus,
      byJobType
    };
  }
}
