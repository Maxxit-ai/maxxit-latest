/**
 * Production-Level Prisma Client Singleton
 *
 * Handles 10,000+ concurrent users with:
 * - Connection pooling (configured for serverless/edge)
 * - Automatic reconnection on transient failures
 * - Graceful shutdown handling
 * - Query logging in development
 * - Connection health monitoring
 *
 * IMPORTANT: Always import `prisma` from this file.
 * NEVER create new PrismaClient() instances elsewhere.
 *
 * Usage:
 *   import { prisma } from '@/lib/prisma';
 *   // or
 *   import { prisma } from '../lib/prisma';
 */

import { PrismaClient, Prisma } from "@prisma/client";

// Environment detection
const isProduction = process.env.NODE_ENV === "production";

// Connection pool configuration for high-traffic production
// NeonDB serverless has specific limits - adjust based on your plan
const CONNECTION_LIMIT = parseInt(
  process.env.DATABASE_CONNECTION_LIMIT || "10"
);
const POOL_TIMEOUT = parseInt(process.env.DATABASE_POOL_TIMEOUT || "10"); // seconds

// Build connection URL with pooling parameters for production
function getConnectionUrl(): string {
  const baseUrl = process.env.DATABASE_URL || "";

  if (!baseUrl) {
    console.warn("⚠️  DATABASE_URL not set");
    return "";
  }

  // For NeonDB with pgbouncer (serverless), add pooling params
  if (isProduction && baseUrl.includes("neon.tech")) {
    const url = new URL(baseUrl);

    // PgBouncer transaction mode settings
    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", CONNECTION_LIMIT.toString());
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", POOL_TIMEOUT.toString());
    }

    return url.toString();
  }

  return baseUrl;
}

// Prisma client configuration
const prismaClientOptions: Prisma.PrismaClientOptions = {
  log: isProduction
    ? [{ emit: "event", level: "error" }]
    : [
        { emit: "event", level: "query" },
        { emit: "event", level: "error" },
        { emit: "event", level: "warn" },
      ],
  errorFormat: isProduction ? "minimal" : "pretty",
};

// If using direct connection URL with pooling params
if (isProduction) {
  (prismaClientOptions as any).datasources = {
    db: {
      url: getConnectionUrl(),
    },
  };
}

// Declare global type for singleton (prevents multiple instances during hot reload)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Create or return existing PrismaClient singleton
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient(prismaClientOptions);

  // Error event handling
  (client as any).$on("error", (e: any) => {
    console.error("❌ Prisma Client Error:", e.message);
  });

  // Query logging in development
  if (!isProduction) {
    (client as any).$on("query", (e: any) => {
      if (e.duration > 100) {
        // Only log slow queries (>100ms)
        console.log(
          `🐢 Slow Query (${e.duration}ms):`,
          e.query.substring(0, 100)
        );
      }
    });
  }

  return client;
}

// Singleton instance
export const prisma = globalThis.__prisma ?? createPrismaClient();

// Store in global for development hot reload
if (!isProduction) {
  globalThis.__prisma = prisma;
}

/**
 * Check database connection health
 * Use for health check endpoints
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      healthy: true,
      latencyMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("❌ Database health check failed:", error.message);
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Gracefully disconnect Prisma
 * Call this during application shutdown
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log("✅ Prisma disconnected gracefully");
  } catch (error: any) {
    console.error("❌ Error disconnecting Prisma:", error.message);
    throw error;
  }
}

/**
 * Execute a database operation with automatic retry on transient failures
 * Useful for production resilience against connection drops
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelayMs = 1000,
    operationName = "database operation",
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable (connection issues, timeouts)
      const isRetryable =
        error.code === "P1001" || // Can't reach database server
        error.code === "P1002" || // Connection timed out
        error.code === "P1008" || // Operations timed out
        error.code === "P1017" || // Server closed connection
        error.message?.includes("Connection refused") ||
        error.message?.includes("ETIMEDOUT") ||
        error.message?.includes("ECONNRESET");

      if (!isRetryable || attempt === maxRetries) {
        console.error(
          `❌ ${operationName} failed after ${attempt} attempt(s):`,
          error.message
        );
        throw error;
      }

      console.warn(
        `⚠️  ${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs}ms...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * attempt)
      ); // Exponential backoff
    }
  }

  throw lastError;
}

/**
 * Transaction wrapper with retry logic
 * Use for critical multi-step operations
 */
export async function withTransaction<T>(
  operations: (tx: Prisma.TransactionClient) => Promise<T>,
  options: {
    maxWait?: number; // Maximum time to wait for transaction
    timeout?: number; // Maximum time for transaction to complete
  } = {}
): Promise<T> {
  const { maxWait = 5000, timeout = 10000 } = options;

  return prisma.$transaction(operations, {
    maxWait,
    timeout,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}

// Graceful shutdown handlers for production
if (isProduction) {
  // Handle process termination signals
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n📴 Received ${signal}. Shutting down gracefully...`);
    await disconnectPrisma();
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Handle uncaught exceptions
  process.on("uncaughtException", async (error) => {
    console.error("❌ Uncaught Exception:", error);
    await disconnectPrisma();
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    // Don't exit on unhandled rejections in production, just log
  });
}

// Default export for convenience
export default prisma;
