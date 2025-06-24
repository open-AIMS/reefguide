import { prisma } from '@reefguide/db';
import {
  CriteriaRangeOutput,
  dataSpecificationUpdateInputSchema,
  DataSpecificationUpdateRequestResponse,
  DataSpecificationUpdateResponse,
  ListRegionsResponse,
  UpdateCriteriaInput
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { z } from 'zod';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import { assertUserIsAdminMiddleware } from '../auth/utils';
import { BadRequestException, InternalServerError, NotFoundException } from '../exceptions';
import { initialiseAdmins } from '../initialise';
import { getDataSpecificationService } from '../services/dataSpec';

require('express-async-errors');
export const router: Router = express.Router();

/**
 * Launch a data specification update job.
 * This endpoint allows admins to trigger a data specification update job
 */
router.post(
  '/data-specification-update',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (req, res: Response<DataSpecificationUpdateRequestResponse>) => {
    if (!req.user) {
      throw new InternalServerError('User object was not available after authorization.');
    }

    const dataSpecService = getDataSpecificationService();
    const { jobId, message } = await dataSpecService.createDataSpecificationUpdateJob();

    res.status(200).json({
      jobId,
      message
    });
  }
);

/**
 * Update the data specification (criteria, regions, and their relationships)
 *
 * NOTE: this will delete any regions or criteria that are not provided in the
 * request.
 */
router.post(
  '/data-specification',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    body: dataSpecificationUpdateInputSchema
  }),
  async (req, res: Response<DataSpecificationUpdateResponse>) => {
    const { regions } = req.body;

    try {
      const result = await prisma.$transaction(async tx => {
        // Collect all unique criteria from all regions
        const allCriteria = new Map<string, UpdateCriteriaInput>();
        regions.forEach(region => {
          region.criteria.forEach(criteria => {
            allCriteria.set(criteria.name, criteria);
          });
        });

        const providedRegionNames = new Set(regions.map(r => r.name));
        const providedCriteriaNames = new Set(allCriteria.keys());

        // 1. Delete regions not in the provided list (cascades to regional_criteria)
        await tx.region.deleteMany({
          where: {
            name: {
              notIn: Array.from(providedRegionNames)
            }
          }
        });

        // 2. Delete criteria not in the provided list (cascades to regional_criteria)
        await tx.criteria.deleteMany({
          where: {
            name: {
              notIn: Array.from(providedCriteriaNames)
            }
          }
        });

        // 3. Upsert all criteria
        const criteriaResults = await Promise.all(
          Array.from(allCriteria.values()).map(criteriaData =>
            tx.criteria.upsert({
              where: { name: criteriaData.name },
              update: {
                display_title: criteriaData.display_title,
                display_subtitle: criteriaData.display_subtitle || null,
                units: criteriaData.units || null,
                min_tooltip: criteriaData.min_tooltip || null,
                max_tooltip: criteriaData.max_tooltip || null,
                payload_prefix: criteriaData.payload_prefix,
                updated_at: new Date()
              },
              create: {
                name: criteriaData.name,
                display_title: criteriaData.display_title,
                display_subtitle: criteriaData.display_subtitle || null,
                units: criteriaData.units || null,
                min_tooltip: criteriaData.min_tooltip || null,
                max_tooltip: criteriaData.max_tooltip || null,
                payload_prefix: criteriaData.payload_prefix
              }
            })
          )
        );

        // 4. Upsert all regions and their criteria
        let regionalCriteriaCount = 0;
        const regionResults = await Promise.all(
          regions.map(async regionData => {
            // Upsert the region
            const region = await tx.region.upsert({
              where: { name: regionData.name },
              update: {
                display_name: regionData.display_name,
                description: regionData.description || null,
                updated_at: new Date()
              },
              create: {
                name: regionData.name,
                display_name: regionData.display_name,
                description: regionData.description || null
              }
            });

            // Delete existing regional criteria for this region to handle removals
            await tx.regionalCriteria.deleteMany({
              where: { region_id: region.id }
            });

            // Create new regional criteria
            const regionalCriteriaResults = await Promise.all(
              regionData.criteria.map(async criteriaData => {
                // Find the criteria by name
                const criteria = await tx.criteria.findUnique({
                  where: { name: criteriaData.name }
                });

                if (!criteria) {
                  throw new BadRequestException(`Criteria '${criteriaData.name}' not found`);
                }

                return tx.regionalCriteria.create({
                  data: {
                    region_id: region.id,
                    criteria_id: criteria.id,
                    min_val: criteriaData.min_val,
                    max_val: criteriaData.max_val,
                    default_min_val: criteriaData.default_min_val,
                    default_max_val: criteriaData.default_max_val
                  }
                });
              })
            );

            regionalCriteriaCount += regionalCriteriaResults.length;
            return region;
          })
        );

        return {
          criteria_count: criteriaResults.length,
          regions_count: regionResults.length,
          regional_criteria_count: regionalCriteriaCount
        };
      });

      res.status(200).json({
        message: 'Data specification updated successfully',
        updated: result
      });
    } catch (error) {
      throw new InternalServerError(
        'Failed to update data specification. Error: ' + error,
        error as Error
      );
    }
  }
);
/**
 * Get criteria ranges for a specific region
 */
router.get(
  '/criteria/:region/ranges',
  passport.authenticate('jwt', { session: false }),
  processRequest({
    params: z.object({ region: z.string() })
  }),
  async (req, res: Response<CriteriaRangeOutput>) => {
    const regionName = req.params.region;

    try {
      const region = await prisma.region.findUnique({
        where: { name: regionName },
        include: {
          criteria: {
            include: {
              criteria: true
            }
          }
        }
      });

      if (!region) {
        throw new NotFoundException('Region not found');
      }

      const output: CriteriaRangeOutput = {};

      region.criteria.forEach(regionCriteria => {
        const criteria = regionCriteria.criteria;
        output[criteria.name] = {
          id: criteria.name,
          min_val: regionCriteria.min_val,
          max_val: regionCriteria.max_val,
          display_title: criteria.display_title,
          display_subtitle: criteria.display_subtitle,
          units: criteria.units,
          min_tooltip: criteria.min_tooltip,
          max_tooltip: criteria.max_tooltip,
          default_min_val: regionCriteria.default_min_val,
          default_max_val: regionCriteria.default_max_val,
          payload_property_prefix: criteria.payload_prefix
        };
      });

      res.json(output);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerError(
        'Failed to get criteria ranges. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Get all available regions with basic info
 */
router.get(
  '/regions',
  passport.authenticate('jwt', { session: false }),
  async (_req, res: Response<ListRegionsResponse>) => {
    try {
      const regions = await prisma.region.findMany({
        include: {
          _count: {
            select: { criteria: true }
          }
        },
        orderBy: { name: 'asc' }
      });

      const formattedRegions = regions.map(region => ({
        name: region.name,
        display_name: region.display_name,
        description: region.description,
        criteria_count: region._count.criteria
      }));

      res.json({ regions: formattedRegions });
    } catch (error) {
      throw new InternalServerError('Failed to fetch regions. Error: ' + error, error as Error);
    }
  }
);

/**
 * Forces the DB to perform its seed initialisation
 */
router.get(
  '/init',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (_req, res) => {
    // if the user is admin, allow forceful re-init in case of out of date admin
    // or other service creds
    await initialiseAdmins();
    res.status(200).send();
    return;
  }
);

/**
 * DEPRECATED: The below endpoints are deprecated and will be removed in a
 * future release.
 */

router.post(
  '/scale',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({}),
  async (_req, _res) => {
    throw new BadRequestException('Deprecated endpoint.');
  }
);

router.get(
  '/status',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (_req, _res: Response) => {
    throw new BadRequestException('Deprecated endpoint.');
  }
);

router.post(
  '/redeploy',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (_req, _res) => {
    throw new BadRequestException('Deprecated endpoint.');
  }
);
