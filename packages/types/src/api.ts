import { z } from 'zod';
import { JobStatus, JobType, StorageScheme } from '@reefguide/db';

// API interfaces
export const jobAssignmentSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  job_id: z.number(),
  ecs_task_arn: z.string(),
  ecs_cluster_arn: z.string(),
  expires_at: z.date(),
  storage_scheme: z.nativeEnum(StorageScheme),
  storage_uri: z.string(),
  heartbeat_at: z.date().nullable(),
  completed_at: z.date().nullable()
});

export const jobRequestSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  user_id: z.number(),
  type: z.nativeEnum(JobType),
  input_payload: z.any(),
  cache_hit: z.boolean(),
  job_id: z.number()
});

export const jobResultSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  job_id: z.number(),
  assignment_id: z.number(),
  result_payload: z.any().nullable(),
  storage_scheme: z.nativeEnum(StorageScheme),
  storage_uri: z.string(),
  metadata: z.any().nullable()
});

export const jobDetailsSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  type: z.nativeEnum(JobType),
  status: z.nativeEnum(JobStatus),
  user_id: z.number(),
  input_payload: z.any()
});

export const listJobsSchema = z.object({
  status: z.nativeEnum(JobStatus).optional()
});
export const listJobsResponseSchema = z.object({
  jobs: z.array(jobDetailsSchema),
  total: z.number()
});

// Input/Output validation schemas
export const createJobSchema = z.object({
  type: z.nativeEnum(JobType),
  inputPayload: z.any()
});
export const createJobResponseSchema = z.object({
  jobId: z.number(),
  cached: z.boolean(),
  requestId: z.number()
});

export const pollJobsSchema = z.object({
  jobType: z.nativeEnum(JobType).optional()
});
export const pollJobsResponseSchema = z.object({
  jobs: z.array(jobDetailsSchema)
});

export const assignJobSchema = z.object({
  jobId: z.number(),
  ecsTaskArn: z.string(),
  ecsClusterArn: z.string()
});
export const assignJobResponseSchema = z.object({
  assignment: jobAssignmentSchema
});

export const submitResultSchema = z.object({
  status: z.nativeEnum(JobStatus),
  resultPayload: z.any().optional()
});

export const jobDetailsResponseSchema = z.object({
  job: jobDetailsSchema
});

const downloadResponseSchema = z.object({
  job: z.object({
    id: z.number(),
    type: z.nativeEnum(JobType),
    status: z.nativeEnum(JobStatus)
  }),
  files: z.record(z.string(), z.string())
});

// Type inferencing from schemas
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;
export type PollJobsResponse = z.infer<typeof pollJobsResponseSchema>;
export type AssignJobResponse = z.infer<typeof assignJobResponseSchema>;
export type JobDetailsResponse = z.infer<typeof jobDetailsResponseSchema>;
export type DownloadResponse = z.infer<typeof downloadResponseSchema>;
export type ListJobsResponse = z.infer<typeof listJobsResponseSchema>;
