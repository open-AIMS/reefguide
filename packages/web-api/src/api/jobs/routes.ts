import express, { Response } from 'express';
import { z } from 'zod';
import { processRequest } from 'zod-express-middleware';
import { JobType, JobStatus, StorageScheme } from '@prisma/client';
import { passport } from '../auth/passportConfig';
import { JobService } from '../services/jobs';
import { userIsAdmin } from '../auth/utils';
import { BadRequestException, UnauthorizedException } from '../exceptions';
import { config } from '../config';
import { S3StorageService } from '../services/s3Storage';
require('express-async-errors');

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
  completed_at: z.date().nullable(),
});

export const jobRequestSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  user_id: z.number(),
  type: z.nativeEnum(JobType),
  input_payload: z.any(),
  cache_hit: z.boolean(),
  job_id: z.number(),
});

export const jobResultSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  job_id: z.number(),
  assignment_id: z.number(),
  result_payload: z.any().nullable(),
  storage_scheme: z.nativeEnum(StorageScheme),
  storage_uri: z.string(),
  metadata: z.any().nullable(),
});

export const jobDetailsSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  type: z.nativeEnum(JobType),
  status: z.nativeEnum(JobStatus),
  user_id: z.number(),
  input_payload: z.any(),
});

export const listJobsSchema = z.object({
  status: z.nativeEnum(JobStatus).optional(),
});
export const listJobsResponseSchema = z.object({
  jobs: z.array(jobDetailsSchema),
  total: z.number(),
});

export const router = express.Router();
const jobService = new JobService();

// Input/Output validation schemas
export const createJobSchema = z.object({
  type: z.nativeEnum(JobType),
  inputPayload: z.any(),
});
export const createJobResponseSchema = z.object({
  jobId: z.number(),
  cached: z.boolean(),
  requestId: z.number(),
});

export const pollJobsSchema = z.object({
  jobType: z.nativeEnum(JobType).optional(),
});
export const pollJobsResponseSchema = z.object({
  jobs: z.array(jobDetailsSchema),
});

export const assignJobSchema = z.object({
  jobId: z.number(),
  ecsTaskArn: z.string(),
  ecsClusterArn: z.string(),
});
export const assignJobResponseSchema = z.object({
  assignment: jobAssignmentSchema,
});

export const submitResultSchema = z.object({
  status: z.nativeEnum(JobStatus),
  resultPayload: z.any().optional(),
});

export const jobDetailsResponseSchema = z.object({
  job: jobDetailsSchema,
});

const downloadResponseSchema = z.object({
  job: z.object({
    id: z.number(),
    type: z.nativeEnum(JobType),
    status: z.nativeEnum(JobStatus),
  }),
  files: z.record(z.string(), z.string()),
});

// Type inferencing from schemas
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;
export type PollJobsResponse = z.infer<typeof pollJobsResponseSchema>;
export type AssignJobResponse = z.infer<typeof assignJobResponseSchema>;
export type JobDetailsResponse = z.infer<typeof jobDetailsResponseSchema>;
export type DownloadResponse = z.infer<typeof downloadResponseSchema>;
export type ListJobsResponse = z.infer<typeof listJobsResponseSchema>;

// Routes
router.post(
  '/',
  processRequest({
    body: createJobSchema,
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<z.infer<typeof createJobResponseSchema>>) => {
    if (!req.user) throw new UnauthorizedException();

    const { job, jobRequest, cached } = await jobService.createJobRequest(
      req.user.id,
      req.body.type,
      req.body.inputPayload,
    );

    res.status(200).json({
      jobId: job.id,
      cached,
      requestId: jobRequest.id,
    });
  },
);

router.get(
  '/',
  processRequest({
    query: listJobsSchema,
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<ListJobsResponse>) => {
    if (!req.user) throw new UnauthorizedException();

    const isAdmin = userIsAdmin(req.user);
    const userId = isAdmin ? undefined : req.user.id;
    const status = req.query.status as JobStatus | undefined;

    const { jobs, total } = await jobService.listJobs({
      userId,
      status,
    });

    res.json({ jobs, total });
  },
);

router.get(
  '/poll',
  processRequest({
    query: pollJobsSchema,
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<PollJobsResponse>) => {
    const jobs = await jobService.pollJobs(req.query.jobType as JobType);
    res.json({ jobs });
  },
);

router.post(
  '/assign',
  processRequest({
    body: assignJobSchema,
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<AssignJobResponse>) => {
    const assignment = await jobService.assignJob(
      req.body.jobId,
      req.body.ecsTaskArn,
      req.body.ecsClusterArn,
    );
    res.json({ assignment });
  },
);

router.get(
  '/requests',
  processRequest({}),
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    if (!req.user) throw new UnauthorizedException();

    // is the user an admin?
    const isAdmin = userIsAdmin(req.user);
    res.json({
      jobRequests: jobService.listRequests({
        // Only filter by user if not admin
        userId: !isAdmin ? req.user.id : undefined,
      }),
    });
  },
);

router.post(
  '/assignments/:id/result',
  processRequest({
    params: z.object({ id: z.string() }),
    body: submitResultSchema,
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<void>) => {
    const assignmentId = parseInt(req.params.id);
    await jobService.submitResult(
      assignmentId,
      req.body.status,
      req.body.resultPayload,
    );
    res.status(200).send();
  },
);

router.get(
  '/:id',
  processRequest({
    params: z.object({ id: z.string() }),
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<JobDetailsResponse>) => {
    if (!req.user) throw new UnauthorizedException();
    const jobId = parseInt(req.params.id);
    const job = await jobService.getJobDetails(jobId);
    res.json({ job });
  },
);

router.post(
  '/:id/cancel',
  processRequest({
    params: z.object({ id: z.string() }),
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<JobDetailsResponse>) => {
    if (!req.user) throw new UnauthorizedException();
    const jobId = parseInt(req.params.id);
    const job = await jobService.cancelJob(
      jobId,
      req.user.id,
      userIsAdmin(req.user),
    );
    res.json({ job });
  },
);

router.get(
  '/:id/download',
  processRequest({
    params: z.object({ id: z.string() }),
    query: z.object({
      expirySeconds: z.string().optional(),
    }),
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    if (!req.user) throw new UnauthorizedException();

    const jobId = parseInt(req.params.id);
    const expirySeconds = req.query.expirySeconds
      ? parseInt(req.query.expirySeconds)
      : config.s3.urlExpirySeconds;

    // Get job details with assignments and results
    const job = await jobService.getJobDetails(jobId);

    // Check if job has any results
    if (
      job.status !== JobStatus.SUCCEEDED ||
      !job.assignments.some(a => a.result)
    ) {
      throw new BadRequestException('Job has no results to download');
    }

    // Get the successful assignment
    const successfulAssignment = job.assignments.find(a => a.result);
    if (!successfulAssignment) {
      throw new BadRequestException('No successful assignment found');
    }

    // Get presigned URLs for all files in the result location
    const s3Service = new S3StorageService(config.s3.bucketName);
    const urlMap = await s3Service.getPresignedUrls(
      successfulAssignment.storage_uri,
      expirySeconds,
    );

    res.json({
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
      },
      files: urlMap,
    });
  },
);
