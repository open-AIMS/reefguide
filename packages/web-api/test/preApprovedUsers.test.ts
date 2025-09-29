import { prisma } from '@reefguide/db';
import request from 'supertest';
import app from '../src/apiSetup';
import { BASE_ROLES } from '../src/auth/routes';
import { createTestPreApprovedUser } from './utils/testData';
import { authRequest, clearDbs, user1Id, userSetup } from './utils/testSetup';

describe('Pre-Approved Users', () => {
  let preApprovedUserId: number;

  beforeEach(async () => {
    await clearDbs();
    await userSetup();

    const preApproved = await createTestPreApprovedUser();
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
      await authRequest(app, 'admin').delete('/api/auth/admin/pre-approved-users/9999').expect(404);
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
