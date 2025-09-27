import { prisma } from '@reefguide/db';
import { Express } from 'express';
import request from 'supertest';
import app from '../../src/apiSetup';
import { signJwt } from '../../src/auth/jwtUtils';
import { BASE_ROLES } from '../../src/auth/routes';
import { hashPassword } from '../../src/services/auth';

// Test user credentials
export const user1Email = 'testuser1@email.com';
export const user2Email = 'testuser2@email.com';
export const adminEmail = 'admin@email.com';

// Tokens (will be set during userSetup)
export let user1Token: string;
export let user2Token: string;
export let adminToken: string;

// User IDs (will be set during userSetup)
export let user1Id: number;
export let user2Id: number;
export let adminId: number;

export type TokenType = 'user1' | 'user2' | 'admin';

// Utility function to make authenticated requests
export const authRequest = (app: Express, tokenType: TokenType = 'user1') => {
  const token =
    tokenType === 'user2' ? user2Token : tokenType === 'admin' ? adminToken : user1Token;

  return {
    get: (url: string) =>
      request(app)
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json'),

    post: (url: string) =>
      request(app)
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json'),

    put: (url: string) =>
      request(app)
        .put(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json'),

    delete: (url: string) =>
      request(app)
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
  };
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

export const userSetup = async () => {
  const hashedPassword = await hashPassword('password123');
  // Create test users
  const user1 = await prisma.user.create({
    data: {
      email: user1Email,
      password: hashedPassword,
      roles: ['ANALYST', ...BASE_ROLES]
    }
  });
  user1Id = user1.id;

  const user2 = await prisma.user.create({
    data: {
      email: user2Email,
      password: hashedPassword,
      roles: ['ANALYST', ...BASE_ROLES]
    }
  });
  user2Id = user2.id;

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      password: hashedPassword,
      roles: ['ADMIN', ...BASE_ROLES]
    }
  });
  adminId = admin.id;

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
    id: admin.id,
    email: admin.email,
    roles: admin.roles
  });
};

// Export the app for tests
export { app };
