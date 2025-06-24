#!/usr/bin/env node

import { Command } from 'commander';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import { read } from 'read';
import {
  CreateJobResponse,
  CriteriaRangeOutput,
  JobDetailsResponse,
  ListRegionsResponse,
  LoginInput,
  LoginResponse
} from '@reefguide/types';

// Load environment variables
dotenv.config();

class AdminCLI {
  private apiClient: AxiosInstance;
  private token: string | null = null;
  private baseUrl = '';

  constructor() {
    this.apiClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Utility function to prompt for input
  private async promptInput(question: string, hideInput = false): Promise<string> {
    return read<string>({ prompt: question, silent: hideInput }).then(result => {
      return (result || '').trim();
    });
  }

  // Get credentials from environment or prompt user
  private async getCredentials(): Promise<{ username: string; password: string }> {
    let username = process.env.CLI_USERNAME;
    let password = process.env.CLI_PASSWORD;

    if (!username) {
      username = await this.promptInput('Enter username: ');
    } else {
      console.log(`Using username from environment: ${username}`);
    }

    if (!password) {
      password = await this.promptInput('Enter password: ', true);
    } else {
      console.log('Using password from environment variables');
    }

    return { username, password };
  }

  // Get API endpoint from environment or prompt user
  private async getApiEndpoint(): Promise<string> {
    let endpoint = process.env.CLI_ENDPOINT;

    if (!endpoint) {
      endpoint = await this.promptInput('Enter API endpoint (e.g., http://localhost:5000/api): ');
    } else {
      console.log(`Using API endpoint from environment: ${endpoint}`);
    }

    // Remove trailing slash if present
    return endpoint.replace(/\/$/, '');
  }

  // Login and get authentication token
  private async login(username: string, password: string): Promise<void> {
    try {
      console.log('🔐 Logging in...');
      const response = await this.apiClient.post<LoginResponse>(`${this.baseUrl}/auth/login`, {
        email: username,
        password: password
      } satisfies LoginInput);

      this.token = response.data.token;

      // Set authorization header for future requests
      this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;

      console.log('✅ Login successful');
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid credentials');
      }
      throw new Error(`Login failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Trigger data specification reload job
  private async triggerDataSpecReload(): Promise<number> {
    try {
      console.log('🚀 Triggering data specification reload...');
      const response = await this.apiClient.post<CreateJobResponse>(
        `${this.baseUrl}/admin/data-specification-update`
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

  // Poll job status until completion
  private async pollJobStatus(jobId: number): Promise<void> {
    console.log(`📊 Monitoring job ${jobId}...`);

    const startTime = Date.now();

    while (true) {
      try {
        const response = await this.apiClient.get<JobDetailsResponse>(
          `${this.baseUrl}/jobs/${jobId}`
        );
        const job = response.data.job;
        const currentStatus = job.status;

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[${elapsed}s] Job status: ${currentStatus}`);

        // Check if job is complete
        if (currentStatus === 'SUCCEEDED') {
          console.log('🎉 Job completed successfully!');
          break;
        } else if (currentStatus === 'FAILED') {
          console.log('❌ Job failed!');
          process.exit(1);
        } else if (currentStatus === 'CANCELLED') {
          console.log('⚠️  Job was cancelled');
          process.exit(1);
        } else if (currentStatus === 'TIMED_OUT') {
          console.log('⏰ Job timed out');
          process.exit(1);
        }

        // Wait 5 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error: any) {
        console.error(
          `Error polling job status: ${error.response?.data?.message || error.message}`
        );
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retry
      }
    }
  }

  // Get all available regions
  private async getRegions(): Promise<ListRegionsResponse> {
    try {
      const response = await this.apiClient.get<ListRegionsResponse>(
        `${this.baseUrl}/admin/regions`
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Unauthorized - invalid token or insufficient permissions');
      }
      throw new Error(`Failed to fetch regions: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get criteria for a specific region
  private async getCriteriaForRegion(regionName: string): Promise<CriteriaRangeOutput> {
    try {
      const response = await this.apiClient.get<CriteriaRangeOutput>(
        `${this.baseUrl}/admin/criteria/${regionName}/ranges`
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

  // View current data specification
  async viewDataSpec(): Promise<void> {
    try {
      // Get API endpoint
      this.baseUrl = await this.getApiEndpoint();

      // Get credentials
      const { username, password } = await this.getCredentials();

      // Login
      await this.login(username, password);

      console.log('📋 Fetching current data specification...\n');

      // Get all regions
      const regionsData = await this.getRegions();

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
            const criteria = await this.getCriteriaForRegion(region.name);

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

  // Main command function
  async dataSpecReload(): Promise<void> {
    try {
      // Get API endpoint
      this.baseUrl = await this.getApiEndpoint();

      // Get credentials
      const { username, password } = await this.getCredentials();

      // Login
      await this.login(username, password);

      // Trigger job
      const jobId = await this.triggerDataSpecReload();

      // Monitor job
      await this.pollJobStatus(jobId);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  }
}

// Create CLI program
const program = new Command();

program.name('reefguide-cli').description('ReefGuide Admin CLI Tool').version('0.1.0');

program
  .command('data-spec-reload')
  .description('Trigger a data specification reload job and monitor its progress')
  .action(async () => {
    console.log('🔄 Setting up data specification client...');
    const cli = new AdminCLI();
    console.log('🔄 Starting data specification process...');
    await cli.dataSpecReload();
    console.log('✅ Data specification reload process completed successfully.');
  });

program
  .command('regions')
  .description('Lists out regions and their criteria ranges')
  .action(async () => {
    const cli = new AdminCLI();
    await cli.viewDataSpec();
  });

// Parse command line arguments
program.parse();
