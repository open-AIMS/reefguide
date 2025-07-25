import { JobType, prisma } from '@reefguide/db';
import { JobService } from './jobs';
import { config } from '../config';
import { InternalServerError } from '../exceptions';

export interface RequestDataSpecificationJobResult {
  jobId: number;
  cached: boolean;
  message: string;
}

export class DataSpecificationService {
  private jobService: JobService;
  private adminEmail: string = config.creds.adminUsername;

  constructor({ adminEmail = undefined }: { adminEmail?: string } = {}) {
    this.jobService = new JobService();
    if (adminEmail) {
      this.adminEmail = adminEmail;
    }
  }

  /**
   * Creates a data specification update job
   * @returns Object containing job details and whether it was cached
   */
  public async createDataSpecificationUpdateJob(): Promise<RequestDataSpecificationJobResult> {
    try {
      // Get the admin user using config credentials
      const adminUser = await this.getConfigAdminUser();
      if (!adminUser) {
        throw new InternalServerError('Admin user not found in database');
      }

      // Create the job with cache buster to avoid caching issues
      const cacheBuster = new Date().getTime();
      const { job, cached } = await this.jobService.createJobRequest(
        adminUser.id,
        JobType.DATA_SPECIFICATION_UPDATE,
        { cache_buster: cacheBuster }
      );

      const message = cached
        ? 'Data specification update job found in cache'
        : 'Data specification update job created successfully';

      return {
        jobId: job.id,
        cached,
        message
      };
    } catch (error) {
      throw new InternalServerError(
        'Failed to create data specification update job. Error: ' + error,
        error as Error
      );
    }
  }

  /**
   * Get the admin user specified in config
   */
  private async getConfigAdminUser() {
    try {
      const adminUser = await prisma.user.findUnique({
        where: {
          email: this.adminEmail
        },
        select: {
          id: true,
          email: true,
          roles: true
        }
      });

      if (!adminUser) {
        console.error(`Admin user not found: ${config.creds.adminUsername}`);
        return undefined;
      }

      if (!adminUser.roles.includes('ADMIN')) {
        console.error(`User ${config.creds.adminUsername} does not have ADMIN role`);
        return undefined;
      }

      return adminUser;
    } catch (error) {
      console.error('Error finding config admin user:', error);
      return undefined;
    }
  }
}

// Singleton instance
let dataSpecService: DataSpecificationService | null = null;

export function getDataSpecificationService(): DataSpecificationService {
  if (!dataSpecService) {
    dataSpecService = new DataSpecificationService();
  }
  return dataSpecService;
}
