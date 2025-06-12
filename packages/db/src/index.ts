import { PrismaClient } from '@prisma/client';
export * from '@prisma/client';

// Export a singleton instance
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});

export {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError
} from '@prisma/client/runtime/library';

// Export the constructor for cases where you need multiple instances
export { PrismaClient };
