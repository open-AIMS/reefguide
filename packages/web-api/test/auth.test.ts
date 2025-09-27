import { prisma, UserAction } from '@reefguide/db';
import { ListUserLogsResponse } from '@reefguide/types';
import request from 'supertest';
import app from '../src/apiSetup';
import { signJwt } from '../src/auth/jwtUtils';
import { encodeRefreshToken } from '../src/auth/utils';
import { authRequest, clearDbs, user1Email, userSetup } from './utils/testSetup';

describe('Authentication', () => {
  beforeEach(async () => {
    await clearDbs();
    await userSetup();
  });

  afterAll(async () => {
    await clearDbs();
  });

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
