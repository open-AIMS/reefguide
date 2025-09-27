import { prisma } from '@reefguide/db';
import {
  BulkCreateProjectsInputSchema,
  BulkCreateProjectsResponse,
  CreateProjectInputSchema,
  CreateProjectResponse,
  DeleteProjectResponse,
  GetProjectResponse,
  GetProjectsQuerySchema,
  GetProjectsResponse,
  ProjectParamsSchema,
  SetProjectPublicityInputSchema,
  SetProjectPublicityResponse,
  ShareProjectWithGroupsInputSchema,
  ShareProjectWithGroupsResponse,
  ShareProjectWithUsersInputSchema,
  ShareProjectWithUsersResponse,
  UnshareProjectWithGroupsInputSchema,
  UnshareProjectWithGroupsResponse,
  UnshareProjectWithUsersInputSchema,
  UnshareProjectWithUsersResponse,
  UpdateProjectInputSchema,
  UpdateProjectResponse
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import { assertUserHasRoleMiddleware } from '../auth/utils';
import { BadRequestException, InternalServerError, NotFoundException } from '../exceptions';
import { ProjectService } from './service';

require('express-async-errors');
export const router: Router = express.Router();

/**
 * Create a new project
 */
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    body: CreateProjectInputSchema
  }),
  async (req, res: Response<CreateProjectResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const projectService = new ProjectService(prisma);
      const project = await projectService.create({
        input: req.body,
        userId: req.user.id
      });

      res.status(201).json({ project });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerError('Failed to create project. Error: ' + error, error as Error);
    }
  }
);

/**
 * Get projects with optional filtering
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    query: GetProjectsQuerySchema
  }),
  async (req, res: Response<GetProjectsResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectService = new ProjectService(prisma);
      // Parse and validate query parameters
      const limit = req.query.limit;
      const offset = req.query.offset;
      const type = req.query.type;
      // Validate type if provided
      if (type && !['SITE_SELECTION', 'ADRIA_ANALYSIS'].includes(type)) {
        throw new BadRequestException(
          `Invalid project type: ${type}. Must be SITE_SELECTION or ADRIA_ANALYSIS`
        );
      }

      // Build options with user context for permission checking
      const options = {
        type,
        name: req.query.name,
        limit,
        offset,
        // Always pass the current user for permission filtering
        // Only admins can see all projects without restriction
        currentUser: req.user,
        ignorePermissions: req.user.roles.includes('ADMIN')
      };

      const projects = await projectService.getMany({ options });
      const total = await projectService.getCount({ options });

      res.json({
        projects,
        pagination: {
          total,
          limit: limit ?? 50,
          offset: offset ?? 0
        }
      });
    } catch (error) {
      throw new InternalServerError('Failed to get projects. Error: ' + error, error as Error);
    }
  }
);

/**
 * Get a specific project by ID
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: ProjectParamsSchema
  }),
  async (req, res: Response<GetProjectResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectId = parseInt(req.params.id, 10);
      const projectService = new ProjectService(prisma);

      // Check if user can access this project
      const isAdmin = req.user.roles.includes('ADMIN');
      const canAccess = await projectService.canUserAccessProject(projectId, req.user, isAdmin);

      if (!canAccess) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      // User has permission, get the project
      const project = await projectService.getById({ id: projectId });

      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      res.json({ project });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError('Failed to get project. Error: ' + error, error as Error);
    }
  }
);

/**
 * Update a project
 */
router.put(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: ProjectParamsSchema,
    body: UpdateProjectInputSchema
  }),
  async (req, res: Response<UpdateProjectResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectId = parseInt(req.params.id, 10);
      const projectService = new ProjectService(prisma);

      // For updates, we need to be more restrictive - only owners and admins can update
      const isAdmin = req.user.roles.includes('ADMIN');

      if (!isAdmin) {
        // Non-admins can only update projects they own
        const project = await projectService.getById({ id: projectId });
        if (!project || project.user_id !== req.user.id) {
          throw new NotFoundException(`Project with ID ${projectId} not found`);
        }
      }

      const project = await projectService.update({
        id: projectId,
        input: req.body
      });

      res.json({ project });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerError('Failed to update project. Error: ' + error, error as Error);
    }
  }
);

/**
 * Delete a project
 */
router.delete(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: ProjectParamsSchema
  }),
  async (req, res: Response<DeleteProjectResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectId = parseInt(req.params.id, 10);
      const projectService = new ProjectService(prisma);

      // For deletion, we need to be more restrictive - only owners and admins can delete
      const isAdmin = req.user.roles.includes('ADMIN');

      if (!isAdmin) {
        // Non-admins can only delete projects they own
        const project = await projectService.getById({ id: projectId });
        if (!project || project.user_id !== req.user.id) {
          throw new NotFoundException(`Project with ID ${projectId} not found`);
        }
      }

      const deleted = await projectService.delete({ id: projectId });

      if (!deleted) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      res.json({ message: 'Project deleted successfully' });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError('Failed to delete project. Error: ' + error, error as Error);
    }
  }
);

/**
 * Get current user's projects
 */
router.get(
  '/user/me',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<GetProjectsResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const projectService = new ProjectService(prisma);
      const projects = await projectService.getByUserId({ userId: req.user.id });

      res.json({
        projects,
        pagination: {
          total: projects.length,
          limit: projects.length,
          offset: 0
        }
      });
    } catch (error) {
      throw new InternalServerError('Failed to get user projects. Error: ' + error, error as Error);
    }
  }
);

/**
 * Bulk create projects (admin only)
 */
router.post(
  '/bulk',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ADMIN'] }),
  processRequest({
    body: BulkCreateProjectsInputSchema
  }),
  async (req, res: Response<BulkCreateProjectsResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    try {
      const { projects, userId } = req.body;
      const projectService = new ProjectService(prisma);

      const result = await projectService.bulkCreate({ inputs: projects, userId });

      res.status(201).json({
        created: result.created,
        errors: result.errors,
        summary: {
          totalRequested: projects.length,
          totalCreated: result.created.length,
          totalErrors: result.errors.length
        }
      });
    } catch (error) {
      throw new InternalServerError(
        'Failed to bulk create projects. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Share project with users
 */
router.post(
  '/:id/share/users',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: ProjectParamsSchema,
    body: ShareProjectWithUsersInputSchema
  }),
  async (req, res: Response<ShareProjectWithUsersResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectId = parseInt(req.params.id, 10);
      const { userIds } = req.body;
      const projectService = new ProjectService(prisma);

      // Check if user is the owner of the project
      const isOwner = await projectService.isProjectOwner({
        projectId,
        userId: req.user.id
      });

      if (!isOwner) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      const result = await projectService.shareWithUsers({ projectId, userIds });

      res.json({
        message: 'Project sharing completed',
        shared: result.shared,
        alreadyShared: result.alreadyShared,
        errors: result.errors
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to share project with users. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Remove project sharing with users
 */
router.delete(
  '/:id/share/users',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: ProjectParamsSchema,
    body: UnshareProjectWithUsersInputSchema
  }),
  async (req, res: Response<UnshareProjectWithUsersResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectId = parseInt(req.params.id, 10);
      const { userIds } = req.body;
      const projectService = new ProjectService(prisma);

      // Check if user is the owner of the project
      const isOwner = await projectService.isProjectOwner({
        projectId,
        userId: req.user.id
      });

      if (!isOwner) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      const result = await projectService.unshareWithUsers({ projectId, userIds });

      res.json({
        message: 'Project unsharing completed',
        unshared: result.unshared,
        notShared: result.notShared,
        errors: result.errors
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to unshare project with users. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Share project with groups
 */
router.post(
  '/:id/share/groups',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: ProjectParamsSchema,
    body: ShareProjectWithGroupsInputSchema
  }),
  async (req, res: Response<ShareProjectWithGroupsResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectId = parseInt(req.params.id, 10);
      const { groupIds } = req.body;
      const projectService = new ProjectService(prisma);

      // Check if user is the owner of the project
      const isOwner = await projectService.isProjectOwner({
        projectId,
        userId: req.user.id
      });

      if (!isOwner) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      const result = await projectService.shareWithGroups({ projectId, groupIds });

      res.json({
        message: 'Project sharing completed',
        shared: result.shared,
        alreadyShared: result.alreadyShared,
        errors: result.errors
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to share project with groups. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Remove project sharing with groups
 */
router.delete(
  '/:id/share/groups',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: ProjectParamsSchema,
    body: UnshareProjectWithGroupsInputSchema
  }),
  async (req, res: Response<UnshareProjectWithGroupsResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectId = parseInt(req.params.id, 10);
      const { groupIds } = req.body;
      const projectService = new ProjectService(prisma);

      // Check if user is the owner of the project
      const isOwner = await projectService.isProjectOwner({
        projectId,
        userId: req.user.id
      });

      if (!isOwner) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      const result = await projectService.unshareWithGroups({ projectId, groupIds });

      res.json({
        message: 'Project unsharing completed',
        unshared: result.unshared,
        notShared: result.notShared,
        errors: result.errors
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to unshare project with groups. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Set project publicity (public/private)
 */
router.put(
  '/:id/publicity',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: ProjectParamsSchema,
    body: SetProjectPublicityInputSchema
  }),
  async (req, res: Response<SetProjectPublicityResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }
    try {
      const projectId = parseInt(req.params.id, 10);
      const { isPublic } = req.body;
      const projectService = new ProjectService(prisma);

      // Check if user is the owner of the project
      const isOwner = await projectService.isProjectOwner({
        projectId,
        userId: req.user.id
      });

      if (!isOwner) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      const updatedProject = await projectService.setPublicity({ projectId, isPublic });

      res.json({
        message: `Project ${isPublic ? 'made public' : 'made private'} successfully`,
        project: updatedProject
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to update project publicity. Error: ' + error,
        error as Error
      );
    }
  }
);
