import { JobStatus, JobType } from '@reefguide/db';
import {
  AssignJobResponse,
  assignJobSchema,
  CancelJobResponse,
  createJobResponseSchema,
  createJobSchema,
  InvalidateCacheResponse,
  invalidateCacheSchema,
  JobDetailsResponse,
  ListJobsResponse,
  listJobsSchema,
  listMyJobsSchema,
  PollJobsResponse,
  pollJobsSchema,
  submitResultSchema
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { z } from 'zod';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import {
  assertUserHasRoleMiddleware,
  assertUserIsAdminMiddleware,
  userIsAdmin
} from '../auth/utils';
import { config } from '../config';
import { BadRequestException, UnauthorizedException } from '../exceptions';
import { JobService } from '../services/jobs';
import { getS3Service } from '../services/s3Storage';

require('express-async-errors');

export const router: Router = express.Router();
const jobService = new JobService();

// Routes
router.post(
  '/',
  processRequest({
    body: createJobSchema
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<z.infer<typeof createJobResponseSchema>>) => {
    if (!req.user) throw new UnauthorizedException();

    const { job, jobRequest, cached } = await jobService.createJobRequest(
      req.user.id,
      req.body.type,
      req.body.inputPayload,
      config.cacheOptions.disableCache,
      config.cacheOptions.disableSpecificCaches
    );

    res.status(200).json({
      jobId: job.id,
      cached,
      requestId: jobRequest.id
    });
  }
);

/**
 * List all jobs
 * - Admins can specify a userId to list jobs for that user
 * - Non-admins can only list their own jobs
 * - Can filter by status
 */
router.get(
  '/',
  processRequest({
    query: listJobsSchema
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<ListJobsResponse>) => {
    if (!req.user) throw new UnauthorizedException();

    // If the user is an admin, they can specify a userId to list jobs for that
    // user
    const customUserId = req.query.userId ? parseInt(req.query.userId) : undefined;
    const isAdmin = userIsAdmin(req.user);
    if (!isAdmin && customUserId !== undefined && customUserId !== req.user.id) {
      throw new UnauthorizedException(
        'Non-admin users cannot specify a userId other than their own.'
      );
    }
    const userId = customUserId ?? (isAdmin ? undefined : req.user.id);
    const status = req.query.status as JobStatus | undefined;

    const { jobs, total } = await jobService.listJobs({
      userId,
      status
    });

    res.json({ jobs, total });
  }
);

/**
 * List jobs for the authenticated user
 * - Can filter by status
 * - Only returns jobs created by the authenticated user
 */
router.get(
  '/mine',
  processRequest({
    query: listMyJobsSchema
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<ListJobsResponse>) => {
    if (!req.user) throw new UnauthorizedException();

    // Only list jobs for the authenticated user
    const userId = req.user.id;
    const status = req.query.status as JobStatus | undefined;

    const { jobs, total } = await jobService.listJobs({
      userId,
      status
    });

    res.json({ jobs, total });
  }
);

router.get(
  '/poll',
  processRequest({
    query: pollJobsSchema
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<PollJobsResponse>) => {
    const jobs = await jobService.pollJobs(req.query.jobType as JobType);
    res.json({ jobs });
  }
);

router.post(
  '/assign',
  processRequest({
    body: assignJobSchema
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<AssignJobResponse>) => {
    const assignment = await jobService.assignJob(
      req.body.jobId,
      req.body.ecsTaskArn,
      req.body.ecsClusterArn
    );
    res.json({ assignment });
  }
);

router.get(
  '/requests',
  processRequest({}),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res) => {
    if (!req.user) throw new UnauthorizedException();

    // is the user an admin?
    const isAdmin = userIsAdmin(req.user);
    res.json({
      jobRequests: jobService.listRequests({
        // Only filter by user if not admin
        userId: !isAdmin ? req.user.id : undefined
      })
    });
  }
);

router.post(
  '/assignments/:id/result',
  processRequest({
    params: z.object({ id: z.string() }),
    body: submitResultSchema
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<void>) => {
    const assignmentId = parseInt(req.params.id);
    await jobService.submitResult(assignmentId, req.body.status, req.body.resultPayload);
    res.status(200).send();
  }
);

router.get(
  '/:id',
  processRequest({
    params: z.object({ id: z.string() })
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<JobDetailsResponse>) => {
    if (!req.user) throw new UnauthorizedException();
    const jobId = parseInt(req.params.id);
    const job = await jobService.getJobDetails(jobId);
    res.json({ job });
  }
);

router.post(
  '/:id/cancel',
  processRequest({
    params: z.object({ id: z.string() })
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<CancelJobResponse>) => {
    if (!req.user) throw new UnauthorizedException();
    const jobId = parseInt(req.params.id);
    const job = await jobService.cancelJob(jobId, req.user.id, userIsAdmin(req.user));
    res.json({ job });
  }
);

router.get(
  '/:id/download',
  processRequest({
    params: z.object({ id: z.string() }),
    query: z.object({
      expirySeconds: z.string().optional(),
      filterPrefix: z.string().optional()
    })
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res) => {
    if (!req.user) throw new UnauthorizedException();

    const jobId = parseInt(req.params.id);
    const expirySeconds = req.query.expirySeconds
      ? parseInt(req.query.expirySeconds)
      : config.s3.urlExpirySeconds;

    // Get job details with assignments and results
    const job = await jobService.getJobDetails(jobId);

    // Check if job has any results
    if (job.status !== JobStatus.SUCCEEDED || !job.assignments.some(a => a.result)) {
      throw new BadRequestException('Job has no results to download');
    }

    // Get the successful assignment
    const successfulAssignment = job.assignments.find(a => a.result);
    if (!successfulAssignment) {
      throw new BadRequestException('No successful assignment found');
    }

    // Get presigned URLs for all files in the result location
    const s3Service = getS3Service();
    const urlMap = await s3Service.getPresignedUrls(
      successfulAssignment.storage_uri,
      expirySeconds,
      // If the user wishes to filter the
      req.query.filterPrefix
    );

    res.json({
      job: {
        id: job.id,
        type: job.type,
        status: job.status
      },
      files: urlMap
    });
  }
);
// Add this route to your jobs router (paste.txt)

router.post(
  '/invalidate-cache',
  processRequest({
    body: invalidateCacheSchema
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (req, res: Response<InvalidateCacheResponse>) => {
    if (!req.user) throw new UnauthorizedException();

    const { jobType } = req.body;
    const affectedResults = await jobService.invalidateCache(jobType);

    res.status(200).json({
      message: `Cache invalidated for job type ${jobType}`,
      invalidated: {
        jobType,
        affectedResults
      }
    });
  }
);
