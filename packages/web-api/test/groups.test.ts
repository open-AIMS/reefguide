import { prisma } from '@reefguide/db';
import app from '../src/apiSetup';
import { authRequest, clearDbs, user1Id, user2Id, userSetup } from './utils/testSetup';

describe('Groups', () => {
  let groupId: number;

  beforeEach(async () => {
    await clearDbs();
    await userSetup();

    // Create a test group owned by user1
    const group = await prisma.group.create({
      data: {
        name: 'Test Group',
        description: 'A test group',
        owner_id: user1Id
      }
    });
    groupId = group.id;
  });

  afterAll(async () => {
    await clearDbs();
  });

  describe('POST /api/groups', () => {
    it('should create a new group', async () => {
      const res = await authRequest(app, 'user1')
        .post('/api/groups')
        .send({
          name: 'New Group',
          description: 'A new test group'
        })
        .expect(201);

      expect(res.body.group).toHaveProperty('id');
      expect(res.body.group).toHaveProperty('name', 'New Group');
      expect(res.body.group).toHaveProperty('description', 'A new test group');
      expect(res.body.group).toHaveProperty('owner_id', user1Id);
    });

    it('should return 400 for invalid input', async () => {
      await authRequest(app, 'user1')
        .post('/api/groups')
        .send({
          description: 'Missing name'
        })
        .expect(400);
    });

    it('should return 401 for unauthenticated request', async () => {
      await authRequest(app, 'nonanalyst')
        .post('/api/groups')
        .send({
          name: 'Unauthorized Group'
        })
        .expect(401);
    });
  });

  describe('GET /api/groups', () => {
    it('should return groups the user is part of', async () => {
      const res = await authRequest(app, 'user1').get('/api/groups').expect(200);

      expect(res.body.groups).toBeInstanceOf(Array);
      expect(res.body.groups.length).toBe(1);
      expect(res.body.groups[0]).toHaveProperty('owner_id', user1Id);
      expect(res.body.pagination).toHaveProperty('total', 1);
    });

    it('should return all groups for admin', async () => {
      // Create a group for user2
      await prisma.group.create({
        data: {
          name: 'User2 Group',
          description: 'Group owned by user2',
          owner_id: user2Id
        }
      });

      const res = await authRequest(app, 'admin').get('/api/groups').expect(200);

      expect(res.body.groups).toBeInstanceOf(Array);
      expect(res.body.groups.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array if user has no groups', async () => {
      const res = await authRequest(app, 'user2').get('/api/groups').expect(200);

      expect(res.body.groups).toBeInstanceOf(Array);
      expect(res.body.groups.length).toBe(0);
    });

    it('should filter by group name', async () => {
      await prisma.group.create({
        data: {
          name: 'Special Group',
          owner_id: user1Id
        }
      });

      const res = await authRequest(app, 'user1')
        .get('/api/groups')
        .query({ name: 'Special' })
        .expect(200);

      expect(res.body.groups).toBeInstanceOf(Array);
      expect(res.body.groups.length).toBe(1);
      expect(res.body.groups[0].name).toContain('Special');
    });
  });

  describe('GET /api/groups/:id', () => {
    it('should return a specific group for its owner', async () => {
      const res = await authRequest(app, 'user1').get(`/api/groups/${groupId}`).expect(200);

      expect(res.body.group).toHaveProperty('id', groupId);
      expect(res.body.group).toHaveProperty('name', 'Test Group');
      expect(res.body.group).toHaveProperty('owner_id', user1Id);
    });

    it('should return a specific group for admin', async () => {
      const res = await authRequest(app, 'admin').get(`/api/groups/${groupId}`).expect(200);

      expect(res.body.group).toHaveProperty('id', groupId);
    });

    it('should return 404 if user is not part of the group', async () => {
      await authRequest(app, 'user2').get(`/api/groups/${groupId}`).expect(404);
    });

    it('should return 404 for non-existent group', async () => {
      await authRequest(app, 'user1').get('/api/groups/9999').expect(404);
    });
  });

  describe('PUT /api/groups/:id', () => {
    it('should update an existing group (owner)', async () => {
      const res = await authRequest(app, 'user1')
        .put(`/api/groups/${groupId}`)
        .send({
          name: 'Updated Group',
          description: 'Updated description'
        })
        .expect(200);

      expect(res.body.group).toHaveProperty('id', groupId);
      expect(res.body.group).toHaveProperty('name', 'Updated Group');
      expect(res.body.group).toHaveProperty('description', 'Updated description');
    });

    it('should allow manager to update group', async () => {
      // Add user2 as a manager
      await prisma.groupManager.create({
        data: {
          group_id: groupId,
          user_id: user2Id
        }
      });

      const res = await authRequest(app, 'user2')
        .put(`/api/groups/${groupId}`)
        .send({
          name: 'Manager Updated'
        })
        .expect(200);

      expect(res.body.group).toHaveProperty('name', 'Manager Updated');
    });

    it('should allow admin to update any group', async () => {
      const res = await authRequest(app, 'admin')
        .put(`/api/groups/${groupId}`)
        .send({
          name: 'Admin Updated'
        })
        .expect(200);

      expect(res.body.group).toHaveProperty('name', 'Admin Updated');
    });

    it('should return 404 if user cannot manage the group', async () => {
      await authRequest(app, 'user2')
        .put(`/api/groups/${groupId}`)
        .send({
          name: 'Unauthorized Update'
        })
        .expect(404);
    });

    it('should return 404 for non-existent group', async () => {
      await authRequest(app, 'user1')
        .put('/api/groups/9999')
        .send({
          name: 'Non-existent'
        })
        .expect(404);
    });
  });

  describe('DELETE /api/groups/:id', () => {
    it('should delete an existing group (owner)', async () => {
      await authRequest(app, 'user1').delete(`/api/groups/${groupId}`).expect(200);

      // Verify the group is deleted
      await authRequest(app, 'user1').get(`/api/groups/${groupId}`).expect(404);
    });

    it('should allow admin to delete any group', async () => {
      await authRequest(app, 'admin').delete(`/api/groups/${groupId}`).expect(200);

      // Verify deletion
      const deleted = await prisma.group.findUnique({
        where: { id: groupId }
      });
      expect(deleted).toBeNull();
    });

    it('should return 404 if user is not the owner', async () => {
      await authRequest(app, 'user2').delete(`/api/groups/${groupId}`).expect(404);
    });

    it('should return 404 for non-existent group', async () => {
      await authRequest(app, 'user1').delete('/api/groups/9999').expect(404);
    });
  });

  describe('POST /api/groups/:id/members', () => {
    it('should add members to a group (owner)', async () => {
      const res = await authRequest(app, 'user1')
        .post(`/api/groups/${groupId}/members`)
        .send({
          userIds: [user2Id]
        })
        .expect(200);

      expect(res.body.message).toContain('Member addition completed');
      expect(res.body.added).toHaveLength(1);
      expect(res.body.added[0]).toHaveProperty('userId', user2Id);
      expect(res.body.errors).toHaveLength(0);
    });

    it('should add members to a group (manager)', async () => {
      // Add user2 as manager first
      await prisma.groupManager.create({
        data: {
          group_id: groupId,
          user_id: user2Id
        }
      });

      // Create user3 to add as member
      const user3 = await prisma.user.create({
        data: {
          email: 'user3@example.com',
          password: 'hashedpassword',
          roles: ['ANALYST']
        }
      });

      const res = await authRequest(app, 'user2')
        .post(`/api/groups/${groupId}/members`)
        .send({
          userIds: [user3.id]
        })
        .expect(200);

      expect(res.body.added).toHaveLength(1);
    });

    it('should return error for non-existent users', async () => {
      const res = await authRequest(app, 'user1')
        .post(`/api/groups/${groupId}/members`)
        .send({
          userIds: [9999]
        })
        .expect(200);

      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toHaveProperty('error', 'User not found');
    });

    it('should handle already-member case', async () => {
      // Add user2 as member first
      await prisma.groupMember.create({
        data: {
          group_id: groupId,
          user_id: user2Id
        }
      });

      const res = await authRequest(app, 'user1')
        .post(`/api/groups/${groupId}/members`)
        .send({
          userIds: [user2Id]
        })
        .expect(200);

      expect(res.body.alreadyMembers).toHaveLength(1);
      expect(res.body.added).toHaveLength(0);
    });

    it('should return 404 if user cannot manage group', async () => {
      await authRequest(app, 'user2')
        .post(`/api/groups/${groupId}/members`)
        .send({
          userIds: [user2Id]
        })
        .expect(404);
    });
  });

  describe('DELETE /api/groups/:id/members', () => {
    beforeEach(async () => {
      // Add user2 as a member
      await prisma.groupMember.create({
        data: {
          group_id: groupId,
          user_id: user2Id
        }
      });
    });

    it('should remove members from a group', async () => {
      const res = await authRequest(app, 'user1')
        .delete(`/api/groups/${groupId}/members`)
        .send({
          userIds: [user2Id]
        })
        .expect(200);

      expect(res.body.message).toContain('Member removal completed');
      expect(res.body.removed).toHaveLength(1);
      expect(res.body.removed[0]).toHaveProperty('userId', user2Id);
    });

    it('should handle not-member case', async () => {
      // Create user3 who is not a member
      const user3 = await prisma.user.create({
        data: {
          email: 'user3@example.com',
          password: 'hashedpassword',
          roles: ['ANALYST']
        }
      });

      const res = await authRequest(app, 'user1')
        .delete(`/api/groups/${groupId}/members`)
        .send({
          userIds: [user3.id]
        })
        .expect(200);

      expect(res.body.notMembers).toHaveLength(1);
      expect(res.body.removed).toHaveLength(0);
    });
  });

  describe('POST /api/groups/:id/managers', () => {
    it('should add managers to a group (owner only)', async () => {
      const res = await authRequest(app, 'user1')
        .post(`/api/groups/${groupId}/managers`)
        .send({
          userIds: [user2Id]
        })
        .expect(200);

      expect(res.body.message).toContain('Manager addition completed');
      expect(res.body.added).toHaveLength(1);
      expect(res.body.added[0]).toHaveProperty('userId', user2Id);
    });

    it('should return 404 if user is not owner', async () => {
      await authRequest(app, 'user2')
        .post(`/api/groups/${groupId}/managers`)
        .send({
          userIds: [user2Id]
        })
        .expect(404);
    });

    it('should handle already-manager case', async () => {
      // Add user2 as manager first
      await prisma.groupManager.create({
        data: {
          group_id: groupId,
          user_id: user2Id
        }
      });

      const res = await authRequest(app, 'user1')
        .post(`/api/groups/${groupId}/managers`)
        .send({
          userIds: [user2Id]
        })
        .expect(200);

      expect(res.body.alreadyManagers).toHaveLength(1);
      expect(res.body.added).toHaveLength(0);
    });
  });

  describe('DELETE /api/groups/:id/managers', () => {
    beforeEach(async () => {
      // Add user2 as a manager
      await prisma.groupManager.create({
        data: {
          group_id: groupId,
          user_id: user2Id
        }
      });
    });

    it('should remove managers from a group (owner only)', async () => {
      const res = await authRequest(app, 'user1')
        .delete(`/api/groups/${groupId}/managers`)
        .send({
          userIds: [user2Id]
        })
        .expect(200);

      expect(res.body.message).toContain('Manager removal completed');
      expect(res.body.removed).toHaveLength(1);
    });

    it('should return 404 if user is not owner', async () => {
      await authRequest(app, 'user2')
        .delete(`/api/groups/${groupId}/managers`)
        .send({
          userIds: [user2Id]
        })
        .expect(404);
    });
  });

  describe('POST /api/groups/:id/transfer-ownership', () => {
    it('should transfer group ownership', async () => {
      const res = await authRequest(app, 'user1')
        .post(`/api/groups/${groupId}/transfer-ownership`)
        .send({
          newOwnerId: user2Id
        })
        .expect(200);

      expect(res.body.message).toContain('ownership transferred');
      expect(res.body.group).toHaveProperty('owner_id', user2Id);
    });

    it('should allow admin to transfer ownership', async () => {
      const res = await authRequest(app, 'admin')
        .post(`/api/groups/${groupId}/transfer-ownership`)
        .send({
          newOwnerId: user2Id
        })
        .expect(200);

      expect(res.body.group).toHaveProperty('owner_id', user2Id);
    });

    it('should return 404 if user is not owner', async () => {
      await authRequest(app, 'user2')
        .post(`/api/groups/${groupId}/transfer-ownership`)
        .send({
          newOwnerId: user2Id
        })
        .expect(404);
    });

    it('should return error for non-existent new owner', async () => {
      await authRequest(app, 'user1')
        .post(`/api/groups/${groupId}/transfer-ownership`)
        .send({
          newOwnerId: 9999
        })
        .expect(400);
    });
  });

  describe('GET /api/groups/user/me', () => {
    it('should return groups the current user owns', async () => {
      const res = await authRequest(app, 'user1').get('/api/groups/user/me').expect(200);

      expect(res.body.groups).toBeInstanceOf(Array);
      expect(res.body.groups.length).toBe(1);
      expect(res.body.groups[0]).toHaveProperty('owner_id', user1Id);
    });

    it('should return groups the current user manages', async () => {
      // Add user2 as manager of the group
      await prisma.groupManager.create({
        data: {
          group_id: groupId,
          user_id: user2Id
        }
      });

      const res = await authRequest(app, 'user2').get('/api/groups/user/me').expect(200);

      expect(res.body.groups).toBeInstanceOf(Array);
      expect(res.body.groups.length).toBe(1);
    });

    it('should return groups the current user is a member of', async () => {
      // Add user2 as member of the group
      await prisma.groupMember.create({
        data: {
          group_id: groupId,
          user_id: user2Id
        }
      });

      const res = await authRequest(app, 'user2').get('/api/groups/user/me').expect(200);

      expect(res.body.groups).toBeInstanceOf(Array);
      expect(res.body.groups.length).toBe(1);
    });

    it('should return empty array if user has no groups', async () => {
      // Create a new user with no groups
      const user3 = await prisma.user.create({
        data: {
          email: 'user3@example.com',
          password: 'hashedpassword',
          roles: ['ANALYST']
        }
      });

      // Need to create a token for user3, but for simplicity we'll use user2 who has no groups
      const res = await authRequest(app, 'user2').get('/api/groups/user/me').expect(200);

      expect(res.body.groups).toBeInstanceOf(Array);
      expect(res.body.groups.length).toBe(0);
    });
  });
});
