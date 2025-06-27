import { JobStatus, JobType, prisma, UserAction } from '@reefguide/db';
import { createJobResponseSchema, ListUserLogsResponse } from '@reefguide/types';
import { randomInt } from 'crypto';
import { Express } from 'express';
import request from 'supertest';
import app from '../src/apiSetup';
import { signJwt } from '../src/auth/jwtUtils';
import { BASE_ROLES } from '../src/auth/routes';
import { decodeRefreshToken, encodeRefreshToken } from '../src/auth/utils';
import { InvalidRefreshTokenException } from '../src/exceptions';
import { JobService } from '../src/services/jobs';
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
  describe('Data Specification Management', () => {
    describe('POST /api/admin/data-specification-update', () => {
      it('should create a data specification update job', async () => {
        const res = await authRequest(app, 'admin')
          .post('/api/admin/data-specification-update')
          .expect(200);

        expect(res.body).toHaveProperty('jobId');
        expect(res.body).toHaveProperty('message');
        expect(res.body.message).toContain('Data specification update job created successfully');

        // Verify job was created
        const job = await prisma.job.findUnique({
          where: { id: res.body.jobId }
        });
        expect(job?.type).toBe(JobType.DATA_SPECIFICATION_UPDATE);
        expect(job?.status).toBe(JobStatus.PENDING);
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1').post('/api/admin/data-specification-update').expect(401);
      });
    });

    describe('POST /api/admin/data-specification', () => {
      it('should create new criteria and regions', async () => {
        const res = await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({
            regions: [
              {
                name: 'test_region',
                display_name: 'Test Region',
                description: 'A test region',
                criteria: [
                  {
                    name: 'depth',
                    display_title: 'Depth Range',
                    units: 'meters',
                    payload_prefix: 'depth',
                    min_val: -50,
                    max_val: -2,
                    default_min_val: -30,
                    default_max_val: -5
                  }
                ]
              }
            ]
          })
          .expect(200);

        expect(res.body.message).toContain('Data specification updated successfully');
        expect(res.body.updated.criteria_count).toBe(1);
        expect(res.body.updated.regions_count).toBe(1);
        expect(res.body.updated.regional_criteria_count).toBe(1);

        // Verify in database
        const region = await prisma.region.findUnique({
          where: { name: 'test_region' }
        });
        expect(region?.display_name).toBe('Test Region');

        const criteria = await prisma.criteria.findUnique({
          where: { name: 'depth' }
        });
        expect(criteria?.display_title).toBe('Depth Range');
      });

      it('should update existing criteria and regions', async () => {
        // Create initial data
        await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({
            regions: [
              {
                name: 'test_region',
                display_name: 'Original Name',
                criteria: [
                  {
                    name: 'depth',
                    display_title: 'Original Title',
                    units: 'meters',
                    payload_prefix: 'depth',
                    min_val: -40,
                    max_val: -3,
                    default_min_val: -25,
                    default_max_val: -10
                  }
                ]
              }
            ]
          })
          .expect(200);

        // Update the data
        await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({
            regions: [
              {
                name: 'test_region',
                display_name: 'Updated Name',
                criteria: [
                  {
                    name: 'depth',
                    display_title: 'Updated Title',
                    units: 'meters',
                    payload_prefix: 'depth',
                    min_val: -60,
                    max_val: -1,
                    default_min_val: -35,
                    default_max_val: -3
                  }
                ]
              }
            ]
          })
          .expect(200);

        // Verify updates
        const region = await prisma.region.findUnique({
          where: { name: 'test_region' }
        });
        expect(region?.display_name).toBe('Updated Name');

        const criteria = await prisma.criteria.findUnique({
          where: { name: 'depth' }
        });
        expect(criteria?.display_title).toBe('Updated Title');
      });

      it('should remove unused criteria and regions', async () => {
        // Create initial data with multiple items
        await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({
            regions: [
              {
                name: 'region1',
                display_name: 'Region 1',
                criteria: [
                  {
                    name: 'depth',
                    display_title: 'Depth',
                    units: 'meters',
                    payload_prefix: 'depth',
                    min_val: -50,
                    max_val: -2,
                    default_min_val: -30,
                    default_max_val: -5
                  }
                ]
              },
              {
                name: 'region2',
                display_name: 'Region 2',
                criteria: [
                  {
                    name: 'slope',
                    display_title: 'Slope',
                    units: 'degrees',
                    payload_prefix: 'slope',
                    min_val: 0,
                    max_val: 45,
                    default_min_val: 5,
                    default_max_val: 30
                  }
                ]
              }
            ]
          })
          .expect(200);

        // Update with only one region and criteria
        await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({
            regions: [
              {
                name: 'region1',
                display_name: 'Region 1 Only',
                criteria: [
                  {
                    name: 'depth',
                    display_title: 'Depth Only',
                    units: 'meters',
                    payload_prefix: 'depth',
                    min_val: -50,
                    max_val: -2,
                    default_min_val: -30,
                    default_max_val: -5
                  }
                ]
              }
            ]
          })
          .expect(200);

        // Verify removals
        const region2 = await prisma.region.findUnique({
          where: { name: 'region2' }
        });
        expect(region2).toBeNull();

        const slopeCriteria = await prisma.criteria.findUnique({
          where: { name: 'slope' }
        });
        expect(slopeCriteria).toBeNull();

        // Verify remaining data
        const region1 = await prisma.region.findUnique({
          where: { name: 'region1' }
        });
        expect(region1).toBeTruthy();
      });

      it('should handle empty specification (remove all)', async () => {
        // Create initial data
        await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({
            regions: [
              {
                name: 'test_region',
                display_name: 'Test Region',
                criteria: [
                  {
                    name: 'depth',
                    display_title: 'Depth',
                    units: 'meters',
                    payload_prefix: 'depth',
                    min_val: -50,
                    max_val: -2,
                    default_min_val: -30,
                    default_max_val: -5
                  }
                ]
              }
            ]
          })
          .expect(200);

        // Clear all data
        const res = await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({ regions: [] })
          .expect(200);

        expect(res.body.updated.criteria_count).toBe(0);
        expect(res.body.updated.regions_count).toBe(0);
        expect(res.body.updated.regional_criteria_count).toBe(0);

        // Verify database is empty
        const regionCount = await prisma.region.count();
        const criteriaCount = await prisma.criteria.count();
        const regionalCriteriaCount = await prisma.regionalCriteria.count();

        expect(regionCount).toBe(0);
        expect(criteriaCount).toBe(0);
        expect(regionalCriteriaCount).toBe(0);
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1')
          .post('/api/admin/data-specification')
          .send({ regions: [] })
          .expect(401);
      });
    });

    describe('GET /api/admin/criteria/:region/ranges', () => {
      beforeEach(async () => {
        // Setup test data
        await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({
            regions: [
              {
                name: 'test_region',
                display_name: 'Test Region',
                criteria: [
                  {
                    name: 'depth',
                    display_title: 'Depth Range',
                    display_subtitle: 'Water depth constraints',
                    units: 'meters',
                    min_tooltip: 'Minimum depth',
                    max_tooltip: 'Maximum depth',
                    payload_prefix: 'depth',
                    min_val: -50,
                    max_val: -2,
                    default_min_val: -30,
                    default_max_val: -5
                  },
                  {
                    name: 'slope',
                    display_title: 'Slope Range',
                    units: 'degrees',
                    payload_prefix: 'slope',
                    min_val: 0,
                    max_val: 45,
                    default_min_val: 5,
                    default_max_val: 30
                  }
                ]
              }
            ]
          })
          .expect(200);
      });

      it('should return criteria ranges for a region', async () => {
        const res = await authRequest(app, 'user1')
          .get('/api/admin/criteria/test_region/ranges')
          .expect(200);

        expect(res.body).toHaveProperty('depth');
        expect(res.body).toHaveProperty('slope');

        const depthCriteria = res.body.depth;
        expect(depthCriteria.id).toBe('depth');
        expect(depthCriteria.min_val).toBe(-50);
        expect(depthCriteria.max_val).toBe(-2);
        expect(depthCriteria.display_title).toBe('Depth Range');
        expect(depthCriteria.display_subtitle).toBe('Water depth constraints');
        expect(depthCriteria.units).toBe('meters');
        expect(depthCriteria.default_min_val).toBe(-30);
        expect(depthCriteria.default_max_val).toBe(-5);
        expect(depthCriteria.payload_property_prefix).toBe('depth');
      });

      it('should reflect updated criteria ranges', async () => {
        // Update the data
        await authRequest(app, 'admin')
          .post('/api/admin/data-specification')
          .send({
            regions: [
              {
                name: 'test_region',
                display_name: 'Test Region',
                criteria: [
                  {
                    name: 'depth',
                    display_title: 'Updated Depth Range',
                    units: 'meters',
                    payload_prefix: 'depth',
                    min_val: -100,
                    max_val: -1,
                    default_min_val: -50,
                    default_max_val: -3
                  }
                ]
              }
            ]
          })
          .expect(200);

        const res = await authRequest(app, 'user1')
          .get('/api/admin/criteria/test_region/ranges')
          .expect(200);

        expect(res.body.depth.min_val).toBe(-100);
        expect(res.body.depth.max_val).toBe(-1);
        expect(res.body.depth.display_title).toBe('Updated Depth Range');
        expect(res.body.depth.default_min_val).toBe(-50);
        expect(res.body.depth.default_max_val).toBe(-3);

        // Slope should be removed
        expect(res.body.slope).toBeUndefined();
      });

      it('should return 404 for non-existent region', async () => {
        await authRequest(app, 'user1')
          .get('/api/admin/criteria/nonexistent_region/ranges')
          .expect(404);
      });
    });
  });

  describe('Pre-Approved Users', () => {
    let preApprovedUserId: number;

    beforeEach(async () => {
      // Create a test pre-approved user
      const preApproved = await prisma.preApprovedUser.create({
        data: {
          email: 'preapproved@example.com',
          roles: ['ADMIN'],
          created_by_user_id: user1Id
        }
      });
      preApprovedUserId = preApproved.id;
    });

    describe('POST /api/auth/admin/pre-approved-users', () => {
      it('should create a new pre-approved user', async () => {
        const res = await authRequest(app, 'admin')
          .post('/api/auth/admin/pre-approved-users')
          .send({
            email: 'newpreapproved@example.com',
            roles: ['ADMIN']
          })
          .expect(201);

        expect(res.body.preApprovedUser).toHaveProperty('email', 'newpreapproved@example.com');
        expect(res.body.preApprovedUser.roles).toEqual(['ADMIN']);
        expect(res.body.preApprovedUser).toHaveProperty('used', false);
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1')
          .post('/api/auth/admin/pre-approved-users')
          .send({
            email: 'test@example.com',
            roles: ['ADMIN']
          })
          .expect(401);
      });

      it('should return 400 for duplicate email', async () => {
        await authRequest(app, 'admin')
          .post('/api/auth/admin/pre-approved-users')
          .send({
            email: 'preapproved@example.com',
            roles: ['ADMIN']
          })
          .expect(400);
      });

      it('should return 400 for invalid input', async () => {
        await authRequest(app, 'admin')
          .post('/api/auth/admin/pre-approved-users')
          .send({
            email: 'invalid-email',
            roles: []
          })
          .expect(400);
      });
    });

    describe('POST /api/auth/admin/pre-approved-users/bulk', () => {
      it('should bulk create pre-approved users', async () => {
        const res = await authRequest(app, 'admin')
          .post('/api/auth/admin/pre-approved-users/bulk')
          .send({
            users: [
              { email: 'bulk1@example.com', roles: ['ADMIN'] },
              { email: 'bulk2@example.com', roles: ['ADMIN'] }
            ]
          })
          .expect(201);

        expect(res.body.created).toHaveLength(2);
        expect(res.body.errors).toHaveLength(0);
        expect(res.body.summary.totalCreated).toBe(2);
      });

      it('should handle partial failures in bulk creation', async () => {
        const res = await authRequest(app, 'admin')
          .post('/api/auth/admin/pre-approved-users/bulk')
          .send({
            users: [
              { email: 'valid@example.com', roles: ['ADMIN'] },
              { email: 'preapproved@example.com', roles: ['ADMIN'] } // Duplicate
            ]
          })
          .expect(201);

        expect(res.body.created).toHaveLength(1);
        expect(res.body.errors).toHaveLength(1);
        expect(res.body.summary.totalCreated).toBe(1);
        expect(res.body.summary.totalErrors).toBe(1);
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1')
          .post('/api/auth/admin/pre-approved-users/bulk')
          .send({
            users: [{ email: 'test@example.com', roles: ['ADMIN'] }]
          })
          .expect(401);
      });
    });

    describe('GET /api/auth/admin/pre-approved-users', () => {
      it('should return all pre-approved users', async () => {
        const res = await authRequest(app, 'admin')
          .get('/api/auth/admin/pre-approved-users')
          .expect(200);

        expect(res.body.preApprovedUsers).toBeInstanceOf(Array);
        expect(res.body.preApprovedUsers.length).toBeGreaterThan(0);
        expect(res.body.pagination).toHaveProperty('total');
      });

      it('should filter by used status', async () => {
        const res = await authRequest(app, 'admin')
          .get('/api/auth/admin/pre-approved-users')
          .query({ used: 'false' })
          .expect(200);

        expect(res.body.preApprovedUsers.every((user: any) => !user.used)).toBe(true);
      });

      it('should filter by email', async () => {
        const res = await authRequest(app, 'admin')
          .get('/api/auth/admin/pre-approved-users')
          .query({ email: 'preapproved' })
          .expect(200);

        expect(res.body.preApprovedUsers.length).toBeGreaterThan(0);
        expect(res.body.preApprovedUsers[0].email).toContain('preapproved');
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1').get('/api/auth/admin/pre-approved-users').expect(401);
      });
    });

    describe('GET /api/auth/admin/pre-approved-users/:id', () => {
      it('should return a specific pre-approved user', async () => {
        const res = await authRequest(app, 'admin')
          .get(`/api/auth/admin/pre-approved-users/${preApprovedUserId}`)
          .expect(200);

        expect(res.body.preApprovedUser).toHaveProperty('id', preApprovedUserId);
        expect(res.body.preApprovedUser).toHaveProperty('email', 'preapproved@example.com');
      });

      it('should return 404 for non-existent pre-approved user', async () => {
        await authRequest(app, 'admin').get('/api/auth/admin/pre-approved-users/9999').expect(404);
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1')
          .get(`/api/auth/admin/pre-approved-users/${preApprovedUserId}`)
          .expect(401);
      });
    });

    describe('PUT /api/auth/admin/pre-approved-users/:id', () => {
      it('should update a pre-approved user', async () => {
        const res = await authRequest(app, 'admin')
          .put(`/api/auth/admin/pre-approved-users/${preApprovedUserId}`)
          .send({
            email: 'updated@example.com'
          })
          .expect(200);

        expect(res.body.preApprovedUser).toHaveProperty('email', 'updated@example.com');
      });

      it('should return 404 for non-existent pre-approved user', async () => {
        await authRequest(app, 'admin')
          .put('/api/auth/admin/pre-approved-users/9999')
          .send({ email: 'test@example.com' })
          .expect(404);
      });

      it('should return 400 for used pre-approval', async () => {
        // Mark as used
        await prisma.preApprovedUser.update({
          where: { id: preApprovedUserId },
          data: { used: true, used_at: new Date() }
        });

        await authRequest(app, 'admin')
          .put(`/api/auth/admin/pre-approved-users/${preApprovedUserId}`)
          .send({ email: 'test@example.com' })
          .expect(400);
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1')
          .put(`/api/auth/admin/pre-approved-users/${preApprovedUserId}`)
          .send({ email: 'test@example.com' })
          .expect(401);
      });
    });

    describe('DELETE /api/auth/admin/pre-approved-users/:id', () => {
      it('should delete a pre-approved user', async () => {
        await authRequest(app, 'admin')
          .delete(`/api/auth/admin/pre-approved-users/${preApprovedUserId}`)
          .expect(200);

        // Verify deletion
        const deleted = await prisma.preApprovedUser.findUnique({
          where: { id: preApprovedUserId }
        });
        expect(deleted).toBeNull();
      });

      it('should return 404 for non-existent pre-approved user', async () => {
        await authRequest(app, 'admin')
          .delete('/api/auth/admin/pre-approved-users/9999')
          .expect(404);
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1')
          .delete(`/api/auth/admin/pre-approved-users/${preApprovedUserId}`)
          .expect(401);
      });
    });

    describe('POST /api/auth/admin/pre-approved-users/cleanup', () => {
      it('should cleanup old used pre-approvals', async () => {
        // Create an old used pre-approval
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 35); // 35 days ago

        await prisma.preApprovedUser.create({
          data: {
            email: 'old@example.com',
            roles: ['ADMIN'],
            used: true,
            used_at: oldDate
          }
        });

        const res = await authRequest(app, 'admin')
          .post('/api/auth/admin/pre-approved-users/cleanup')
          .send({ olderThanDays: 30 })
          .expect(200);

        expect(res.body.deletedCount).toBe(1);
      });

      it('should return 401 for non-admin users', async () => {
        await authRequest(app, 'user1')
          .post('/api/auth/admin/pre-approved-users/cleanup')
          .send({ olderThanDays: 30 })
          .expect(401);
      });
    });
  });
  describe('Registration with Pre-Approvals', () => {
    beforeEach(async () => {
      // Create test pre-approved users
      await prisma.preApprovedUser.createMany({
        data: [
          {
            email: 'admin-preapproved@example.com',
            roles: ['ADMIN'],
            created_by_user_id: user1Id
          },
          {
            email: 'used-preapproved@example.com',
            roles: ['ADMIN'],
            used: true,
            used_at: new Date(),
            created_by_user_id: user1Id
          }
        ]
      });
    });

    it('should register user with pre-approved roles', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin-preapproved@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(res.body).toHaveProperty('userId');

      // Verify user was created with correct roles
      const user = await prisma.user.findUnique({
        where: { id: res.body.userId }
      });
      expect(user?.roles).toEqual(['ADMIN'].concat(BASE_ROLES));
      expect(user?.email).toBe('admin-preapproved@example.com');

      // Verify pre-approval was marked as used
      const preApproval = await prisma.preApprovedUser.findUnique({
        where: { email: 'admin-preapproved@example.com' }
      });
      expect(preApproval?.used).toBe(true);
      expect(preApproval?.used_at).toBeTruthy();
    });

    it('should register user without pre-approval with base roles', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'regular-user@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(res.body).toHaveProperty('userId');

      // Verify user was created with base roles
      const user = await prisma.user.findUnique({
        where: { id: res.body.userId }
      });
      expect(user?.roles).toEqual(BASE_ROLES);
      expect(user?.email).toBe('regular-user@example.com');
    });

    it('should fail registration if pre-approval already used', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'used-preapproved@example.com',
          password: 'password123'
        })
        .expect(400);

      // Verify no user was created
      const user = await prisma.user.findUnique({
        where: { email: 'used-preapproved@example.com' }
      });
      expect(user).toBeNull();
    });

    it('should handle transaction rollback if user creation fails', async () => {
      // Create a user with the same email first to cause conflict
      await prisma.user.create({
        data: {
          email: 'admin-preapproved@example.com',
          password: 'hashedpassword',
          roles: []
        }
      });

      // Try to register with pre-approved email (should fail due to duplicate email)
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin-preapproved@example.com',
          password: 'password123'
        })
        .expect(400);

      // Verify pre-approval was NOT marked as used (transaction rolled back)
      const preApproval = await prisma.preApprovedUser.findUnique({
        where: { email: 'admin-preapproved@example.com' }
      });
      expect(preApproval?.used).toBe(false);
      expect(preApproval?.used_at).toBeNull();
    });

    it('should login with pre-approved user after registration', async () => {
      // Register the pre-approved user
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin-preapproved@example.com',
          password: 'password123'
        })
        .expect(200);

      // Login with the same credentials
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin-preapproved@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(loginRes.body).toHaveProperty('token');
      expect(loginRes.body).toHaveProperty('refreshToken');

      // Verify profile includes correct roles
      const profileRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .expect(200);

      expect(profileRes.body.user.roles).toEqual(['ADMIN'].concat(BASE_ROLES));
      expect(profileRes.body.user.email).toBe('admin-preapproved@example.com');
    });

    it('should combine base roles with pre-approved roles (if base roles exist)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin-preapproved@example.com',
          password: 'password123'
        })
        .expect(200);

      const user = await prisma.user.findUnique({
        where: { id: res.body.userId }
      });

      // Should have base roles and ADMIN
      expect(user?.roles).toEqual(['ADMIN'].concat(BASE_ROLES));
    });

    it('should handle case-insensitive email matching for pre-approvals', async () => {
      // Create pre-approval with lowercase email
      await prisma.preApprovedUser.create({
        data: {
          email: 'case-test@example.com',
          roles: ['ADMIN'],
          created_by_user_id: user1Id
        }
      });

      // Register with different case
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'Case-Test@Example.COM',
          password: 'password123'
        })
        .expect(200);

      // Verify user was created with pre-approved roles
      const user = await prisma.user.findUnique({
        where: { id: res.body.userId }
      });
      expect(user?.roles).toEqual(['ADMIN'].concat(BASE_ROLES));

      // Verify pre-approval was marked as used
      const preApproval = await prisma.preApprovedUser.findUnique({
        where: { email: 'case-test@example.com' }
      });
      expect(preApproval?.used).toBe(true);
    });
  });
});
