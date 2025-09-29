import { prisma } from '@reefguide/db';
import {
  CreateUserSchema,
  ListUserLogsResponse,
  SearchUsersQuerySchema,
  SearchUsersResponse,
  UpdateUserPasswordSchema,
  UpdateUserRolesSchema,
  UserResponse
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { z } from 'zod';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import { assertUserIsAdminMiddleware } from '../auth/utils';
import { handlePrismaError, NotFoundException } from '../exceptions';
import { changePassword, registerUser } from '../services/auth';

require('express-async-errors');
export const router: Router = express.Router();

/**
 * Get all users (admin only)
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (req, res: Response<UserResponse[]>) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          roles: true
        }
      });
      res.json(users);
    } catch (error) {
      handlePrismaError(error, 'Failed to fetch users.');
    }
  }
);

/**
 * Get a specific user by ID (admin only)
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({ params: z.object({ id: z.string() }) }),
  async (req, res: Response<UserResponse>) => {
    const userId = parseInt(req.params.id);

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          roles: true
        }
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      res.json(user);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Failed to fetch users.');
    }
  }
);

/**
 * Create a new user (admin only)
 */
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    body: CreateUserSchema
  }),
  async (req, res: Response<UserResponse>) => {
    const { email, password, roles = [] } = req.body;
    // Create the user
    const newUserId = await registerUser({ email, password, roles });
    res.status(200).json({ id: newUserId });
  }
);

/**
 * Update user roles (admin only)
 */
router.put(
  '/:id/roles',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    body: UpdateUserRolesSchema,
    params: z.object({ id: z.string() })
  }),
  async (req, res: Response<UserResponse>) => {
    const userId = parseInt(req.params.id);
    const { roles } = req.body;

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { roles },
        select: {
          id: true,
          email: true,
          roles: true
        }
      });

      // and add update to log
      await prisma.userLog.create({
        data: { action: 'UPDATED', userId: user.id }
      });

      res.json(user);
    } catch (error) {
      handlePrismaError(error, 'Failed to update user roles.');
    }
  }
);

/**
 * Update user password (admin only)
 */
router.put(
  '/:id/password',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    body: UpdateUserPasswordSchema
  }),
  async (req, res: Response<UserResponse>) => {
    const userId = parseInt(req.params.id);
    const { password } = req.body;

    await changePassword({ id: userId, password });

    // and add password update to log
    await prisma.userLog.create({
      data: { action: 'CHANGE_PASSWORD', userId: userId }
    });

    res.status(200).send();
  }
);

/**
 * Delete a user (admin only)
 */
router.delete(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (req, res) => {
    const userId = parseInt(req.params.id);

    try {
      await prisma.user.delete({
        where: { id: userId }
      });

      res.status(204).send();
    } catch (error) {
      handlePrismaError(error, 'Failed to delete user.');
    }
  }
);

/**
 * Get user logs - optionally filter by a userId if provided.
 *
 * Pagination is implemented with page/limit.
 *
 */
router.get(
  '/utils/log',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    query: z.object({
      userId: z.string().optional(),
      page: z.string().default('1'),
      limit: z.string().default('50')
    })
  }),
  async (req, res: Response<ListUserLogsResponse>) => {
    // Process request seems to think these are optional - which is not correct
    const page = Math.max(1, parseInt(req.query.page!));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit!)));
    const skip = (page - 1) * limit;

    const where = {
      ...(req.query.userId ? { userId: parseInt(req.query.userId) } : {})
    };

    const [logs, total] = await Promise.all([
      prisma.userLog.findMany({
        where,
        include: { user: { select: { roles: true, id: true, email: true } } },
        orderBy: { time: 'desc' },
        skip,
        take: limit
      }),
      prisma.userLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  }
);

/**
 * Search users by email (fuzzy search)
 * Returns results ordered by relevance (exact match > starts with > contains)
 */
router.get(
  '/search',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    query: SearchUsersQuerySchema
  }),
  async (req, res: Response<SearchUsersResponse>) => {
    const query = req.query.q!.toLowerCase().trim();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit!)));

    try {
      // Fetch all matching users
      const users = await prisma.user.findMany({
        where: {
          email: {
            contains: query,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          email: true,
          roles: true
        },
        take: limit * 3 // Get extra results for sorting
      });

      // Sort by relevance
      const sortedUsers = users.sort((a, b) => {
        const aEmail = a.email.toLowerCase();
        const bEmail = b.email.toLowerCase();

        // Exact match wins
        if (aEmail === query) return -1;
        if (bEmail === query) return 1;

        // Starts with query comes next
        const aStarts = aEmail.startsWith(query);
        const bStarts = bEmail.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;

        // Then sort by position of match (earlier is better)
        const aIndex = aEmail.indexOf(query);
        const bIndex = bEmail.indexOf(query);
        if (aIndex !== bIndex) return aIndex - bIndex;

        // Finally, sort alphabetically
        return aEmail.localeCompare(bEmail);
      });

      // Return only the requested limit
      res.json(sortedUsers.slice(0, limit));
    } catch (error) {
      handlePrismaError(error, 'Failed to search users.');
    }
  }
);
