import { Config } from './config';
import { AuthApiClient } from './authClient';
import { TaskIdentifiers } from './ecs';

interface Job {
  id: number;
  type: string;
  input_payload: any;
}

interface JobAssignment {
  id: number;
  job_id: number;
  storage_uri: string;
}

export class TestWorker {
  private config: Config;

  private activeJobs: Map<number, NodeJS.Timeout>;

  private isPolling: boolean;

  private client: AuthApiClient;

  private metadata: Partial<TaskIdentifiers>;

  private idleTimeout: NodeJS.Timeout | null = null;

  private lastActivityTimestamp: number = Date.now();

  constructor(config: Config, client: AuthApiClient, metadata: Partial<TaskIdentifiers>) {
    this.metadata = metadata;
    this.config = config;
    this.activeJobs = new Map();
    this.isPolling = false;
    this.client = client;
  }

  async start() {
    console.log('Starting test worker with config:', {
      jobTypes: this.config.jobTypes,
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      pollInterval: this.config.pollIntervalMs,
      idleTimeout: this.config.idleTimeoutMs
    });

    this.isPolling = true;
    this.poll();
    this.startIdleTimer();
  }

  async stop() {
    console.log('Stopping worker...');
    this.isPolling = false;
    this.clearIdleTimer();

    // Cancel all active jobs
    for (const [jobId, timeout] of this.activeJobs.entries()) {
      clearTimeout(timeout);
      console.log(`Cancelled job ${jobId}`);
    }
    this.activeJobs.clear();

    // done - close process
    process.exit(0);
  }

  private updateLastActivity() {
    this.lastActivityTimestamp = Date.now();
    this.startIdleTimer(); // Reset the idle timer
  }

  private startIdleTimer() {
    // Clear any existing timer
    this.clearIdleTimer();

    // Only start the timer if idleTimeoutMs is configured
    if (this.config.idleTimeoutMs) {
      this.idleTimeout = setTimeout(() => {
        const idleTime = Date.now() - this.lastActivityTimestamp;
        if (idleTime >= this.config.idleTimeoutMs && this.activeJobs.size === 0) {
          console.log(`Worker idle for ${idleTime}ms, shutting down...`);
          this.stop();
        }
      }, this.config.idleTimeoutMs);
    }
  }

  private clearIdleTimer() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  private async poll() {
    if (!this.isPolling) return;

    try {
      // Only poll if we have capacity
      if (this.activeJobs.size < this.config.maxConcurrentJobs) {
        await this.pollForJobs();
      }
    } catch (error) {
      console.error('Error in poll cycle:', error);
    }

    // Schedule next poll
    setTimeout(() => this.poll(), this.config.pollIntervalMs);
  }

  private async pollForJobs() {
    try {
      // Get available jobs
      const response = await this.client.get<{ jobs: Job[] }>('/jobs/poll', {
        params: { jobType: this.config.jobTypes[0] }
      });

      const jobs: Job[] = response.jobs;

      if (jobs.length === 0) {
        return;
      }

      // Update activity timestamp when we find a job
      this.updateLastActivity();

      // Try to claim first available job
      const job = jobs[0];
      await this.claimAndProcessJob(job);
    } catch (error) {
      console.error('Error polling for jobs:', error);
    }
  }

  private async claimAndProcessJob(job: Job) {
    try {
      // Try to claim the job
      const assignmentResponse = await this.client.post<{
        assignment: JobAssignment;
      }>('/jobs/assign', {
        jobId: job.id,
        ecsTaskArn: this.metadata.taskArn ?? 'Unknown - metadata lookup failure',
        ecsClusterArn: this.metadata.clusterArn ?? 'Unknown - metadata lookup failure'
      });

      const assignment = assignmentResponse.assignment;

      console.log(`Claimed job ${job.id}, assignment ${assignment.id}`);

      // Update activity timestamp when we claim a job
      this.updateLastActivity();

      // Simulate processing by setting a timeout
      const timeout = setTimeout(
        () => this.completeJob(assignment.id, job),
        this.getRandomProcessingTime()
      );

      this.activeJobs.set(job.id, timeout);
    } catch (error) {
      console.error(`Error claiming job ${job.id}:`, error);
    }
  }

  private async completeJob(assignmentId: number, job: Job) {
    try {
      console.log(`Completing job ${job.id}`);

      // Simulate success/failure randomly
      const success = Math.random() > 0.1; // 90% success rate

      await this.client.post<any>(`/jobs/assignments/${assignmentId}/result`, {
        status: success ? 'SUCCEEDED' : 'FAILED',
        resultPayload: success ? {} : null
      });

      console.log(`Job ${job.id} completed with status: ${success ? 'SUCCESS' : 'FAILURE'}`);

      // Update activity timestamp when we complete a job
      this.updateLastActivity();
    } catch (error) {
      console.error(`Error completing job ${job.id}:`, error);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  private getRandomProcessingTime(): number {
    // Random processing time between 5-15 seconds
    return Math.floor(Math.random() * 10000) + 5000;
  }

  public getActiveJobCount(): number {
    return this.activeJobs.size;
  }
}
