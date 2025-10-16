import { schedule, ScheduledTask } from 'node-cron';
import { getDataSpecificationService } from '../services/dataSpec';

export class CronService {
  private tasks: ScheduledTask[] = [];

  /**
   * Start all scheduled cron jobs
   */
  public start(): void {
    console.debug('Starting cron service...');

    // Schedule data specification update job
    this.scheduleDataSpecificationUpdate();

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
   * Runs daily at 2:00 AM UTC
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

    console.debug('Scheduled data specification update job (daily at 2:00 AM UTC)');
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
