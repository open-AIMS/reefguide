import { Command } from 'commander';
import { ApiClientService } from '../services/api-client';
import { InvalidateCacheResponse } from '@reefguide/types';
import { JobType } from '@reefguide/db';

/**
 * Invalidate cache for a specific job type
 */
async function invalidateJobTypeCache(
  apiClient: ApiClientService,
  jobType: JobType
): Promise<InvalidateCacheResponse> {
  try {
    console.log(`🗑️  Invalidating cache for job type: ${jobType}...`);
    const response = await apiClient.client.post<InvalidateCacheResponse>(
      `${apiClient.apiBaseUrl}/jobs/invalidate-cache`,
      {
        jobType: jobType
      }
    );

    console.log(`✅ ${response.data.message}`);
    console.log(`📊 Affected results: ${response.data.invalidated.affectedResults}`);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Unauthorized - invalid token or insufficient permissions');
    }
    if (error.response?.status === 403) {
      throw new Error('Forbidden - admin privileges required');
    }
    throw new Error(
      `Failed to invalidate cache: ${error.response?.data?.message || error.message}`
    );
  }
}

/**
 * Get all available job types for selection
 */
function getAvailableJobTypes(): JobType[] {
  return Object.values(JobType);
}

/**
 * Display available job types
 */
function displayJobTypes(): void {
  const jobTypes = getAvailableJobTypes();
  console.log('📋 Available job types:');
  jobTypes.forEach((type, index) => {
    console.log(`   ${index + 1}. ${type}`);
  });
  console.log('');
}

/**
 * Validate job type input
 */
function validateJobType(jobType: string): JobType {
  const availableTypes = getAvailableJobTypes();
  const upperJobType = jobType.toUpperCase();

  if (!availableTypes.includes(upperJobType as JobType)) {
    throw new Error(`Invalid job type: ${jobType}. Available types: ${availableTypes.join(', ')}`);
  }

  return upperJobType as JobType;
}

/**
 * Command: Invalidate cache for a specific job type
 */
async function invalidateCache(jobType?: string): Promise<void> {
  try {
    console.log('🔄 Starting cache invalidation process...');

    const apiClient = new ApiClientService();
    await apiClient.initialize();

    let selectedJobType: JobType;

    if (jobType) {
      // Job type provided via command line argument
      selectedJobType = validateJobType(jobType);
    } else {
      // No job type provided, show available options
      displayJobTypes();
      throw new Error(
        'Job type is required. Use: cache-mgmt invalidate <JOB_TYPE> or see available types above.'
      );
    }

    // Confirm action
    console.log(`⚠️  You are about to invalidate cache for job type: ${selectedJobType}`);
    console.log('This will mark all existing results for this job type as invalid.');
    console.log('New job requests will not use cached results until new jobs complete.');

    // Perform cache invalidation
    await invalidateJobTypeCache(apiClient, selectedJobType);

    console.log('✅ Cache invalidation completed successfully.');
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Command: Invalidate cache for all job types
 */
async function invalidateAllCaches(): Promise<void> {
  try {
    console.log('🔄 Starting cache invalidation for ALL job types...');

    const apiClient = new ApiClientService();
    await apiClient.initialize();

    const jobTypes = getAvailableJobTypes();

    console.log('⚠️  WARNING: You are about to invalidate cache for ALL job types:');
    jobTypes.forEach(type => console.log(`   - ${type}`));
    console.log('');
    console.log('This will mark ALL existing job results as invalid.');
    console.log('This is a destructive operation that cannot be undone.');

    let totalAffected = 0;

    // Invalidate cache for each job type
    for (const jobType of jobTypes) {
      try {
        const result = await invalidateJobTypeCache(apiClient, jobType);
        totalAffected += result.invalidated.affectedResults;
      } catch (error: any) {
        console.warn(`⚠️  Warning: Failed to invalidate cache for ${jobType}: ${error.message}`);
      }
    }

    console.log('');
    console.log('✅ Cache invalidation for all job types completed.');
    console.log(`📊 Total results affected: ${totalAffected}`);
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Command: List available job types
 */
async function listJobTypes(): Promise<void> {
  try {
    console.log('📋 Available job types for cache management:\n');

    const jobTypes = getAvailableJobTypes();
    jobTypes.forEach((type, index) => {
      console.log(`${index + 1}. ${type}`);
    });

    console.log('\nUsage:');
    console.log('  cache-mgmt invalidate <JOB_TYPE>  - Invalidate cache for specific job type');
    console.log('  cache-mgmt invalidate-all         - Invalidate cache for all job types');
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Create cache management commands
 */
export function createCacheManagementCommands(program: Command): void {
  const cacheMgmt = program
    .command('cache-mgmt')
    .alias('cache')
    .description('Manage job result cache');

  cacheMgmt
    .command('invalidate <jobType>')
    .description('Invalidate cache for a specific job type')
    .action(async (jobType: string) => {
      await invalidateCache(jobType);
    });

  cacheMgmt
    .command('invalidate-all')
    .description('Invalidate cache for ALL job types (use with caution)')
    .action(async () => {
      await invalidateAllCaches();
    });

  cacheMgmt
    .command('list-types')
    .alias('types')
    .description('List available job types for cache management')
    .action(async () => {
      await listJobTypes();
    });
}
