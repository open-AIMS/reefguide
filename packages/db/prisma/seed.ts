import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
// Note: other packages in this project do:
// import { PrismaClient } from '@reefguide/db';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function upsertMapLayersInfo() {
  const x = await prisma.mapLayer.upsert({
    where: { id: 'esri_world_imagery_firefly' },
    create: {
      id: 'esri_world_imagery_firefly',
      title: 'ESRI World Imagery Firefly',
      category: 'basemap',
      info_url: 'https://www.esri.com/',
      // REVIEW url array or not
      url: [
        'https://fly.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Firefly/MapServer/tile/{z}/{y}/{x}'
      ],
      url_type: 'XYZ',
      layer_options: {
        visible: false
      },
      attributions:
        'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    },
    update: {}
  });

  return [x];
}

async function main() {
  const infoLayers = await upsertMapLayersInfo();
  console.log(`${infoLayers.length} info map layers`);
  console.log(infoLayers);
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
