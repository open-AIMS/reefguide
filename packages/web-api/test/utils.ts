import { prisma } from '@reefguide/db';
import bcryptjs from 'bcryptjs';
import { signJwt } from '../src/auth/jwtUtils';

export const user1Email = 'user1@example.com';
export const user2Email = 'user2@example.com';
export const adminEmail = 'admin@example.com';
export const password = 'password123';

// tokens
export let user1Token: string;
export let user2Token: string;
export let adminToken: string;

export const userSetup = async () => {
  // Clear the users table before adding test users
  await prisma.user.deleteMany({});

  const hashedPassword = await bcryptjs.hash(password, 10);

  // Create two normal users
  const user1 = await prisma.user.create({
    data: {
      email: user1Email,
      password: hashedPassword,
      roles: []
    }
  });

  const user2 = await prisma.user.create({
    data: {
      email: user2Email,
      password: hashedPassword,
      roles: []
    }
  });

  // Create one admin user
  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      password: hashedPassword,
      roles: ['ADMIN']
    }
  });

  // Generate tokens
  user1Token = signJwt({
    id: user1.id,
    email: user1.email,
    roles: user1.roles
  });

  user2Token = signJwt({
    id: user2.id,
    email: user2.email,
    roles: user2.roles
  });

  adminToken = signJwt({
    id: adminUser.id,
    email: adminUser.email,
    roles: adminUser.roles
  });
};

export const clearDbs = async () => {
  const dbUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  if (!dbUrl?.includes('localhost') || !directUrl?.includes('localhost')) {
    throw new Error(
      'Should not clear DB which is not on localhost...not comfortable proceeding with tests. Check env file.'
    );
  }
  // Delete all data from db
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter(name => name !== '_prisma_migrations')
    .map(name => `"public"."${name}"`)
    .join(', ');

  try {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  } catch (error) {
    console.log({ error });
  }
};
