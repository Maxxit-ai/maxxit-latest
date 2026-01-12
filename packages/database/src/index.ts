/**
 * @maxxit/database
 * 
 * Centralized database access for all Maxxit services.
 * Provides singleton PrismaClient and database utilities.
 */


import { PrismaClient } from '@prisma/client';

// Global is used here to maintain a singleton instance across hot reloads in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  errorFormat: 'pretty',
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Gracefully disconnect Prisma Client
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return false;
  }
}

// Re-export Prisma types for convenience
export type { PrismaClient } from '@prisma/client';
export * from '@prisma/client';

// Export TradeQuotaService and types
export { TradeQuotaService, type QuotaReservationResult } from './trade-quota-service';

