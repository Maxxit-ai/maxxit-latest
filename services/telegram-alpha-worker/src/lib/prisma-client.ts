/**
 * Singleton Prisma Client
 * 
 * This ensures only one instance of PrismaClient exists across the application,
 * preventing connection pool exhaustion and improving performance.
 */

import { PrismaClient } from '@prisma/client';

// Global is used here to maintain a singleton instance across hot reloads in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
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

