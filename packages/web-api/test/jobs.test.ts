import { JobStatus, JobType, prisma } from '@reefguide/db';
import { createJobResponseSchema } from '@reefguide/types';
import { randomInt } from 'crypto';
import app from '../src/apiSetup';
import { createTestJob, createTestJobAssignment } from './utils/testData';
import { authRequest, clearDbs, user1Id, userSetup } from './utils/testSetup';

describe('Job System', () => {
  let jobId: number;
  let assignmentId: number;

  beforeEach(async () => {
    await clearDbs();
    await userSetup();

    const job = await createTestJob(user1Id);
    jobId = job.id;

    const assignment = await createTestJobAssignment(jobId);
    assignmentId = assignment.id;
  });

  // Cleanup after all tests
  afterAll(async () => {
    await clearDbs();
  });

  describe('Job Management', () => {
    describe('POST /api/jobs', () => {
      it('should create a new job for authenticated user', async () => {
        const res = await authRequest(app, 'user1')
          .post('/api/jobs')
          .send({
            type: JobType.TEST,
            inputPayload: {
              id: randomInt(10000)
            }
          })
          // This is cached
          .expect(200);

        expect(res.body).toHaveProperty('jobId');
      });

      it('should return 400 for invalid job type', async () => {
        await authRequest(app, 'user1')
          .post('/api/jobs')
          .send({
            type: 'INVALID_TYPE',
            inputPayload: {
              id: randomInt(10000)
            }
          })
          .expect(400);
      });

      it('should return 400 for invalid input payload schema', async () => {
        await authRequest(app, 'user1')
          .post('/api/jobs')
          .send({
            type: JobType.TEST,
            inputPayload: {
              invalidField: true
            }
          })
          .expect(400);
      });
    });

    describe('GET /api/jobs/poll', () => {
      it('should return available jobs', async () => {
        await authRequest(app, 'user1')
          .post('/api/jobs')
          .send({
            type: JobType.TEST,
            inputPayload: {
              id: randomInt(10000)
            }
          })
          .expect(200);

        const res = await authRequest(app, 'user1').get('/api/jobs/poll').expect(200);

        expect(res.body.jobs).toBeInstanceOf(Array);
        expect(res.body.jobs.length).toBeGreaterThan(0);
        expect(res.body.jobs[0]).toHaveProperty('status', JobStatus.PENDING);
      });

      it('should filter by job type', async () => {
        // TODO can't really test this properly yet! Only one type
        await authRequest(app, 'user1')
          .post('/api/jobs')
          .send({
            type: JobType.TEST,
            inputPayload: {
              id: randomInt(10000)
            }
          })
          .expect(200);

        const res = await authRequest(app, 'user1')
          .get('/api/jobs/poll')
          .query({ jobType: JobType.TEST })
          .expect(200);

        expect(res.body.jobs).toBeInstanceOf(Array);
        expect(res.body.jobs.every((job: any) => job.type === JobType.TEST)).toBe(true);
      });

      it('should not return jobs with valid assignments', async () => {
        // Update job status to IN_PROGRESS
        await prisma.job.update({
          where: { id: jobId },
          data: { status: JobStatus.IN_PROGRESS }
        });

        const res = await authRequest(app, 'user1').get('/api/jobs/poll').expect(200);
        expect(res.body.jobs.find((job: any) => job.id === jobId)).toBeUndefined();
      });
    });

    describe('POST /api/jobs/assign', () => {
      it('should assign a job to a worker', async () => {
        const newJob = await authRequest(app, 'user1')
          .post('/api/jobs')
          .send({
            type: JobType.TEST,
            inputPayload: {
              id: randomInt(10000)
            }
          })
          .expect(200);
        const parsedJob = createJobResponseSchema.parse(newJob.body);
        const res = await authRequest(app, 'user1')
          .post('/api/jobs/assign')
          .send({
            jobId: parsedJob.jobId,
            ecsTaskArn: 'arn:aws:ecs:test:new',
            ecsClusterArn: 'arn:aws:ecs:cluster:test:new'
          })
          .expect(200);

        expect(res.body.assignment).toHaveProperty('job_id', newJob.body.jobId);
        expect(res.body.assignment).toHaveProperty('storage_scheme', 'S3');
        expect(res.body.assignment).toHaveProperty('storage_uri');

        // Verify job status was updated
        const job = await prisma.job.findUnique({
          where: { id: newJob.body.jobId }
        });
        expect(job?.status).toBe(JobStatus.IN_PROGRESS);
      });

      it('should return 404 for non-existent job', async () => {
        await authRequest(app, 'user1')
          .post('/api/jobs/assign')
          .send({
            jobId: 9999,
            ecsTaskArn: 'arn:aws:ecs:test',
            ecsClusterArn: 'arn:aws:ecs:cluster:test'
          })
          .expect(404);
      });

      it('should return 400 for already assigned job', async () => {
        await prisma.job.update({
          where: { id: jobId },
          data: { status: JobStatus.IN_PROGRESS }
        });

        await authRequest(app, 'user1')
          .post('/api/jobs/assign')
          .send({
            jobId,
            ecsTaskArn: 'arn:aws:ecs:test',
            ecsClusterArn: 'arn:aws:ecs:cluster:test'
          })
          .expect(400);
      });
    });

    describe('POST /api/jobs/assignments/:id/result', () => {
      it('should submit successful job results', async () => {
        await authRequest(app, 'user1')
          .post(`/api/jobs/assignments/${assignmentId}/result`)
          .send({
            status: JobStatus.SUCCEEDED,
            resultPayload: {}
          })
          .expect(200);

        // Verify job was updated
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          include: {
            assignments: {
              include: { result: true }
            }
          }
        });
        expect(job?.status).toBe(JobStatus.SUCCEEDED);
        expect(job?.assignments[0].result).toBeTruthy();
      });

      it('should submit failed job results', async () => {
        await authRequest(app, 'user1')
          .post(`/api/jobs/assignments/${assignmentId}/result`)
          .send({
            status: JobStatus.FAILED,
            resultPayload: null
          })
          .expect(200);

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        expect(job?.status).toBe(JobStatus.FAILED);
      });

      it('should return 404 for non-existent assignment', async () => {
        await authRequest(app, 'user1')
          .post('/api/jobs/assignments/9999/result')
          .send({
            status: JobStatus.SUCCEEDED,
            resultPayload: {}
          })
          .expect(404);
      });

      it('should return 400 for invalid result payload schema', async () => {
        await authRequest(app, 'user1')
          .post(`/api/jobs/assignments/${assignmentId}/result`)
          .send({
            status: JobStatus.SUCCEEDED,
            resultPayload: {
              invalidField: true
            }
          })
          .expect(400);
      });
    });

    describe('GET /api/jobs/:id', () => {
      it('should return job details to job owner', async () => {
        const res = await authRequest(app, 'user1').get(`/api/jobs/${jobId}`).expect(200);

        expect(res.body.job).toHaveProperty('id', jobId);
        expect(res.body.job).toHaveProperty('assignments');
        expect(res.body.job.assignments).toBeInstanceOf(Array);
      });

      it('should return job details to admin', async () => {
        const res = await authRequest(app, 'admin').get(`/api/jobs/${jobId}`).expect(200);

        expect(res.body.job).toHaveProperty('id', jobId);
      });

      it('should return 200 if user is not the owner', async () => {
        await authRequest(app, 'user2').get(`/api/jobs/${jobId}`).expect(200);
      });

      it('should return 404 for non-existent job', async () => {
        await authRequest(app, 'user1').get('/api/jobs/9999').expect(404);
      });
    });

    describe('POST /api/jobs/:id/cancel', () => {
      it('should cancel a pending job', async () => {
        const res = await authRequest(app, 'user1').post(`/api/jobs/${jobId}/cancel`).expect(200);

        expect(res.body.job).toHaveProperty('status', JobStatus.CANCELLED);
      });

      it('should allow admin to cancel any job', async () => {
        const res = await authRequest(app, 'admin').post(`/api/jobs/${jobId}/cancel`).expect(200);

        expect(res.body.job).toHaveProperty('status', JobStatus.CANCELLED);
      });

      it('should return 401 if user is not the owner', async () => {
        await authRequest(app, 'user2').post(`/api/jobs/${jobId}/cancel`).expect(401);
      });

      it('should return 400 if job is already completed', async () => {
        await prisma.job.update({
          where: { id: jobId },
          data: { status: JobStatus.SUCCEEDED }
        });

        await authRequest(app, 'user1').post(`/api/jobs/${jobId}/cancel`).expect(400);
      });
    });
  });
});
