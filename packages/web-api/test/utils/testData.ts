import { JobStatus, JobType, prisma, ProjectType, UserRole } from '@reefguide/db';
import { JobService } from '../../src/services/jobs';
import { hashPasswordResetCode } from '../../src/password-reset/service';

// NOTE: user1Id will be available after userSetup() is called
let user1Id: number;

// Export a setter for user1Id to be called from testSetup
export const setUser1Id = (id: number) => {
  user1Id = id;
};

/**
 * Create a test polygon for a user
 */
export const createTestPolygon = async (
  userId: number,
  polygonData: any = { type: 'Polygon', coordinates: [[]] }
) => {
  return await prisma.polygon.create({
    data: {
      polygon: JSON.stringify(polygonData),
      user_id: userId
    }
  });
};

/**
 * Create a test note for a polygon
 */
export const createTestNote = async (
  polygonId: number,
  userId: number,
  content: string = 'Test note'
) => {
  return await prisma.polygonNote.create({
    data: {
      content,
      polygon_id: polygonId,
      user_id: userId
    }
  });
};

/**
 * Create a test project for a user
 */
export const createTestProject = async (
  userId: number,
  overrides: {
    name?: string;
    description?: string;
    type?: ProjectType;
    project_state?: any;
    is_public?: boolean;
  } = {}
) => {
  return await prisma.project.create({
    data: {
      name: overrides.name || 'Test Project',
      description: overrides.description || 'A test project',
      type: overrides.type || ProjectType.SITE_SELECTION,
      project_state: overrides.project_state || { step: 1, data: {} },
      is_public: overrides.is_public || false,
      user_id: userId
    }
  });
};

/**
 * Create a test job
 */
export const createTestJob = async (
  userId: number,
  type: JobType = JobType.TEST,
  status: JobStatus = JobStatus.PENDING,
  inputPayload: any = {}
) => {
  const jobService = new JobService();
  const hash = await jobService.generateJobHash({
    payload: inputPayload,
    jobType: type
  });

  return await prisma.job.create({
    data: {
      type,
      status,
      user_id: userId,
      input_payload: inputPayload,
      hash
    }
  });
};

/**
 * Create a test job assignment
 */
export const createTestJobAssignment = async (
  jobId: number,
  overrides: {
    ecs_task_arn?: string;
    ecs_cluster_arn?: string;
    expires_at?: Date;
    storage_scheme?: 'S3';
    storage_uri?: string;
    heartbeat_at?: Date;
    completed_at?: Date;
  } = {}
) => {
  return await prisma.jobAssignment.create({
    data: {
      job_id: jobId,
      ecs_task_arn: overrides.ecs_task_arn || 'arn:aws:ecs:test',
      ecs_cluster_arn: overrides.ecs_cluster_arn || 'arn:aws:ecs:cluster:test',
      expires_at: overrides.expires_at || new Date(Date.now() + 3600000), // 1 hour from now
      storage_scheme: overrides.storage_scheme || 'S3',
      storage_uri: overrides.storage_uri || 's3://test-bucket/test-path',
      heartbeat_at: overrides.heartbeat_at,
      completed_at: overrides.completed_at
    }
  });
};

/**
 * Create a test job result
 */
export const createTestJobResult = async (
  assignmentId: number,
  jobId: number,
  overrides: {
    result_payload?: any;
    storage_scheme?: 'S3';
    storage_uri?: string;
    metadata?: any;
    cache_valid?: boolean;
  } = {}
) => {
  return await prisma.jobResult.create({
    data: {
      assignment_id: assignmentId,
      job_id: jobId,
      result_payload: overrides.result_payload || { success: true },
      storage_scheme: overrides.storage_scheme || 'S3',
      storage_uri: overrides.storage_uri || 's3://test-bucket/result-path',
      metadata: overrides.metadata,
      cache_valid: overrides.cache_valid !== undefined ? overrides.cache_valid : true
    }
  });
};

/**
 * Create a test pre-approved user
 */
export const createTestPreApprovedUser = async (
  overrides: {
    email?: string;
    roles?: UserRole[];
    created_by_user_id?: number;
    used?: boolean;
    used_at?: Date;
  } = {}
) => {
  return await prisma.preApprovedUser.create({
    data: {
      email: overrides.email || 'preapproved@example.com',
      roles: overrides.roles || [UserRole.ADMIN],
      created_by_user_id: overrides.created_by_user_id,
      used: overrides.used || false,
      used_at: overrides.used_at
    }
  });
};

/**
 * Create a test password reset code
 */
export const createTestPasswordResetCode = async (
  userId: number,
  code: string = '123456',
  overrides: {
    expires_at?: Date;
    used?: boolean;
    used_at?: Date;
    attempts?: number;
  } = {}
) => {
  const hashedCode = await hashPasswordResetCode(code);

  return await prisma.passwordResetCode.create({
    data: {
      user_id: userId,
      code_hash: hashedCode,
      expires_at: overrides.expires_at || new Date(Date.now() + 900000), // 15 minutes from now
      used: overrides.used || false,
      used_at: overrides.used_at,
      attempts: overrides.attempts || 0
    }
  });
};

/**
 * Create a test refresh token
 */
export const createTestRefreshToken = async (
  userId: number,
  overrides: {
    token?: string;
    expiry_time?: number;
    valid?: boolean;
  } = {}
) => {
  return await prisma.refreshToken.create({
    data: {
      user_id: userId,
      token: overrides.token || 'test-refresh-token',
      expiry_time: overrides.expiry_time || Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      valid: overrides.valid !== undefined ? overrides.valid : true
    }
  });
};

/**
 * Create test criteria
 */
export const createTestCriteria = async (
  overrides: {
    name?: string;
    display_title?: string;
    display_subtitle?: string;
    units?: string;
    min_tooltip?: string;
    max_tooltip?: string;
    payload_prefix?: string;
  } = {}
) => {
  return await prisma.criteria.create({
    data: {
      name: overrides.name || 'test_criteria',
      display_title: overrides.display_title || 'Test Criteria',
      display_subtitle: overrides.display_subtitle,
      units: overrides.units || 'units',
      min_tooltip: overrides.min_tooltip,
      max_tooltip: overrides.max_tooltip,
      payload_prefix: overrides.payload_prefix || 'test'
    }
  });
};

/**
 * Create test region
 */
export const createTestRegion = async (
  overrides: {
    name?: string;
    display_name?: string;
    description?: string;
  } = {}
) => {
  return await prisma.region.create({
    data: {
      name: overrides.name || 'test_region',
      display_name: overrides.display_name || 'Test Region',
      description: overrides.description || 'A test region'
    }
  });
};

/**
 * Create test regional criteria
 */
export const createTestRegionalCriteria = async (
  regionId: number,
  criteriaId: number,
  overrides: {
    min_val?: number;
    max_val?: number;
    default_min_val?: number;
    default_max_val?: number;
  } = {}
) => {
  return await prisma.regionalCriteria.create({
    data: {
      region_id: regionId,
      criteria_id: criteriaId,
      min_val: overrides.min_val || 0,
      max_val: overrides.max_val || 100,
      default_min_val: overrides.default_min_val || 10,
      default_max_val: overrides.default_max_val || 90
    }
  });
};

/**
 * Create a complete job with assignment and result for cache testing
 */
export const createCompletedJobWithCache = async (
  userId: number,
  inputPayload: any = { id: 12345 }
) => {
  // Create job
  const job = await createTestJob(userId, JobType.TEST, JobStatus.SUCCEEDED, inputPayload);

  // Create assignment
  const assignment = await createTestJobAssignment(job.id, {
    completed_at: new Date()
  });

  // Create result
  const result = await createTestJobResult(assignment.id, job.id);

  return { job, assignment, result };
};
