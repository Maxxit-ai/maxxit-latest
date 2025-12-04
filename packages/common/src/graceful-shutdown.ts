/**
 * Graceful Shutdown Handler
 * 
 * Ensures all resources are properly cleaned up before the process exits.
 */

type CleanupFunction = () => Promise<void>;

const cleanupFunctions: CleanupFunction[] = [];

/**
 * Register a cleanup function to be called on shutdown
 */
export function registerCleanup(fn: CleanupFunction) {
  cleanupFunctions.push(fn);
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(serviceName: string, server?: any) {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log(`⏳ ${serviceName} is already shutting down...`);
      return;
    }

    isShuttingDown = true;
    console.log(`\n🛑 ${serviceName} received ${signal}, starting graceful shutdown...`);

    // Close HTTP server first (stop accepting new requests)
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log(`✅ ${serviceName} HTTP server closed`);
          resolve();
        });
      });
    }

    // Run custom cleanup functions
    for (const cleanup of cleanupFunctions) {
      try {
        await cleanup();
      } catch (error) {
        console.error(`❌ Error during cleanup:`, error);
      }
    }

    console.log(`✅ ${serviceName} graceful shutdown complete`);
    process.exit(0);
  };

  // Handle termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error(`❌ ${serviceName} uncaught exception:`, error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(`❌ ${serviceName} unhandled rejection at:`, promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
}

