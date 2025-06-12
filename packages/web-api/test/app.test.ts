import { JobStatus, JobType, prisma, UserAction } from '@reefguide/db';
import { createJobResponseSchema } from '@reefguide/types';
import { randomInt } from 'crypto';
import { Express } from 'express';
import request from 'supertest';
import app from '../src/apiSetup';
import { signJwt } from '../src/auth/jwtUtils';
import { decodeRefreshToken, encodeRefreshToken } from '../src/auth/utils';
import { InvalidRefreshTokenException } from '../src/exceptions';
import { JobService } from '../src/services/jobs';
import { ListUserLogsResponse } from '../src/users/routes';
import { adminToken, clearDbs, user1Email, user1Token, user2Token, userSetup } from './utils';

afterAll(async () => {
  // clear when finished
  await clearDbs();
});

type TokenType = 'user1' | 'user2' | 'admin';

// Utility function to make authenticated requests
const authRequest = (app: Express, tokenType: TokenType = 'user1') => {
  const token =
    tokenType === 'user2' ? user2Token : tokenType === 'admin' ? adminToken : user1Token;

  return {
    get: (url: string) =>
      request(app)
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json'),

    post: (url: string) =>
      request(app)
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json'),

    put: (url: string) =>
      request(app)
        .put(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json'),

    delete: (url: string) =>
      request(app)
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
  };
};

describe('API', () => {
  let user1Id: number;
  let polygonId: number;
  let noteId: number;

  beforeEach(async () => {
    await clearDbs();
    await userSetup();

    // Get user1's ID
    const user1 = await prisma.user.findUnique({
      where: { email: user1Email }
    });
    user1Id = user1!.id;

    // Create a polygon for user1
    const polygon = await prisma.polygon.create({
      data: {
        polygon: JSON.stringify({ type: 'Polygon', coordinates: [[]] }),
        user_id: user1Id
      }
    });
    polygonId = polygon.id;

    // Create a note for the polygon
    const note = await prisma.polygonNote.create({
      data: {
        content: 'Test note',
        polygon_id: polygonId,
        user_id: user1Id
      }
    });
    noteId = note.id;
  });

  afterAll(async () => {
    await clearDbs();
  });

  describe('Routes', () => {
    describe('Health Check', () => {
      it('should return 200 for unauthenticated request', async () => {
        await request(app).get('/api').expect(200);
      });

      it('should return 200 for authenticated request', async () => {
        await authRequest(app, 'user1').get('/api').expect(200);
      });
    });

    describe('Authentication', () => {
      describe('POST /api/auth/register', () => {
        it('should register a new user', async () => {
          const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'newuser@example.com', password: 'password123' })
            .expect(200);

          expect(res.body).toHaveProperty('userId');
        });

        it('should return 400 for invalid input', async () => {
          await request(app)
            .post('/api/auth/register')
            .send({ email: 'invalidemail', password: 'short' })
            .expect(400);
        });

        it('should return 400 for existing email', async () => {
          await request(app)
            .post('/api/auth/register')
            .send({ email: user1Email, password: 'password123' })
            .expect(400);
        });
      });

      describe('POST /api/auth/login', () => {
        it('should login an existing user', async () => {
          const res = await request(app)
            .post('/api/auth/login')
            .send({ email: user1Email, password: 'password123' })
            .expect(200);
          expect(res.body).toHaveProperty('token');
          expect(res.body).toHaveProperty('refreshToken');
        });

        it('should return 401 for invalid credentials', async () => {
          await request(app)
            .post('/api/auth/login')
            .send({ email: user1Email, password: 'wrongpassword' })
            .expect(401);
        });

        it('should return 401 for non-existent user', async () => {
          await request(app)
            .post('/api/auth/login')
            .send({ email: 'nonexistent@example.com', password: 'password123' })
            .expect(401);
        });
      });

      describe('POST /api/auth/token', () => {
        it('should issue a new token with a valid refresh token', async () => {
          // Create a valid refresh token for testing
          const user = await prisma.user.findUniqueOrThrow({
            where: { email: user1Email }
          });

          const refreshTokenRecord = await prisma.refreshToken.create({
            data: {
              user_id: user.id,
              token: 'valid-refresh-token',
              expiry_time: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
              valid: true
            }
          });

          const validRefreshToken = encodeRefreshToken({
            id: refreshTokenRecord.id,
            token: refreshTokenRecord.token
          });

          let res = await request(app)
            .post('/api/auth/token')
            .send({ refreshToken: validRefreshToken })
            .expect(200);
          expect(res.body).toHaveProperty('token');

          // Check the new token works
          const newToken = res.body.token as string;
          res = await request(app)
            .get('/api/auth/profile')
            .set('Authorization', `Bearer ${newToken}`)
            .expect(200);

          expect(res.body.user).toHaveProperty('email', user1Email);
        });

        it('should return 401 for an invalid refresh token', async () => {
          await request(app)
            .post('/api/auth/token')
            .send({ refreshToken: 'invalid-refresh-token' })
            .expect(401);
        });

        it('should return 401 for an expired refresh token', async () => {
          const user = await prisma.user.findUnique({
            where: { email: user1Email }
          });
          if (user) {
            const expiredToken = await prisma.refreshToken.create({
              data: {
                user_id: user.id,
                token: 'expired-token',
                expiry_time: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
                valid: true
              }
            });
            const expiredRefreshToken = encodeRefreshToken({
              id: expiredToken.id,
              token: expiredToken.token
            });

            await request(app)
              .post('/api/auth/token')
              .send({ refreshToken: expiredRefreshToken })
              .expect(401);
          }
        });
      });

      describe('GET /api/auth/profile', () => {
        it('should return user profile for authenticated user', async () => {
          const res = await authRequest(app, 'user1').get('/api/auth/profile').expect(200);

          expect(res.body.user).toHaveProperty('email', user1Email);
        });

        it('should return 401 for unauthenticated request', async () => {
          await request(app).get('/api/auth/profile').expect(401);
        });

        it('should return 401 for expired token', async () => {
          const user = await prisma.user.findUnique({
            where: { email: user1Email }
          });
          if (user) {
            const expiredToken = signJwt(
              { id: user.id, email: user.email, roles: user.roles },
              { expiresIn: -60 } // Expired 1 minute ago
            );
            await request(app)
              .get('/api/auth/profile')
              .set('Authorization', `Bearer ${expiredToken}`)
              .expect(401);
          }
        });
      });

      describe('GET /api/auth/utils/log', () => {
        it('should return logs for logins and creations for user', async () => {
          let log;
          let res;
          res = await authRequest(app, 'admin').get('/api/users/utils/log').expect(200);
          log = res.body as ListUserLogsResponse;
          console.log(log);
          expect(log.logs.length).toEqual(0);

          // Now register a fake user
          const email = 'fake@fake.com';
          let password = 'jsklfdjklsjdjsklfjdkls';
          res = await request(app).post('/api/auth/register').send({ email, password }).expect(200);
          expect(res.body).toHaveProperty('userId');
          const userId: number = res.body.userId;

          // Now login
          res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);

          // Check the log looks good
          res = await authRequest(app, 'admin').get('/api/users/utils/log').expect(200);
          log = res.body as ListUserLogsResponse;
          expect(log.logs.length).toEqual(1);
          expect(log.logs[0].user.email).toEqual(email);
          expect(log.logs[0].action).toEqual(UserAction.LOGIN);

          // update password
          password = 'updateljkldsfdjskl';
          res = await authRequest(app, 'admin')
            .put(`/api/users/${userId}/password`)
            .send({ password })
            .expect(200);

          // Check the log looks good
          res = await authRequest(app, 'admin').get('/api/users/utils/log').expect(200);
          log = res.body as ListUserLogsResponse;
          expect(log.logs.length).toEqual(2);
          // latest first
          expect(log.logs[0].user.id).toEqual(userId);
          expect(log.logs[0].user.email).toEqual(email);
          expect(log.logs[0].action).toEqual(UserAction.CHANGE_PASSWORD);
          // older second
          expect(log.logs[1].user.id).toEqual(userId);
          expect(log.logs[1].user.email).toEqual(email);
          expect(log.logs[1].action).toEqual(UserAction.LOGIN);

          // Now login again
          res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);

          // Check the log looks good
          res = await authRequest(app, 'admin').get('/api/users/utils/log').expect(200);
          log = res.body as ListUserLogsResponse;
          expect(log.logs.length).toEqual(3);
          // latest first
          expect(log.logs[0].user.id).toEqual(userId);
          expect(log.logs[0].user.email).toEqual(email);
          expect(log.logs[0].action).toEqual(UserAction.LOGIN);
        });
      });
    });

    describe('Refresh Token Utilities', () => {
      it('should correctly encode and decode refresh tokens', () => {
        const originalToken = { id: 1, token: 'test-token' };
        const decodedToken = decodeRefreshToken(encodeRefreshToken(originalToken));
        expect(decodedToken).toEqual(originalToken);
      });

      it('should throw an error for invalid refresh token format', () => {
        const invalidToken = 'invalid-token-format';
        expect(() => decodeRefreshToken(invalidToken)).toThrow(InvalidRefreshTokenException);
      });
    });

    describe('Polygons', () => {
      describe('GET /api/polygons', () => {
        it('should return all polygons for admin', async () => {
          const res = await authRequest(app, 'admin').get('/api/polygons').expect(200);

          expect(res.body.polygons).toBeInstanceOf(Array);
          expect(res.body.polygons.length).toBeGreaterThan(0);
        });

        it("should return only user's polygons for non-admin", async () => {
          const res = await authRequest(app, 'user1').get('/api/polygons').expect(200);

          expect(res.body.polygons).toBeInstanceOf(Array);
          expect(res.body.polygons.length).toBe(1);
        });

        it('should return empty array if user has no polygons', async () => {
          const res = await authRequest(app, 'user2').get('/api/polygons').expect(200);

          expect(res.body.polygons).toBeInstanceOf(Array);
          expect(res.body.polygons.length).toBe(0);
        });
      });

      describe('GET /api/polygons/:id', () => {
        it('should return a specific polygon for its owner', async () => {
          const res = await authRequest(app, 'user1').get(`/api/polygons/${polygonId}`).expect(200);

          expect(res.body.polygon).toHaveProperty('id', polygonId);
        });

        it('should return a specific polygon for admin', async () => {
          const res = await authRequest(app, 'admin').get(`/api/polygons/${polygonId}`).expect(200);

          expect(res.body.polygon).toHaveProperty('id', polygonId);
        });

        it('should return 401 if user is not the owner', async () => {
          await authRequest(app, 'user2').get(`/api/polygons/${polygonId}`).expect(401);
        });

        it('should return 404 for non-existent polygon', async () => {
          await authRequest(app, 'user1').get('/api/polygons/9999').expect(404);
        });
      });

      describe('POST /api/polygons', () => {
        it('should create a new polygon', async () => {
          const res = await authRequest(app, 'user1')
            .post('/api/polygons')
            .send({
              polygon: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 1],
                    [0, 0]
                  ]
                ]
              }
            })
            .expect(200);

          expect(res.body.polygon).toHaveProperty('id');
          expect(res.body.polygon).toHaveProperty('polygon');
        });

        it('should return 400 for invalid GeoJSON', async () => {
          await authRequest(app, 'user1')
            .post('/api/polygons')
            .send({ polygon: 'invalid' })
            .expect(400);
        });
      });

      describe('PUT /api/polygons/:id', () => {
        it('should update an existing polygon', async () => {
          const res = await authRequest(app, 'user1')
            .put(`/api/polygons/${polygonId}`)
            .send({
              polygon: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [2, 0],
                    [2, 2],
                    [0, 2],
                    [0, 0]
                  ]
                ]
              }
            })
            .expect(200);

          expect(res.body.polygon).toHaveProperty('id', polygonId);
          expect(
            res.body.polygon.polygon.coordinates[0].map((a: Array<number>) => a.toString())
          ).toContain([2, 2].toString());
        });

        it('should return 401 if user is not the owner', async () => {
          await authRequest(app, 'user2')
            .put(`/api/polygons/${polygonId}`)
            .send({
              polygon: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [2, 0],
                    [2, 2],
                    [0, 2],
                    [0, 0]
                  ]
                ]
              }
            })
            .expect(401);
        });

        it('should return 404 for non-existent polygon', async () => {
          await authRequest(app, 'user1')
            .put('/api/polygons/9999')
            .send({
              polygon: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [2, 0],
                    [2, 2],
                    [0, 2],
                    [0, 0]
                  ]
                ]
              }
            })
            .expect(404);
        });
      });

      describe('DELETE /api/polygons/:id', () => {
        it('should delete an existing polygon', async () => {
          await authRequest(app, 'user1').delete(`/api/polygons/${polygonId}`).expect(204);

          // Verify the polygon is deleted
          await authRequest(app, 'user1').get(`/api/polygons/${polygonId}`).expect(404);
        });

        it('should return 401 if user is not the owner', async () => {
          await authRequest(app, 'user2').delete(`/api/polygons/${polygonId}`).expect(401);
        });

        it('should return 404 for non-existent polygon', async () => {
          await authRequest(app, 'user1').delete('/api/polygons/9999').expect(404);
        });
      });
    });

    describe('Notes', () => {
      describe('GET /api/notes', () => {
        it('should return all notes for admin', async () => {
          const res = await authRequest(app, 'admin').get('/api/notes').expect(200);

          expect(res.body.notes).toBeInstanceOf(Array);
          expect(res.body.notes.length).toBeGreaterThan(0);
        });

        it("should return only user's notes for non-admin", async () => {
          const res = await authRequest(app, 'user1').get('/api/notes').expect(200);

          expect(res.body.notes).toBeInstanceOf(Array);
          expect(res.body.notes.length).toBe(1);
        });

        it('should return empty array if user has no notes', async () => {
          const res = await authRequest(app, 'user2').get('/api/notes').expect(200);

          expect(res.body.notes).toBeInstanceOf(Array);
          expect(res.body.notes.length).toBe(0);
        });
      });

      describe('GET /api/notes/:id', () => {
        it('should return notes for a specific polygon (owner)', async () => {
          const res = await authRequest(app, 'user1').get(`/api/notes/${polygonId}`).expect(200);

          expect(res.body.notes).toBeInstanceOf(Array);
          expect(res.body.notes.length).toBe(1);
          expect(res.body.notes[0]).toHaveProperty('content', 'Test note');
        });

        it('should return notes for a specific polygon (admin)', async () => {
          const res = await authRequest(app, 'admin').get(`/api/notes/${polygonId}`).expect(200);

          expect(res.body.notes).toBeInstanceOf(Array);
          expect(res.body.notes.length).toBe(1);
        });

        it('should return 401 if user is not the owner', async () => {
          await authRequest(app, 'user2').get(`/api/notes/${polygonId}`).expect(401);
        });

        it('should return 404 for non-existent polygon', async () => {
          await authRequest(app, 'user1').get('/api/notes/9999').expect(404);
        });
      });

      describe('POST /api/notes', () => {
        it('should create a new note', async () => {
          const res = await authRequest(app, 'user1')
            .post('/api/notes')
            .send({
              content: 'New test note',
              polygonId: polygonId
            })
            .expect(200);

          expect(res.body.note).toHaveProperty('id');
          expect(res.body.note).toHaveProperty('content', 'New test note');
        });

        it('should return 400 for invalid input', async () => {
          await authRequest(app, 'user1')
            .post('/api/notes')
            .send({ polygonId: polygonId })
            .expect(400);
        });

        it("should return 401 if user doesn't own the polygon", async () => {
          await authRequest(app, 'user2')
            .post('/api/notes')
            .send({
              content: 'Unauthorized note',
              polygonId: polygonId
            })
            .expect(401);
        });
      });

      describe('PUT /api/notes/:id', () => {
        it('should update an existing note', async () => {
          const res = await authRequest(app, 'user1')
            .put(`/api/notes/${noteId}`)
            .send({ content: 'Updated test note' })
            .expect(200);

          expect(res.body.note).toHaveProperty('id', noteId);
          expect(res.body.note).toHaveProperty('content', 'Updated test note');
        });

        it('should return 401 if user is not the owner', async () => {
          await authRequest(app, 'user2')
            .put(`/api/notes/${noteId}`)
            .send({ content: 'Unauthorized update' })
            .expect(401);
        });

        it('should return 404 for non-existent note', async () => {
          await authRequest(app, 'user1')
            .put('/api/notes/9999')
            .send({ content: 'Non-existent note' })
            .expect(404);
        });
      });

      describe('DELETE /api/notes/:id', () => {
        it('should delete an existing note', async () => {
          await authRequest(app, 'user1').delete(`/api/notes/${noteId}`).expect(204);

          // Verify the note is deleted
          const notes = await prisma.polygonNote.findMany({
            where: { id: noteId }
          });
          expect(notes.length).toBe(0);
        });

        it('should return 401 if user is not the owner', async () => {
          await authRequest(app, 'user2').delete(`/api/notes/${noteId}`).expect(401);
        });

        it('should return 404 for non-existent note', async () => {
          await authRequest(app, 'user1').delete('/api/notes/9999').expect(404);
        });
      });
    });

    describe('Job System', () => {
      let user1Id: number;
      let jobId: number;
      let assignmentId: number;

      // Setup before each test
      beforeEach(async () => {
        // Get user1's ID
        const user1 = await prisma.user.findUnique({
          where: { email: user1Email }
        });
        user1Id = user1!.id;

        // Create a test job
        const job = await prisma.job.create({
          data: {
            type: JobType.TEST,
            status: JobStatus.PENDING,
            user_id: user1Id,
            input_payload: {},
            hash: await new JobService().generateJobHash({
              payload: {},
              jobType: 'TEST'
            })
          }
        });
        jobId = job.id;

        // Create a test assignment
        const assignment = await prisma.jobAssignment.create({
          data: {
            job_id: jobId,
            ecs_task_arn: 'arn:aws:ecs:test',
            ecs_cluster_arn: 'arn:aws:ecs:cluster:test',
            expires_at: new Date(Date.now() + 3600000), // 1 hour from now
            storage_scheme: 'S3',
            storage_uri: 's3://test-bucket/test-path'
          }
        });
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
            const res = await authRequest(app, 'user1')
              .post(`/api/jobs/${jobId}/cancel`)
              .expect(200);

            expect(res.body.job).toHaveProperty('status', JobStatus.CANCELLED);
          });

          it('should allow admin to cancel any job', async () => {
            const res = await authRequest(app, 'admin')
              .post(`/api/jobs/${jobId}/cancel`)
              .expect(200);

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
  });
});
