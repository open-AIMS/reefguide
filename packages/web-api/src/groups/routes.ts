import { prisma } from '@reefguide/db';
import {
  CreateGroupInputSchema,
  CreateGroupResponse,
  UpdateGroupInputSchema,
  UpdateGroupResponse,
  GetGroupResponse,
  GetGroupsQuerySchema,
  GetGroupsResponse,
  DeleteGroupResponse,
  GroupParamsSchema,
  AddGroupMembersInputSchema,
  AddGroupMembersResponse,
  RemoveGroupMembersInputSchema,
  RemoveGroupMembersResponse,
  AddGroupManagersInputSchema,
  AddGroupManagersResponse,
  RemoveGroupManagersInputSchema,
  RemoveGroupManagersResponse,
  TransferGroupOwnershipInputSchema,
  TransferGroupOwnershipResponse
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import { assertUserHasRoleMiddleware } from '../auth/utils';
import { BadRequestException, InternalServerError, NotFoundException } from '../exceptions';
import { GroupService } from './service';

require('express-async-errors');
export const router: Router = express.Router();

/**
 * Create a new group
 */
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    body: CreateGroupInputSchema
  }),
  async (req, res: Response<CreateGroupResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupService = new GroupService(prisma);
      const group = await groupService.create({
        input: req.body,
        ownerId: req.user.id
      });

      res.status(201).json({ group });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerError('Failed to create group. Error: ' + error, error as Error);
    }
  }
);

/**
 * Get groups with optional filtering
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    query: GetGroupsQuerySchema
  }),
  async (req, res: Response<GetGroupsResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupService = new GroupService(prisma);
      const limit = req.query.limit;
      const offset = req.query.offset;

      const options = {
        name: req.query.name,
        limit,
        offset,
        currentUser: req.user,
        // Admins can see all groups
        includeAll: req.user.roles.includes('ADMIN')
      };

      const groups = await groupService.getMany({ options });
      const total = await groupService.getCount({ options });

      res.json({
        groups,
        pagination: {
          total,
          limit: limit ?? 50,
          offset: offset ?? 0
        }
      });
    } catch (error) {
      throw new InternalServerError('Failed to get groups. Error: ' + error, error as Error);
    }
  }
);

/**
 * Get a specific group by ID
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: GroupParamsSchema
  }),
  async (req, res: Response<GetGroupResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupId = parseInt(req.params.id, 10);
      const groupService = new GroupService(prisma);

      // Check if user can access this group
      const isAdmin = req.user.roles.includes('ADMIN');
      const canAccess = await groupService.canUserAccessGroup(groupId, req.user, isAdmin);

      if (!canAccess) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const group = await groupService.getById({ id: groupId });

      if (!group) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      res.json({ group });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError('Failed to get group. Error: ' + error, error as Error);
    }
  }
);

/**
 * Update a group (owner or manager only)
 */
router.put(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: GroupParamsSchema,
    body: UpdateGroupInputSchema
  }),
  async (req, res: Response<UpdateGroupResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupId = parseInt(req.params.id, 10);
      const groupService = new GroupService(prisma);

      // Check permissions
      const canManage = await groupService.canUserManageGroup(groupId, req.user);

      if (!canManage) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const group = await groupService.update({
        id: groupId,
        input: req.body
      });

      res.json({ group });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerError('Failed to update group. Error: ' + error, error as Error);
    }
  }
);

/**
 * Delete a group (owner only)
 */
router.delete(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: GroupParamsSchema
  }),
  async (req, res: Response<DeleteGroupResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupId = parseInt(req.params.id, 10);
      const groupService = new GroupService(prisma);

      // Only owner or admin can delete
      const group = await groupService.getById({ id: groupId });
      if (!group) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const isOwner = group.owner_id === req.user.id;
      const isAdmin = req.user.roles.includes('ADMIN');

      if (!isOwner && !isAdmin) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const deleted = await groupService.delete({ id: groupId });

      if (!deleted) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      res.json({ message: 'Group deleted successfully' });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError('Failed to delete group. Error: ' + error, error as Error);
    }
  }
);

/**
 * Add members to a group (owner or manager only)
 */
router.post(
  '/:id/members',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: GroupParamsSchema,
    body: AddGroupMembersInputSchema
  }),
  async (req, res: Response<AddGroupMembersResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupId = parseInt(req.params.id, 10);
      const { userIds } = req.body;
      const groupService = new GroupService(prisma);

      // Check permissions
      const canManage = await groupService.canUserManageGroup(groupId, req.user);

      if (!canManage) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const result = await groupService.addMembers({ groupId, userIds });

      res.json({
        message: 'Member addition completed',
        added: result.added,
        alreadyMembers: result.alreadyMembers,
        errors: result.errors
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to add members to group. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Remove members from a group (owner or manager only)
 */
router.delete(
  '/:id/members',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: GroupParamsSchema,
    body: RemoveGroupMembersInputSchema
  }),
  async (req, res: Response<RemoveGroupMembersResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupId = parseInt(req.params.id, 10);
      const { userIds } = req.body;
      const groupService = new GroupService(prisma);

      // Check permissions
      const canManage = await groupService.canUserManageGroup(groupId, req.user);

      if (!canManage) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const result = await groupService.removeMembers({ groupId, userIds });

      res.json({
        message: 'Member removal completed',
        removed: result.removed,
        notMembers: result.notMembers,
        errors: result.errors
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to remove members from group. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Add managers to a group (owner only)
 */
router.post(
  '/:id/managers',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: GroupParamsSchema,
    body: AddGroupManagersInputSchema
  }),
  async (req, res: Response<AddGroupManagersResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupId = parseInt(req.params.id, 10);
      const { userIds } = req.body;
      const groupService = new GroupService(prisma);

      // Only owner or admin can add managers
      const group = await groupService.getById({ id: groupId });
      if (!group) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const isOwner = group.owner_id === req.user.id;
      const isAdmin = req.user.roles.includes('ADMIN');

      if (!isOwner && !isAdmin) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const result = await groupService.addManagers({ groupId, userIds });

      res.json({
        message: 'Manager addition completed',
        added: result.added,
        alreadyManagers: result.alreadyManagers,
        errors: result.errors
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to add managers to group. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Remove managers from a group (owner only)
 */
router.delete(
  '/:id/managers',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: GroupParamsSchema,
    body: RemoveGroupManagersInputSchema
  }),
  async (req, res: Response<RemoveGroupManagersResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupId = parseInt(req.params.id, 10);
      const { userIds } = req.body;
      const groupService = new GroupService(prisma);

      // Only owner or admin can remove managers
      const group = await groupService.getById({ id: groupId });
      if (!group) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const isOwner = group.owner_id === req.user.id;
      const isAdmin = req.user.roles.includes('ADMIN');

      if (!isOwner && !isAdmin) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const result = await groupService.removeManagers({ groupId, userIds });

      res.json({
        message: 'Manager removal completed',
        removed: result.removed,
        notManagers: result.notManagers,
        errors: result.errors
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to remove managers from group. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Transfer group ownership (owner only)
 */
router.post(
  '/:id/transfer-ownership',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: GroupParamsSchema,
    body: TransferGroupOwnershipInputSchema
  }),
  async (req, res: Response<TransferGroupOwnershipResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupId = parseInt(req.params.id, 10);
      const { newOwnerId } = req.body;
      const groupService = new GroupService(prisma);

      // Only owner or admin can transfer ownership
      const group = await groupService.getById({ id: groupId });
      if (!group) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const isOwner = group.owner_id === req.user.id;
      const isAdmin = req.user.roles.includes('ADMIN');

      if (!isOwner && !isAdmin) {
        throw new NotFoundException(`Group with ID ${groupId} not found`);
      }

      const updatedGroup = await groupService.transferOwnership({ groupId, newOwnerId });

      res.json({
        message: 'Group ownership transferred successfully',
        group: updatedGroup
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerError(
        'Failed to transfer group ownership. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Get groups the current user is part of (owner, manager, or member)
 */
router.get(
  '/user/me',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<GetGroupsResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const groupService = new GroupService(prisma);
      const groups = await groupService.getByUserId({ userId: req.user.id });

      res.json({
        groups,
        pagination: {
          total: groups.length,
          limit: groups.length,
          offset: 0
        }
      });
    } catch (error) {
      throw new InternalServerError('Failed to get user groups. Error: ' + error, error as Error);
    }
  }
);
