import { JobStatus, JobType, prisma } from '@reefguide/db';
import app from '../src/apiSetup';
import { JobService } from '../src/services/jobs';
import { createTestJob, createTestJobAssignment } from './utils/testData';
import { authRequest, clearDbs, user1Id, userSetup } from './utils/testSetup';

describe('Cache Management', () => {
  let successfulJobId: number;
  let successfulAssignmentId: number;

  beforeEach(async () => {
    await clearDbs();
    await userSetup();

    // Create completed job with cached results
    const job = await createTestJob(user1Id, 'TEST', 'SUCCEEDED', { id: 12345 });
    successfulJobId = job.id;

    const assignment = await createTestJobAssignment(successfulJobId);
    successfulAssignmentId = assignment.id;

    await prisma.jobResult.create({
      data: {
        assignment_id: successfulAssignmentId,
        job_id: successfulJobId,
        result_payload: { success: true },
        storage_scheme: 'S3',
        storage_uri: 's3://test-bucket/success-path',
        cache_valid: true
      }
    });
  });

  describe('POST /api/jobs/invalidate-cache', () => {
    it('should invalidate cache for specific job type (admin)', async () => {
      const res = await authRequest(app, 'admin')
        .post('/api/jobs/invalidate-cache')
        .send({
          jobType: JobType.TEST
        })
        .expect(200);

      expect(res.body.message).toContain('Cache invalidated for job type TEST');
      expect(res.body.invalidated.jobType).toBe('TEST');
      expect(res.body.invalidated.affectedResults).toBe(1);

      // Verify the job result was marked as invalid
      const jobResult = await prisma.jobResult.findFirst({
        where: { job_id: successfulJobId }
      });
      expect(jobResult?.cache_valid).toBe(false);
    });

    it('should return 0 affected results for job type with no cached results', async () => {
      const res = await authRequest(app, 'admin')
        .post('/api/jobs/invalidate-cache')
        .send({
          jobType: JobType.SUITABILITY_ASSESSMENT
        })
        .expect(200);

      expect(res.body.message).toContain('Cache invalidated for job type SUITABILITY_ASSESSMENT');
      expect(res.body.invalidated.affectedResults).toBe(0);
    });

    it('should return 401 for non-admin users', async () => {
      await authRequest(app, 'user1')
        .post('/api/jobs/invalidate-cache')
        .send({
          jobType: JobType.TEST
        })
        .expect(401);
    });

    it('should return 400 for invalid job type', async () => {
      await authRequest(app, 'admin')
        .post('/api/jobs/invalidate-cache')
        .send({
          jobType: 'INVALID_JOB_TYPE'
        })
        .expect(400);
    });

    it('should only invalidate results that are currently valid', async () => {
      // Create another job result that's already invalid
      const job2 = await prisma.job.create({
        data: {
          type: JobType.TEST,
          status: JobStatus.SUCCEEDED,
          user_id: user1Id,
          input_payload: { id: 67890 },
          hash: await new JobService().generateJobHash({
            payload: { id: 67890 },
            jobType: 'TEST'
          })
        }
      });

      const assignment2 = await prisma.jobAssignment.create({
        data: {
          job_id: job2.id,
          ecs_task_arn: 'arn:aws:ecs:test:2',
          ecs_cluster_arn: 'arn:aws:ecs:cluster:test:2',
          expires_at: new Date(Date.now() + 3600000),
          storage_scheme: 'S3',
          storage_uri: 's3://test-bucket/path2',
          completed_at: new Date()
        }
      });

      await prisma.jobResult.create({
        data: {
          assignment_id: assignment2.id,
          job_id: job2.id,
          result_payload: { success: true },
          storage_scheme: 'S3',
          storage_uri: 's3://test-bucket/path2',
          cache_valid: false // Already invalid
        }
      });

      const res = await authRequest(app, 'admin')
        .post('/api/jobs/invalidate-cache')
        .send({
          jobType: JobType.TEST
        })
        .expect(200);

      // Should only affect 1 result (the valid one), not the already invalid one
      expect(res.body.invalidated.affectedResults).toBe(1);
    });
  });
});
