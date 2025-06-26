import { ApiClientService } from './api-client';
import { JobDetailsResponse } from '@reefguide/types';

export interface JobPollingOptions {
  // ms
  pollInterval?: number;
  // ms
  timeout?: number;
  onStatusUpdate?: (status: string, elapsed: number) => void;
  onComplete?: (status: string, elapsed: number) => void;
  onError?: (error: any, retryCount: number) => void;
}

export interface JobPollingResult {
  finalStatus: string;
  totalTime: number;
  success: boolean;
}

export class JobPollingService {
  private apiClient: ApiClientService;

  constructor(apiClient: ApiClientService) {
    this.apiClient = apiClient;
  }

  /**
   * Poll a job until completion with configurable options
   */
  async pollJob(jobId: number, options: JobPollingOptions = {}): Promise<JobPollingResult> {
    const {
      pollInterval = 5000, // 5 seconds default
      timeout = 1800000, // 30 minutes default
      onStatusUpdate,
      onComplete,
      onError
    } = options;

    console.log(`📊 Monitoring job ${jobId}...`);

    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = 3;

    while (true) {
      const elapsed = Date.now() - startTime;

      // Check timeout
      if (elapsed > timeout) {
        const timeoutSeconds = Math.round(elapsed / 1000);
        console.log(`⏰ Job polling timed out after ${timeoutSeconds}s`);
        return {
          finalStatus: 'TIMEOUT',
          totalTime: elapsed,
          success: false
        };
      }

      try {
        const response = await this.apiClient.client.get<JobDetailsResponse>(
          `${this.apiClient.apiBaseUrl}/jobs/${jobId}`
        );

        const job = response.data.job;
        const currentStatus = job.status;
        const elapsedSeconds = Math.round(elapsed / 1000);

        // Reset retry count on successful request
        retryCount = 0;

        // Call status update callback
        if (onStatusUpdate) {
          onStatusUpdate(currentStatus, elapsedSeconds);
        } else {
          console.log(`[${elapsedSeconds}s] Job status: ${currentStatus}`);
        }

        // Check if job is complete
        if (this.isTerminalStatus(currentStatus)) {
          const success = currentStatus === 'SUCCEEDED';

          if (onComplete) {
            onComplete(currentStatus, elapsedSeconds);
          } else {
            this.logTerminalStatus(currentStatus);
          }

          return {
            finalStatus: currentStatus,
            totalTime: elapsed,
            success
          };
        }

        // Wait before next poll
        await this.sleep(pollInterval);
      } catch (error: any) {
        retryCount++;

        if (onError) {
          onError(error, retryCount);
        } else {
          console.error(
            `Error polling job status (attempt ${retryCount}/${maxRetries}): ${
              error.response?.data?.message || error.message
            }`
          );
        }

        // If we've exceeded max retries, fail
        if (retryCount >= maxRetries) {
          console.error(`❌ Failed to poll job after ${maxRetries} attempts`);
          return {
            finalStatus: 'POLLING_FAILED',
            totalTime: elapsed,
            success: false
          };
        }

        // Wait before retry (longer delay for retries)
        await this.sleep(pollInterval * 2);
      }
    }
  }

  /**
   * Poll job with simple console output (backward compatibility)
   */
  async pollJobSimple(jobId: number): Promise<void> {
    const result = await this.pollJob(jobId);

    if (!result.success) {
      process.exit(1);
    }
  }

  /**
   * Poll multiple jobs concurrently
   */
  async pollMultipleJobs(
    jobIds: number[],
    options: JobPollingOptions = {}
  ): Promise<Record<number, JobPollingResult>> {
    console.log(`📊 Monitoring ${jobIds.length} jobs concurrently...`);

    const results = await Promise.all(
      jobIds.map(async jobId => {
        try {
          const result = await this.pollJob(jobId, {
            ...options,
            onStatusUpdate: (status, elapsed) => {
              console.log(`[${elapsed}s] Job ${jobId}: ${status}`);
            }
          });
          return { jobId, result, success: true };
        } catch (error) {
          return {
            jobId,
            result: {
              finalStatus: 'ERROR',
              totalTime: 0,
              success: false
            },
            success: false,
            error
          };
        }
      })
    );

    const jobResults: Record<number, JobPollingResult> = {};
    results.forEach((result, index) => {
      const jobId = jobIds[index];
      if (result.success) {
        jobResults[jobId] = result.result;
      } else {
        jobResults[jobId] = {
          finalStatus: 'ERROR',
          totalTime: 0,
          success: false
        };
        console.error(`❌ Failed to poll job ${jobId}:`, result.error);
      }
    });

    return jobResults;
  }

  /**
   * Wait for all jobs to complete, failing if any job fails
   */
  async waitForAllJobs(jobIds: number[], options: JobPollingOptions = {}): Promise<boolean> {
    const results = await this.pollMultipleJobs(jobIds, options);

    const failed = Object.entries(results).filter(([, result]) => !result.success);

    if (failed.length > 0) {
      console.log(`❌ ${failed.length} job(s) failed:`);
      failed.forEach(([jobId, result]) => {
        console.log(`   Job ${jobId}: ${result.finalStatus}`);
      });
      return false;
    }

    console.log(`✅ All ${jobIds.length} jobs completed successfully`);
    return true;
  }

  /**
   * Check if a status indicates the job is finished
   */
  private isTerminalStatus(status: string): boolean {
    return ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(status);
  }

  /**
   * Log the final status of a job
   */
  private logTerminalStatus(status: string): void {
    switch (status) {
      case 'SUCCEEDED':
        console.log('🎉 Job completed successfully!');
        break;
      case 'FAILED':
        console.log('❌ Job failed!');
        break;
      case 'CANCELLED':
        console.log('⚠️  Job was cancelled');
        break;
      case 'TIMED_OUT':
        console.log('⏰ Job timed out');
        break;
      default:
        console.log(`🔄 Job finished with status: ${status}`);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
