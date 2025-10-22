import { Prisma, prisma } from '@reefguide/db';
import {
  CreatePolygonInputSchema,
  CreatePolygonResponse,
  DeletePolygonResponse,
  GetPolygonResponse,
  GetPolygonsQuerySchema,
  GetPolygonsResponse,
  PolygonParamsSchema,
  PolygonWithRelations,
  UpdatePolygonInputSchema,
  UpdatePolygonResponse
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import { assertUserHasRoleMiddleware, userIsAdmin } from '../auth/utils';
import { InternalServerError, NotFoundException, UnauthorizedException } from '../exceptions';
import { userHasProjectAccess } from '../util';

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

      // Check permissions
      const isAdmin = userIsAdmin(req.user);
      const ownsPolygon = polygon.user_id === req.user.id;
      let hasProjectAccess = false;

      // Only check this if necessary
      if (!isAdmin && !ownsPolygon) {
        if (polygon.project_id) {
          hasProjectAccess = await userHasProjectAccess(req.user.id, polygon.project_id, isAdmin);
        }
      }

      if (!isAdmin && !ownsPolygon && !hasProjectAccess) {
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
 * Format polygons as single text value
 * @param polygon
 */
function formatNotes(polygon: PolygonWithRelations): string {
  return polygon.notes
    .map(note => {
      return `# ${note.created_at} ${note.user.email}\n${note.content.trim()}`;
    })
    .join('\n---\n');
}

/**
 * Wraps the polygons in a GeoJSON feature collection.
 * @param polygons
 */
function polygonsToGeoJSON(polygons: PolygonWithRelations[]): any {
  return {
    type: 'FeatureCollection',
    // TODO add bbox? https://datatracker.ietf.org/doc/html/rfc7946#section-5
    features: polygons.map(p => {
      return {
        type: 'Feature',
        // TODO what date format?
        // TODO add comments
        properties: {
          fid: p.id,
          createdAt: p.created_at,
          createdBy: p.user.email,
          notes: formatNotes(p)
        },
        geometry: p.polygon
      };
    })
  };
}

/**
 * Get all polygons based on user permissions and filters
 *
 * format - respond with a file in that format instead of GetPolygonsQuery JSON.
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    query: GetPolygonsQuerySchema
  }),
  async (req, res: Response<GetPolygonsResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const { projectId, onlyMine, format } = req.query;
      const isAdmin = userIsAdmin(req.user);

      let polygons;
      let total;

      // Build the base where clause
      const whereClause: Prisma.PolygonWhereInput = {};

      // Handle projectId filter
      if (projectId) {
        const projectIdNum = parseInt(projectId);

        // Verify user has access to the project (unless admin)
        if (!isAdmin) {
          const hasAccess = await userHasProjectAccess(req.user.id, projectIdNum, isAdmin);
          if (!hasAccess) {
            throw new UnauthorizedException('You do not have access to this project');
          }
        }

        whereClause.project_id = projectIdNum;
      }

      // Handle onlyMine filter
      if (onlyMine) {
        whereClause.user_id = req.user.id;
      } else if (!isAdmin && !projectId) {
        whereClause.OR = [
          // Polygons owned by user
          { user_id: req.user.id },
          // Polygons which are part of a project that the user either owns, or has had shared with them
          {
            project: {
              OR: [
                { is_public: { equals: true } },
                { user_id: { equals: req.user.id } },
                { userShares: { some: { user_id: { equals: req.user.id } } } },
                {
                  groupShares: {
                    some: {
                      group: {
                        OR: [
                          { members: { some: { user_id: { equals: req.user.id } } } },
                          { managers: { some: { user_id: { equals: req.user.id } } } }
                        ]
                      }
                    }
                  }
                }
              ]
            }
          }
        ];
      }

      // include user and notes relations when client asks for geojson
      const includeUserAndNotes = format === 'geojson';

      // Prisma include to mixin into queries
      const includeQuery = includeUserAndNotes
        ? {
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
          }
        : undefined;

      if (isAdmin && !projectId && !onlyMine) {
        // Admin with no filters gets all polygons
        polygons = await prisma.polygon.findMany(includeQuery);
        total = await prisma.polygon.count();
      } else {
        polygons = await prisma.polygon.findMany({
          where: whereClause,
          ...includeQuery
        });
        total = await prisma.polygon.count({
          where: whereClause
        });
      }

      if (format === 'geojson') {
        // technically content-type='application/geo+json' but just do json
        // user and notes included in query when geojson format specified.
        res.json(polygonsToGeoJSON(polygons as PolygonWithRelations[]));
      } else {
        res.json({
          polygons,
          pagination: {
            total,
            limit: polygons.length,
            offset: 0
          }
        });
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
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
      const { polygon, projectId } = req.body;

      const isAdmin = userIsAdmin(req.user);

      // If projectId is provided, validate user has access to the project
      if (projectId !== undefined) {
        const hasAccess = await userHasProjectAccess(userId, projectId, isAdmin);
        if (!hasAccess) {
          throw new UnauthorizedException('You do not have access to this project');
        }
      }

      const newPolygon = await prisma.polygon.create({
        data: {
          user_id: userId,
          polygon: polygon,
          project_id: projectId
        }
      });

      res.status(200).json({
        polygon: newPolygon
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
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
      const { polygon, projectId } = req.body;

      const existingPolygon = await prisma.polygon.findUnique({
        where: { id: polygonId }
      });

      if (!existingPolygon) {
        throw new NotFoundException('Polygon not found');
      }

      // Check if user has permission to update this polygon
      const isAdmin = userIsAdmin(req.user);
      const ownsPolygon = existingPolygon.user_id === req.user.id;

      let hasProjectAccess = false;
      if (existingPolygon.project_id) {
        hasProjectAccess = await userHasProjectAccess(
          req.user.id,
          existingPolygon.project_id,
          isAdmin
        );
      }

      if (!isAdmin && !ownsPolygon && !hasProjectAccess) {
        throw new UnauthorizedException('You do not have permission to update this polygon');
      }

      // If updating projectId, validate user has access to the new project
      if (projectId !== undefined) {
        const hasAccessToNewProject = await userHasProjectAccess(req.user.id, projectId, isAdmin);
        if (!hasAccessToNewProject) {
          throw new UnauthorizedException('You do not have access to the specified project');
        }
      }

      const updatedPolygon = await prisma.polygon.update({
        where: { id: polygonId },
        data: {
          polygon: polygon,
          ...(projectId !== undefined && { project_id: projectId })
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

      // Check if user has permission to delete this polygon
      const isAdmin = userIsAdmin(req.user);
      const ownsPolygon = existingPolygon.user_id === req.user.id;

      let hasProjectAccess = false;
      if (existingPolygon.project_id) {
        hasProjectAccess = await userHasProjectAccess(
          req.user.id,
          existingPolygon.project_id,
          isAdmin
        );
      }

      if (!isAdmin && !ownsPolygon && !hasProjectAccess) {
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
