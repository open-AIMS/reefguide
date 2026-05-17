import { PrismaClient } from '@prisma/client';

export type MapLayerUpsert = Parameters<PrismaClient['mapLayer']['upsert']>[0];
