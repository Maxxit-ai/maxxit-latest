/**
 * Prisma Client Singleton
 * 
 * Re-exports the production-level Prisma client from root.
 * Use this import throughout the codebase:
 * 
 *   import { prisma } from '@/lib/prisma';
 *   // or
 *   import { prisma } from '../lib/prisma';
 * 
 * NEVER create new PrismaClient() instances elsewhere!
 */

export { prisma, checkDatabaseHealth, disconnectPrisma, withRetry, withTransaction } from '../prisma';

// Re-export prisma as default for convenience
export { default } from '../prisma';

