import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Note: other packages in this project import statement is:
// import { PrismaClient } from '@reefguide/db';
// but within the db package, the import is:
import { PrismaClient } from '@prisma/client';

// TODO try TypeScript Project References again, had issues with turbo build vs tsc
// can't do normal depency because it creates a cycle.
// see: https://www.typescriptlang.org/docs/handbook/project-references.html
import type { LayerDef } from '../../types';
import { infoLayerDefs } from './seed/map_layers';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type MapLayerUpsert = Parameters<(typeof prisma)['mapLayer']['upsert']>[0];

function layerDefToUpsert(l: LayerDef): MapLayerUpsert {
  return {
    where: { id: l.id },
    create: {
      id: l.id,
      title: l.title,
      category: l.category,
      info_url: l.infoUrl,
      url: typeof l.url === 'string' ? [l.url] : l.url,
      url_type: l.urlType,
      // @ts-expect-error FIXME types
      layer_options: l.layerOptions,
      attributions: l.attributions
    },
    update: {}
  };
}

async function upsertMapLayersInfo() {
  console.info(`Upserting ${infoLayerDefs.length} info map layers`);
  for (const layerDef of infoLayerDefs) {
    const upsert = layerDefToUpsert(layerDef);
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
