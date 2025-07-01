import { JobStatus, JobType } from '@reefguide/db';
import {
  AssignJobResponse,
  assignJobSchema,
  createJobResponseSchema,
  createJobSchema,
  JobDetailsResponse,
  ListJobsResponse,
  listJobsSchema,
  PollJobsResponse,
  pollJobsSchema,
  submitResultSchema
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { z } from 'zod';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import { assertUserHasRoleMiddleware, userIsAdmin } from '../auth/utils';
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
      config.disableCache
    );

    res.status(200).json({
      jobId: job.id,
      cached,
      requestId: jobRequest.id
    });
  }
);

router.get(
  '/',
  processRequest({
    query: listJobsSchema
  }),
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<ListJobsResponse>) => {
    if (!req.user) throw new UnauthorizedException();

    const isAdmin = userIsAdmin(req.user);
    const userId = isAdmin ? undefined : req.user.id;
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
  async (req, res: Response<JobDetailsResponse>) => {
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
      expirySeconds: z.string().optional()
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
      expirySeconds
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
