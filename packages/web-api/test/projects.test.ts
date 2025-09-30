import { prisma, ProjectType } from '@reefguide/db';
import request from 'supertest';
import app from '../src/apiSetup';
import { createTestProject } from './utils/testData';
import { authRequest, clearDbs, user1Id, user2Id, userSetup } from './utils/testSetup';

describe('Projects', () => {
  let projectId: number;

  beforeEach(async () => {
    await clearDbs();
    await userSetup();

    const project = await createTestProject(user1Id);
    projectId = project.id;
  });

  afterAll(async () => {
    await clearDbs();
  });

  describe('POST /api/projects', () => {
    it('should create a new project', async () => {
      const res = await authRequest(app, 'user1')
        .post('/api/projects')
        .send({
          name: 'New Project',
          description: 'A new test project',
          type: 'ADRIA_ANALYSIS',
          project_state: { step: 1, initialized: true }
        })
        .expect(201);

      expect(res.body.project).toHaveProperty('id');
      expect(res.body.project).toHaveProperty('name', 'New Project');
      expect(res.body.project).toHaveProperty('type', 'ADRIA_ANALYSIS');
      expect(res.body.project).toHaveProperty('user_id', user1Id);
      expect(res.body.project).toHaveProperty('is_public', false); // Should default to private
    });

    it('should return 400 for invalid input', async () => {
      await authRequest(app, 'user1')
        .post('/api/projects')
        .send({
          description: 'Missing name and type'
        })
        .expect(400);
    });

    it('should return 400 for duplicate project name for same user', async () => {
      await authRequest(app, 'user1')
        .post('/api/projects')
        .send({
          name: 'Test Project', // Same as existing
          type: 'SITE_SELECTION',
          project_state: {}
        })
        .expect(400);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app)
        .post('/api/projects')
        .send({
          name: 'Unauthorized Project',
          type: 'SITE_SELECTION',
          project_state: {}
        })
        .expect(401);
    });
  });

  describe('GET /api/projects', () => {
    it("should return user's projects for non-admin", async () => {
      const res = await authRequest(app, 'user1').get('/api/projects').expect(200);

      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBe(1);
      expect(res.body.projects[0]).toHaveProperty('user_id', user1Id);
      expect(res.body.pagination).toHaveProperty('total', 1);
    });

    it('should return all projects for admin', async () => {
      // Create a project for user2 first
      await createTestProject(user2Id, { name: 'User2 Project', type: ProjectType.ADRIA_ANALYSIS });

      const res = await authRequest(app, 'admin').get('/api/projects').expect(200);

      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBeGreaterThanOrEqual(2);
    });

    it('should include public projects for non-owners', async () => {
      // Create a public project owned by user1
      await createTestProject(user1Id, { name: 'Public Project', is_public: true });

      const res = await authRequest(app, 'user2').get('/api/projects').expect(200);

      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBe(1); // Should see the public project
      expect(res.body.projects[0]).toHaveProperty('is_public', true);
      expect(res.body.projects[0]).toHaveProperty('name', 'Public Project');
    });

    it('should filter by project type', async () => {
      // Create an ADRIA_ANALYSIS project
      await createTestProject(user1Id, {
        name: 'Analysis Project',
        type: ProjectType.ADRIA_ANALYSIS
      });

      const res = await authRequest(app, 'user1')
        .get('/api/projects')
        .query({ type: 'ADRIA_ANALYSIS' })
        .expect(200);

      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBe(1);
      expect(res.body.projects[0]).toHaveProperty('type', 'ADRIA_ANALYSIS');
    });

    it('should filter by project name', async () => {
      const res = await authRequest(app, 'user1')
        .get('/api/projects')
        .query({ name: 'Test' })
        .expect(200);

      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBe(1);
      expect(res.body.projects[0].name).toContain('Test');
    });

    it('should return empty array if user has no accessible projects', async () => {
      const res = await authRequest(app, 'user2').get('/api/projects').expect(200);

      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBe(0);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return a specific project for its owner', async () => {
      const res = await authRequest(app, 'user1').get(`/api/projects/${projectId}`).expect(200);

      expect(res.body.project).toHaveProperty('id', projectId);
      expect(res.body.project).toHaveProperty('name', 'Test Project');
      expect(res.body.project).toHaveProperty('user_id', user1Id);
    });

    it('should return a specific project for admin', async () => {
      const res = await authRequest(app, 'admin').get(`/api/projects/${projectId}`).expect(200);

      expect(res.body.project).toHaveProperty('id', projectId);
    });

    it('should return public project for non-owner', async () => {
      // Make the project public
      await prisma.project.update({
        where: { id: projectId },
        data: { is_public: true }
      });

      const res = await authRequest(app, 'user2').get(`/api/projects/${projectId}`).expect(200);

      expect(res.body.project).toHaveProperty('id', projectId);
      expect(res.body.project).toHaveProperty('is_public', true);
    });

    it("should return 404 if user doesn't have access to private project", async () => {
      await authRequest(app, 'user2').get(`/api/projects/${projectId}`).expect(404);
    });

    it('should return 404 for non-existent project', async () => {
      await authRequest(app, 'user1').get('/api/projects/9999').expect(404);
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('should update an existing project (owner)', async () => {
      const res = await authRequest(app, 'user1')
        .put(`/api/projects/${projectId}`)
        .send({
          name: 'Updated Project',
          description: 'Updated description',
          project_state: { step: 2, updated: true }
        })
        .expect(200);

      expect(res.body.project).toHaveProperty('id', projectId);
      expect(res.body.project).toHaveProperty('name', 'Updated Project');
      expect(res.body.project).toHaveProperty('description', 'Updated description');
      expect(res.body.project.project_state).toHaveProperty('step', 2);
    });

    it('should allow admin to update any project', async () => {
      const res = await authRequest(app, 'admin')
        .put(`/api/projects/${projectId}`)
        .send({
          name: 'Admin Updated Project'
        })
        .expect(200);

      expect(res.body.project).toHaveProperty('name', 'Admin Updated Project');
    });

    it('should return 400 for duplicate project name', async () => {
      // Create another project for the same user
      await createTestProject(user1Id, {
        name: 'Another Project',
        type: ProjectType.ADRIA_ANALYSIS
      });

      await authRequest(app, 'user1')
        .put(`/api/projects/${projectId}`)
        .send({
          name: 'Another Project' // Duplicate name
        })
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      await authRequest(app, 'user1')
        .put('/api/projects/9999')
        .send({
          name: 'Non-existent Project'
        })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete an existing project (owner)', async () => {
      await authRequest(app, 'user1').delete(`/api/projects/${projectId}`).expect(200);

      // Verify the project is deleted
      await authRequest(app, 'user1').get(`/api/projects/${projectId}`).expect(404);
    });

    it('should allow admin to delete any project', async () => {
      await authRequest(app, 'admin').delete(`/api/projects/${projectId}`).expect(200);

      // Verify deletion
      const deleted = await prisma.project.findUnique({
        where: { id: projectId }
      });
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent project', async () => {
      await authRequest(app, 'user1').delete('/api/projects/9999').expect(404);
    });
  });

  describe('GET /api/projects/user/me', () => {
    it("should return current user's projects", async () => {
      const res = await authRequest(app, 'user1').get('/api/projects/user/me').expect(200);

      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBe(1);
      expect(res.body.projects[0]).toHaveProperty('user_id', user1Id);
      expect(res.body.pagination).toHaveProperty('total', 1);
    });

    it('should return empty array if user has no projects', async () => {
      const res = await authRequest(app, 'user2').get('/api/projects/user/me').expect(200);

      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBe(0);
    });
  });

  describe('POST /api/projects/bulk', () => {
    it('should bulk create projects (admin only)', async () => {
      const res = await authRequest(app, 'admin')
        .post('/api/projects/bulk')
        .send({
          projects: [
            {
              name: 'Bulk Project 1',
              type: 'SITE_SELECTION',
              project_state: { bulk: true }
            },
            {
              name: 'Bulk Project 2',
              type: 'ADRIA_ANALYSIS',
              project_state: { bulk: true }
            }
          ],
          userId: user2Id
        })
        .expect(201);

      expect(res.body.created).toHaveLength(2);
      expect(res.body.errors).toHaveLength(0);
      expect(res.body.summary.totalCreated).toBe(2);
      expect(res.body.summary.totalErrors).toBe(0);
    });

    it('should handle partial failures in bulk creation', async () => {
      const res = await authRequest(app, 'admin')
        .post('/api/projects/bulk')
        .send({
          projects: [
            {
              name: 'Valid Project',
              type: 'SITE_SELECTION',
              project_state: {}
            },
            {
              name: 'Test Project', // Duplicate name for user1
              type: 'SITE_SELECTION',
              project_state: {}
            }
          ],
          userId: user1Id
        })
        .expect(201);

      expect(res.body.created).toHaveLength(1);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.summary.totalCreated).toBe(1);
      expect(res.body.summary.totalErrors).toBe(1);
    });

    it('should return 401 for non-admin users', async () => {
      await authRequest(app, 'user1')
        .post('/api/projects/bulk')
        .send({
          projects: [
            {
              name: 'Unauthorized Bulk',
              type: 'SITE_SELECTION',
              project_state: {}
            }
          ],
          userId: user1Id
        })
        .expect(401);
    });
  });
});
