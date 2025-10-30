import { JobStatus, JobType, prisma } from '@reefguide/db';
import { PostTimeoutJobsResponse } from '@reefguide/types';

/**
 * Options for timing out jobs
 */
export interface TimeoutJobsOptions {
  /** Threshold in minutes - jobs older than this will be timed out */
  timeoutThresholdMinutes: number;
  /** Optional array of specific job types to check. If not provided, checks all types */
  jobTypes?: JobType[];
}

/**
 * Times out jobs that have been in non-terminal states for too long.
 *
 * This function finds jobs that are PENDING or IN_PROGRESS and older than
 * the specified threshold, then sets their status to TIMED_OUT.
 *
 * @param options - Configuration for timeout operation
 * @returns Metadata about timed out jobs
 */
export async function timeoutJobs(options: TimeoutJobsOptions): Promise<PostTimeoutJobsResponse> {
  const { timeoutThresholdMinutes, jobTypes } = options;

  // Calculate the cutoff time
  const currentTime = new Date();
  const timeoutThresholdMs = timeoutThresholdMinutes * 60 * 1000;
  const cutoffTime = new Date(currentTime.getTime() - timeoutThresholdMs);

  // Build the where clause
  const whereClause: any = {
    status: {
      in: [JobStatus.PENDING, JobStatus.IN_PROGRESS]
    },
    created_at: {
      lt: cutoffTime
    }
  };

  // If specific job types are provided, filter by them
  if (jobTypes && jobTypes.length > 0) {
    whereClause.type = {
      in: jobTypes
    };
  }

  // Find all jobs that need to be timed out
  const jobsToTimeout = await prisma.job.findMany({
    where: whereClause,
    select: {
      id: true,
      type: true
    }
  });

  // If no jobs to timeout, return early
  if (jobsToTimeout.length === 0) {
    return {
      totalTimedOut: 0,
      byType: {} as Record<JobType, number>,
      timedOutJobIds: []
    };
  }

  // Extract job IDs
  const jobIds = jobsToTimeout.map(job => job.id);

  // Update all jobs to TIMED_OUT status
  await prisma.job.updateMany({
    where: {
      id: {
        in: jobIds
      }
    },
    data: {
      status: JobStatus.TIMED_OUT,
      updated_at: new Date()
    }
  });

  // Calculate breakdown by type
  const byType: Record<JobType, number> = {} as Record<JobType, number>;
  jobsToTimeout.forEach(job => {
    if (!byType[job.type]) {
      byType[job.type] = 0;
    }
    byType[job.type]++;
  });

  return {
    totalTimedOut: jobsToTimeout.length,
    byType,
    timedOutJobIds: jobIds
  };
}
