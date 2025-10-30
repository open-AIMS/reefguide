import { Command } from 'commander';
import { ApiClientService } from '../services/api-client';
import { JobType } from '@reefguide/db';
import { PostTimeoutJobsResponse } from '@reefguide/types';

/**
 * Trigger job timeout process
 */
async function timeoutJobs(
  apiClient: ApiClientService,
  timeoutThresholdMinutes: number,
  jobTypes?: JobType[]
): Promise<PostTimeoutJobsResponse> {
  try {
    console.log(`⏱️  Timing out jobs older than ${timeoutThresholdMinutes} minutes...`);
    if (jobTypes && jobTypes.length > 0) {
      console.log(`   Filtering by job types: ${jobTypes.join(', ')}`);
    }

    const response = await apiClient.client.post<PostTimeoutJobsResponse>(
      `${apiClient.apiBaseUrl}/admin/timeout-jobs`,
      {
        timeoutThresholdMinutes,
        jobTypes
      }
    );

    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Unauthorized - invalid token or insufficient permissions');
    }
    throw new Error(`Failed to timeout jobs: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Command: Timeout stale jobs
 */
async function runTimeoutJobs(timeoutThresholdMinutes: number, jobTypes?: string[]): Promise<void> {
  try {
    console.log('🔍 Starting job timeout process...\n');

    const apiClient = new ApiClientService();
    await apiClient.initialize();

    // Validate and convert job types if provided
    let validatedJobTypes: JobType[] | undefined;
    if (jobTypes && jobTypes.length > 0) {
      const validJobTypes = Object.values(JobType);
      validatedJobTypes = jobTypes.map(type => {
        const upperType = type.toUpperCase();
        if (!validJobTypes.includes(upperType as JobType)) {
          throw new Error(
            `Invalid job type: ${type}. Valid types are: ${validJobTypes.join(', ')}`
          );
        }
        return upperType as JobType;
      });
    }

    // Execute timeout
    const result = await timeoutJobs(apiClient, timeoutThresholdMinutes, validatedJobTypes);

    // Display results
    console.log('\n📊 Results:');
    console.log(`   Total jobs timed out: ${result.totalTimedOut}`);

    if (result.totalTimedOut > 0) {
      console.log('\n   Breakdown by job type:');
      Object.entries(result.byType).forEach(([type, count]) => {
        console.log(`      ${type}: ${count}`);
      });

      console.log('\n   Timed out job IDs:');
      console.log(`      ${result.timedOutJobIds.join(', ')}`);
    } else {
      console.log('\n   No jobs needed to be timed out.');
    }

    console.log('\n✅ Job timeout process completed successfully.');
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Create job timeout commands
 */
export function createJobTimeoutCommands(program: Command): void {
  const jobTimeout = program
    .command('job-timeout')
    .description('Manage job timeouts for stale jobs');

  jobTimeout
    .command('run')
    .description('Timeout jobs that have been stuck in PENDING or IN_PROGRESS state')
    .option(
      '-m, --minutes <minutes>',
      'Timeout threshold in minutes (jobs older than this will be timed out)',
      '60'
    )
    .option(
      '-t, --types <types...>',
      'Optional: Specific job types to timeout (e.g., SUITABILITY_ASSESSMENT REGIONAL_ASSESSMENT)'
    )
    .action(async options => {
      const minutes = parseInt(options.minutes, 10);
      if (isNaN(minutes) || minutes <= 0) {
        console.error('❌ Error: Minutes must be a positive number');
        process.exit(1);
      }
      await runTimeoutJobs(minutes, options.types);
    });
}
