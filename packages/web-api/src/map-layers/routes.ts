import { prisma } from '@reefguide/db';
import { GetMapLayersResponse } from '@reefguide/types';
import express, { Response, Router } from 'express';
import { passport } from '../auth/passportConfig';
import { deleteNullProperties } from '../util';

export const router: Router = express.Router();

/**
 * Get all map layers
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (req, res: Response<GetMapLayersResponse>) => {
    const layers = await prisma.mapLayer.findMany({
      // remove DB private id, layerId used by app code
      omit: { id: true },
      orderBy: { zIndex: 'asc' }
    });

    for (const layer of layers) {
      deleteNullProperties(layer);
    }

    return res.status(200).json({ layers });
  }
);
