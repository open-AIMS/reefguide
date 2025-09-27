import request from 'supertest';
import app from '../src/apiSetup';
import { authRequest, clearDbs, user1Email, userSetup } from './utils/testSetup';

describe('Password Change', () => {
  beforeEach(async () => {
    await clearDbs();
    await userSetup();
  });

  afterAll(async () => {
    await clearDbs();
  });

  it('should successfully change password with valid credentials', async () => {
    // verify old password works
    await request(app)
      .post('/api/auth/login')
      .send({ email: user1Email, password: 'password123' })
      .expect(200);

    // change
    await authRequest(app, 'user1')
      .post('/api/auth/change-password')
      .send({
        oldPassword: 'password123',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456'
      })
      .expect(200);

    // Verify new password works
    await request(app)
      .post('/api/auth/login')
      .send({ email: user1Email, password: 'newpassword456' })
      .expect(200);

    // Verify old password no longer works
    await request(app)
      .post('/api/auth/login')
      .send({ email: user1Email, password: 'password123' })
      .expect(401);
  });

  it('should return 400 when new password and confirmation do not match', async () => {
    await authRequest(app, 'user1')
      .post('/api/auth/change-password')
      .send({
        oldPassword: 'password123',
        newPassword: 'newpassword456',
        confirmPassword: 'differentpassword'
      })
      .expect(400);
  });

  it('should return 401 for incorrect old password', async () => {
    await authRequest(app, 'user1')
      .post('/api/auth/change-password')
      .send({
        oldPassword: 'wrongpassword',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456'
      })
      .expect(401);
  });

  it('should return 401 for unauthenticated request', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .send({
        oldPassword: 'password123',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456'
      })
      .expect(401);
  });

  it('should invalidate all refresh tokens after password change', async () => {
    // Login to get a refresh token
    let loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user1Email, password: 'password123' })
      .expect(200);

    const { refreshToken } = loginRes.body;
    loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user1Email, password: 'password123' })
      .expect(200);

    const { refreshToken: refreshToken2 } = loginRes.body;

    // Change password
    await authRequest(app, 'user1')
      .post('/api/auth/change-password')
      .send({
        oldPassword: 'password123',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456'
      })
      .expect(200);

    // Try to use the old refresh token - should fail
    await request(app).post('/api/auth/token').send({ refreshToken }).expect(401);
    await request(app).post('/api/auth/token').send({ refreshToken: refreshToken2 }).expect(401);
  });

  it('should log password change action', async () => {
    await authRequest(app, 'user1')
      .post('/api/auth/change-password')
      .send({
        oldPassword: 'password123',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456'
      })
      .expect(200);

    // Check that the password change was logged
    const logs = await authRequest(app, 'admin').get('/api/users/utils/log').expect(200);

    const passwordChangeLog = logs.body.logs.find(
      (log: any) => log.action === 'CHANGE_PASSWORD' && log.user.email === user1Email
    );

    expect(passwordChangeLog).toBeTruthy();
  });

  it('should return 400 for invalid input schema', async () => {
    await authRequest(app, 'user1')
      .post('/api/auth/change-password')
      .send({
        oldPassword: 'password123',
        newPassword: 'short',
        confirmPassword: 'short'
      })
      .expect(400);
  });
});
