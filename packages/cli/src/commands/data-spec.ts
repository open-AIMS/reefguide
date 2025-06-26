import { Command } from 'commander';
import { ApiClientService } from '../services/api-client';
import { JobPollingService } from '../services/job-polling';
import { CreateJobResponse, CriteriaRangeOutput, ListRegionsResponse } from '@reefguide/types';

/**
 * Trigger data specification reload job
 */
async function triggerDataSpecReload(apiClient: ApiClientService): Promise<number> {
  try {
    console.log('🚀 Triggering data specification reload...');
    const response = await apiClient.client.post<CreateJobResponse>(
      `${apiClient.apiBaseUrl}/admin/data-specification-update`
    );

    console.log(`✅ Job created successfully... ID: ${response.data.jobId}`);
    return response.data.jobId;
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Unauthorized - invalid token or insufficient permissions');
    }
    throw new Error(`Failed to trigger job: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get all available regions
 */
async function getRegions(apiClient: ApiClientService): Promise<ListRegionsResponse> {
  try {
    const response = await apiClient.client.get<ListRegionsResponse>(
      `${apiClient.apiBaseUrl}/admin/regions`
    );
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Unauthorized - invalid token or insufficient permissions');
    }
    throw new Error(`Failed to fetch regions: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get criteria for a specific region
 */
async function getCriteriaForRegion(
  apiClient: ApiClientService,
  regionName: string
): Promise<CriteriaRangeOutput> {
  try {
    const response = await apiClient.client.get<CriteriaRangeOutput>(
      `${apiClient.apiBaseUrl}/admin/criteria/${regionName}/ranges`
    );
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Region '${regionName}' not found`);
    }
    if (error.response?.status === 401) {
      throw new Error('Unauthorized - invalid token or insufficient permissions');
    }
    throw new Error(
      `Failed to fetch criteria for region ${regionName}: ${error.response?.data?.message || error.message}`
    );
  }
}

/**
 * Command: Reload data specification
 */
async function dataSpecReload(): Promise<void> {
  try {
    console.log('🔄 Starting data specification reload process...');

    const apiClient = new ApiClientService();
    await apiClient.initialize();

    // Trigger job
    const jobId = await triggerDataSpecReload(apiClient);

    // Monitor job using polling service
    const jobPoller = new JobPollingService(apiClient);
    await jobPoller.pollJobSimple(jobId);

    console.log('✅ Data specification reload process completed successfully.');
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Command: View current data specification
 */
async function viewDataSpec(): Promise<void> {
  try {
    const apiClient = new ApiClientService();
    await apiClient.initialize();

    console.log('📋 Fetching current data specification...\n');

    // Get all regions
    const regionsData = await getRegions(apiClient);

    if (regionsData.regions.length === 0) {
      console.log('ℹ️  No regions found in the database.');
      return;
    }

    console.log(`Found ${regionsData.regions.length} region(s):\n`);

    // For each region, get and display criteria
    for (const region of regionsData.regions) {
      console.log(`🌊 Region: ${region.display_name} (${region.name})`);
      if (region.description) {
        console.log(`   Description: ${region.description}`);
      }
      console.log(`   Criteria count: ${region.criteria_count}\n`);

      if (region.criteria_count > 0) {
        try {
          const criteria = await getCriteriaForRegion(apiClient, region.name);

          Object.entries(criteria).forEach(([criteriaName, details]) => {
            console.log(`   📊 ${details.display_title} (${criteriaName})`);
            if (details.display_subtitle) {
              console.log(`      ${details.display_subtitle}`);
            }
            console.log(
              `      Range: ${details.min_val} to ${details.max_val}${details.units ? ` ${details.units}` : ''}`
            );
            console.log(
              `      Default: ${details.default_min_val} to ${details.default_max_val}${details.units ? ` ${details.units}` : ''}`
            );
            console.log(`      Payload prefix: ${details.payload_property_prefix}`);
            console.log('');
          });
        } catch (error: any) {
          console.log(`   ❌ Error fetching criteria: ${error.message}\n`);
        }
      }

      console.log('─'.repeat(60) + '\n');
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Create data specification commands
 */
export function createDataSpecCommands(program: Command): void {
  const dataSpec = program.command('data-spec').description('Manage data specification');

  dataSpec
    .command('reload')
    .description('Trigger a data specification reload job and monitor its progress')
    .action(async () => {
      await dataSpecReload();
    });

  dataSpec
    .command('view')
    .alias('list')
    .description('View current data specification with regions and criteria')
    .action(async () => {
      await viewDataSpec();
    });
}
