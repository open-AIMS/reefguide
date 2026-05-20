import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Note: other packages in this project import statement is:
// import { PrismaClient } from '@reefguide/db';
// but within the db package, the import is:
import { PrismaClient } from '@prisma/client';

import { infoLayerDefs } from './seed/map_layers';
import { MapLayerUpsert } from './seed/seed-types';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Create Prisma upsert object for the layer seed data.
 *
 * TODO review and doc how update works
 *
 * @param layerCreate
 * @returns
 */
function createUpsert(layerCreate: MapLayerUpsert['create']): MapLayerUpsert {
  return {
    where: { id: layerCreate.id },
    create: layerCreate,
    update: {}
  };
}

/**
 * Upsert all info map layers
 */
async function upsertMapLayersInfo() {
  console.info(`Upserting ${infoLayerDefs.length} info map layers`);
  for (const layerDef of infoLayerDefs) {
    const upsert = createUpsert(layerDef);
    console.log('  ', layerDef.id);
    await prisma.mapLayer.upsert(upsert);
  }
}

async function main() {
  await upsertMapLayersInfo();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async e => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
