import { prisma } from '@reefguide/db';
import { GetMapLayersResponse } from '@reefguide/types';
import express, { Response, Router } from 'express';
import { passport } from '../auth/passportConfig';

export const router: Router = express.Router();

/**
 * Get all map layers
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<GetMapLayersResponse>) => {
    const layers = await prisma.mapLayer.findMany({
      orderBy: { title: 'asc' }
    });
    res.status(200).json({ layers });
  }
);
