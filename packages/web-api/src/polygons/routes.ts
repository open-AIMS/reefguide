import express, { Response, Router } from 'express';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import { assertUserHasRoleMiddleware, userIsAdmin } from '../auth/utils';
import { NotFoundException, UnauthorizedException, InternalServerError } from '../exceptions';
import { prisma } from '@reefguide/db';
import {
  CreatePolygonInputSchema,
  CreatePolygonResponse,
  UpdatePolygonInputSchema,
  UpdatePolygonResponse,
  GetPolygonResponse,
  GetPolygonsResponse,
  DeletePolygonResponse,
  PolygonParamsSchema
} from '@reefguide/types';

require('express-async-errors');

export const router: Router = express.Router();

/**
 * Get a specific polygon by ID
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: PolygonParamsSchema
  }),
  async (req, res: Response<GetPolygonResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const polygonId = parseInt(req.params.id);

      const polygon = await prisma.polygon.findUnique({
        where: { id: polygonId },
        include: {
          user: {
            select: {
              id: true,
              email: true
            }
          },
          notes: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!polygon) {
        throw new NotFoundException('Polygon not found');
      }

      if (!userIsAdmin(req.user) && polygon.user_id !== req.user.id) {
        throw new UnauthorizedException('You do not have permission to view this polygon');
      }

      res.json({ polygon });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerError('Failed to get polygon. Error: ' + error, error as Error);
    }
  }
);

/**
 * Get all polygons for user, or all polygons if admin
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<GetPolygonsResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      let polygons;
      let total;

      if (userIsAdmin(req.user)) {
        // Admin gets all polygons
        polygons = await prisma.polygon.findMany();
        total = await prisma.polygon.count();
      } else {
        // Normal users get only their own polygons
        polygons = await prisma.polygon.findMany({
          where: { user_id: req.user.id }
        });
        total = await prisma.polygon.count({
          where: { user_id: req.user.id }
        });
      }

      res.json({
        polygons,
        pagination: {
          total,
          limit: polygons.length,
          offset: 0
        }
      });
    } catch (error) {
      throw new InternalServerError('Failed to get polygons. Error: ' + error, error as Error);
    }
  }
);

/**
 * Create a new polygon
 */
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    body: CreatePolygonInputSchema
  }),
  async (req, res: Response<CreatePolygonResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const userId = req.user.id;
      const { polygon } = req.body;

      const newPolygon = await prisma.polygon.create({
        data: {
          user_id: userId,
          polygon: polygon
        }
      });

      res.status(201).json({
        polygon: newPolygon
      });
    } catch (error) {
      throw new InternalServerError('Failed to create polygon. Error: ' + error, error as Error);
    }
  }
);

/**
 * Update a polygon by ID
 */
router.put(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: PolygonParamsSchema,
    body: UpdatePolygonInputSchema
  }),
  async (req, res: Response<UpdatePolygonResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const polygonId = parseInt(req.params.id);
      const { polygon } = req.body;

      const existingPolygon = await prisma.polygon.findUnique({
        where: { id: polygonId }
      });

      if (!existingPolygon) {
        throw new NotFoundException('Polygon not found');
      }

      if (!userIsAdmin(req.user) && existingPolygon.user_id !== req.user.id) {
        throw new UnauthorizedException('You do not have permission to update this polygon');
      }

      const updatedPolygon = await prisma.polygon.update({
        where: { id: polygonId },
        data: {
          polygon: polygon
        }
      });

      res.json({ polygon: updatedPolygon });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerError('Failed to update polygon. Error: ' + error, error as Error);
    }
  }
);

/**
 * Delete a polygon by ID
 */
router.delete(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: PolygonParamsSchema
  }),
  async (req, res: Response<DeletePolygonResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const polygonId = parseInt(req.params.id);

      const existingPolygon = await prisma.polygon.findUnique({
        where: { id: polygonId }
      });

      if (!existingPolygon) {
        throw new NotFoundException('Polygon not found');
      }

      if (!userIsAdmin(req.user) && existingPolygon.user_id !== req.user.id) {
        throw new UnauthorizedException('You do not have permission to delete this polygon');
      }

      await prisma.polygon.delete({
        where: { id: polygonId }
      });

      res.json({ message: 'Polygon deleted successfully' });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerError('Failed to delete polygon. Error: ' + error, error as Error);
    }
  }
);
