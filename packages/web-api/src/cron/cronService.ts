import { schedule, ScheduledTask } from 'node-cron';
import { getDataSpecificationService } from '../services/dataSpec';
import { config } from '../config';
import { timeoutJobs } from '../admin/helpers';

export class CronService {
  private tasks: ScheduledTask[] = [];

  /**
   * Start all scheduled cron jobs
   */
  public start(): void {
    console.debug('Starting cron service...');

    // Schedule data specification update job
    this.scheduleDataSpecificationUpdate();

    // Schedule job timeout cleanup
    this.scheduleJobTimeoutCleanup();

    console.debug(`Started ${this.tasks.length} cron job(s)`);
  }

  /**
   * Stop all scheduled cron jobs
   */
  public stop(): void {
    console.debug('Stopping cron service...');
    this.tasks.forEach(task => {
      task.stop();
    });
    this.tasks = [];
    console.debug('All cron jobs stopped');
  }

  /**
   * Schedule the data specification update job
   * Runs daily at 2:00 AM AEDT
   */
  private scheduleDataSpecificationUpdate(): void {
    console.debug('Scheduling data specification update job...');
    const task = schedule(
      // 2AM AEDT
      '0 2 * * *',
      async () => {
        try {
          console.debug('Starting scheduled data specification update...');
          const dataSpecService = getDataSpecificationService();
          const { jobId, cached, message } =
            await dataSpecService.createDataSpecificationUpdateJob();
          if (cached) {
            console.debug(`Data specification update job found in cache: ${jobId}`);
          } else {
            console.debug(`Data specification update job created: ${jobId}`);
          }
          console.debug(message);
        } catch (error) {
          console.error('Failed to create scheduled data specification update job:', error);
        }
      },
      {
        // Use AEDT to avoid timezone issues
        timezone: 'Australia/Sydney'
      }
    );
    this.tasks.push(task);
    task.start();
    console.debug('Scheduled data specification update job (daily at 2:00 AM AEDT)');
  }

  /**
   * Schedule the job timeout cleanup
   * Runs every hour to clean up stale jobs
   */
  private scheduleJobTimeoutCleanup(): void {
    console.debug('Scheduling job timeout cleanup...');
    const task = schedule(
      // Every hour at minute 0
      '0 * * * *',
      async () => {
        try {
          console.debug('Starting scheduled job timeout cleanup...');
          const result = await timeoutJobs({
            timeoutThresholdMinutes: config.jobExpiryMinutes
          });

          if (result.totalTimedOut > 0) {
            console.debug(`Timed out ${result.totalTimedOut} job(s):`);
            Object.entries(result.byType).forEach(([type, count]) => {
              console.debug(`  ${type}: ${count}`);
            });
            console.debug(`  Job IDs: ${result.timedOutJobIds.join(', ')}`);
          } else {
            console.debug('No jobs needed to be timed out');
          }
        } catch (error) {
          console.error('Failed to run scheduled job timeout cleanup:', error);
        }
      },
      {
        timezone: 'Australia/Sydney'
      }
    );
    this.tasks.push(task);
    task.start();
    console.debug(
      `Scheduled job timeout cleanup (hourly, threshold: ${config.jobExpiryMinutes} minutes)`
    );
  }

  /**
   * Get status of all scheduled tasks
   */
  public getStatus(): { taskCount: number; running: boolean[] } {
    return {
      taskCount: this.tasks.length,
      running: this.tasks.map(task => task.getStatus() === 'scheduled')
    };
  }
}

// Singleton instance
let cronService: CronService | null = null;

export function getCronService(): CronService {
  if (!cronService) {
    cronService = new CronService();
  }
  return cronService;
}
