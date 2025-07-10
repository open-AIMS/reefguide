import { prisma, ProjectType } from '@reefguide/db';
import {
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  CreateProjectResponse,
  UpdateProjectResponse,
  GetProjectResponse,
  GetProjectsResponse,
  DeleteProjectResponse,
  BulkCreateProjectsInputSchema,
  BulkCreateProjectsResponse,
  ProjectParamsSchema,
  GetProjectsQuerySchema
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { z } from 'zod';
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

      // Users can only see their own projects unless they're admin
      const options = {
        type,
        name: req.query.name,
        limit,
        offset,
        userId: req.user.roles.includes('ADMIN') ? undefined : req.user.id
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

      // Users can only see their own projects unless they're admin
      const userId = req.user.roles.includes('ADMIN') ? undefined : req.user.id;

      const project = await projectService.getById({ id: projectId, userId });

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

      // Users can only update their own projects unless they're admin
      const userId = req.user.roles.includes('ADMIN') ? undefined : req.user.id;

      const project = await projectService.update({
        id: projectId,
        input: req.body,
        userId
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

      // Users can only delete their own projects unless they're admin
      const userId = req.user.roles.includes('ADMIN') ? undefined : req.user.id;

      const deleted = await projectService.delete({ id: projectId, userId });

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
