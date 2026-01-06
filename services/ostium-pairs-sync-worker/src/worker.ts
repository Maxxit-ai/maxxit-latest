/**
 * Ostium Pairs Sync Worker (Microservice)
 * Fetches available trading pairs from Ostium service and syncs them to ostium_available_pairs table
 * Interval: 1 hour (configurable via WORKER_INTERVAL)
 *
 * Purpose: Keep ostium_available_pairs table up to date with latest pairs and their parameters
 */

import dotenv from "dotenv";
import express from "express";
import axios from "axios";
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup, createHealthCheckHandler } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const PORT = process.env.PORT || 5010;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "86400000"); // 24 hours default
const OSTIUM_SERVICE_URL = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

let workerInterval: NodeJS.Timeout | null = null;
let isCycleRunning = false;

// Health check server
const app = express();
app.get("/health", createHealthCheckHandler("ostium-pairs-sync-worker", async () => {
  const dbHealthy = await checkDatabaseHealth();
  return {
    database: dbHealthy ? "connected" : "disconnected",
    interval: INTERVAL,
    isRunning: workerInterval !== null,
    isCycleRunning,
    timestamp: new Date().toISOString(),
  };
}));

const server = app.listen(PORT, () => {
  console.log(`🏥 Ostium Pairs Sync Worker health check on port ${PORT}`);
});

interface OstiumPair {
  id: string;
  from: string;
  to: string;
  group: {
    name: string;
  };
  maxLeverage: string | number;
  makerMaxLeverage?: string | number;
}

// Map group names from Ostium format to simplified format
function mapGroupName(ostiumGroup: string): string {
  const groupMap: { [key: string]: string } = {
    "crypto": "crypto",
    "forex": "forex",
    "commodities": "commodities",
    "indices": "indices",
    "stocks": "stocks",
  };
  return groupMap[ostiumGroup.toLowerCase()] || ostiumGroup.toLowerCase();
}

/**
 * Sync Ostium pairs from the service
 */
async function syncOstiumPairs() {
  if (isCycleRunning) {
    console.log("[OstiumPairsSync] ⏭️ Skipping cycle - previous cycle still running");
    return;
  }

  isCycleRunning = true;
  console.log("[OstiumPairsSync] ⏰ Starting Ostium pairs sync cycle...");
  console.log("[OstiumPairsSync] Started at:", new Date().toISOString());

  try {
    // Fetch pairs from Ostium service
    console.log(`[OstiumPairsSync] 📡 Fetching pairs from ${OSTIUM_SERVICE_URL}/ostium-pairs...`);
    const response = await axios.get(`${OSTIUM_SERVICE_URL}/ostium-pairs`, { timeout: 30000 });

    if (!response.data?.success || !response.data?.pairs) {
      throw new Error("Invalid response from Ostium service - missing pairs data");
    }

    const pairs = response.data.pairs as OstiumPair[];
    console.log(`[OstiumPairsSync] ✅ Fetched ${pairs.length} pairs from Ostium service`);

    let upsertCount = 0;
    let skipCount = 0;

    // Sync each pair to database
    for (const pair of pairs) {
      try {
        const pairId = parseInt(pair.id);
        const symbol = `${pair.from}/${pair.to}`;
        const maxLeverage = Math.floor(parseInt(pair.maxLeverage.toString()) / 100); 
        const makerMaxLeverage = pair.makerMaxLeverage
          ? Math.floor(parseInt(pair.makerMaxLeverage.toString()) / 100)
          : 0;
        const groupName = mapGroupName(pair.group.name);

        // Upsert to database
        await prisma.ostium_available_pairs.upsert({
          where: { id: pairId },
          update: {
            symbol,
            max_leverage: maxLeverage,
            maker_max_leverage: makerMaxLeverage,
            group: groupName,
            updated_at: new Date(),
          },
          create: {
            id: pairId,
            symbol,
            max_leverage: maxLeverage,
            maker_max_leverage: makerMaxLeverage,
            group: groupName,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });

        upsertCount++;
        console.log(`[OstiumPairsSync] ✅ Synced pair: ${symbol} (id: ${pairId}, group: ${groupName})`);
      } catch (error: any) {
        skipCount++;
        console.error(`[OstiumPairsSync] ❌ Failed to sync pair ${pair.id}:`, error.message);
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[OstiumPairsSync] 📊 SYNC SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Total Pairs: ${pairs.length}`);
    console.log(`  Upserted: ${upsertCount}`);
    console.log(`  Skipped: ${skipCount}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("[OstiumPairsSync] ✅ Ostium pairs sync cycle complete");
  } catch (error: any) {
    console.error("[OstiumPairsSync] ❌ Fatal error:", error.message);
    console.error("[OstiumPairsSync] Stack:", error.stack);
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  try {
    console.log("🚀 Ostium Pairs Sync Worker starting...");
    console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60} minutes)`);
    console.log(`🌐 Ostium Service URL: ${OSTIUM_SERVICE_URL}`);
    console.log("");

    console.log("📋 Data Sync Flow:");
    console.log("   1. Call Ostium service /ostium-pairs endpoint");
    console.log("   2. Extract pair data (id, symbol, leverage, group)");
    console.log("   3. Upsert into ostium_available_pairs table");
    console.log("");

    // Test database connection first
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error(
        "Database connection failed. Check DATABASE_URL environment variable."
      );
    }
    console.log("✅ Database connection: OK");

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Run immediately on startup
    await syncOstiumPairs();

    // Then run on interval
    workerInterval = setInterval(async () => {
      await syncOstiumPairs();
    }, INTERVAL);

    console.log("✅ Ostium Pairs Sync Worker started successfully");
  } catch (error: any) {
    console.error("[OstiumPairsSync] ❌ Failed to start worker:", error.message);
    console.error("[OstiumPairsSync] Stack:", error.stack);
    throw error; // Re-throw to be caught by caller
  }
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping Ostium Pairs Sync Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown("Ostium Pairs Sync Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[OstiumPairsSync] ❌ Worker failed to start:", error);
    console.error("[OstiumPairsSync] Stack:", error.stack);
    process.exit(1);
  });
}

export { syncOstiumPairs };

