import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/*
This is invoked with all prisma commands (or at least generate|db push|db seed)
DATABASE_URL may be undefined for generate, so we avoid throwing in that case.
Otherwise, it will break the build & deploy.

This became an issue with the Prisma update and creation of this file.
However, there was a message indicating this file should be created.
*/
let databaseUrl: string;
try {
  databaseUrl = env('DATABASE_URL');

  // check for blank strings
  if (databaseUrl.length < 10) {
    throw new Error('DATABASE_URL is too short!');
  }

  console.log('DATABASE_URL found (prisma.config.ts)');
} catch (e: unknown) {
  if (
    e instanceof Error &&
    e.name === 'PrismaConfigEnvError' &&
    e.message.startsWith('Missing required environment variable')
  ) {
    // DATABASE_URL not required for prisma generate
    if (process.argv.at(-1) === 'generate') {
      console.warn(
        'DATABASE_URL not found within prisma.config.ts, but not needed for prisma generate'
      );

      // hint at where this was defined in case Prisma tries to use it
      databaseUrl = 'DATABASE_URL-not-found_prisma-config';
    } else {
      throw e;
    }
  } else {
    throw e;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  engine: 'classic',
  datasource: {
    // used by push, but not seed?
    url: databaseUrl
  }
});
