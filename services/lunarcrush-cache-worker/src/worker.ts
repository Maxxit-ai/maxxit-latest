/**
 * LunarCrush Market Data Cache Worker (Microservice)
 * Fetches and caches market data for all tokens in venue_markets
 * Interval: 24 hours (configurable via WORKER_INTERVAL)
 * 
 */

import dotenv from "dotenv";
import express from "express";
import axios from "axios";
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup, createHealthCheckHandler } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const PORT = process.env.PORT || 5009;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "86400000"); // 24 hours default
const API_BASE_URL = "https://lunarcrush.com/api4";

// LunarCrush API endpoints by asset group
const LUNARCRUSH_ENDPOINTS: { [key: string]: string } = {
  crypto: "coins",
  stocks: "stocks",
};

let workerInterval: NodeJS.Timeout | null = null;
let isCycleRunning = false;

interface LunarCrushMetrics {
  galaxy_score: number | null;
  alt_rank: number | null;
  social_volume_24h: number | null;
  sentiment: number | null;
  percent_change_24h: number | null;
  volatility: number | null;
  price: number | null;
  volume_24h: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  social_dominance: number | null;
  market_dominance: number | null;
  interactions_24h: number | null;
  galaxy_score_previous: number | null;
  alt_rank_previous: number | null;
}

// Health check server
const app = express();
app.get("/health", createHealthCheckHandler("lunarcrush-cache-worker", async () => {
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
  console.log(`🏥 LunarCrush Cache Worker health check on port ${PORT}`);
});

/**
 * Fetch raw metrics from LunarCrush API v4
 * Supports multiple asset types: crypto, stocks, forex, commodities, indices
 */
async function fetchMetricsFromAPI(
  symbol: string,
  assetGroup: string = "crypto"
): Promise<{
  data: LunarCrushMetrics;
}> {
  const apiKey = process.env.LUNARCRUSH_API_KEY;
  if (!apiKey) {
    throw new Error("LUNARCRUSH_API_KEY not configured");
  }

  // Determine endpoint based on asset group
  const groupLower = assetGroup.toLowerCase();
  const endpoint = LUNARCRUSH_ENDPOINTS[groupLower];
  
  if (!endpoint) {
    console.warn(`[LunarCrushCache] ⚠️  Unsupported asset group: ${assetGroup}. Defaulting to crypto.`);
  }
  
  const finalEndpoint = endpoint || "coins";
  const apiEndpoint = `${API_BASE_URL}/public/${finalEndpoint}/list/v1`;

  console.log(`[LunarCrushCache] 🔗 Fetching from endpoint: ${apiEndpoint} (group: ${assetGroup})`);

  const response = await axios.get(apiEndpoint, {
    params: { key: apiKey }
  });

  if (!response.data?.data) {
    throw new Error(`No data returned from LunarCrush API for ${symbol} (group: ${assetGroup})`);
  }

  const asset = response.data.data.find(
    (item: any) => item.symbol && item.symbol.toUpperCase() === symbol.toUpperCase()
  );

  if (!asset) {
    throw new Error(`No data found for ${symbol} in LunarCrush API (group: ${assetGroup})`);
  }

  const data: LunarCrushMetrics = {
    galaxy_score: asset.galaxy_score ?? null,
    alt_rank: asset.alt_rank ?? null,
    social_volume_24h: asset.social_volume_24h ?? null,
    sentiment: asset.sentiment ?? null,
    percent_change_24h: asset.percent_change_24h ?? null,
    volatility: asset.volatility ?? null,
    price: asset.price ?? null,
    volume_24h: asset.volume_24h ?? null,
    market_cap: asset.market_cap ?? null,
    market_cap_rank: asset.market_cap_rank ?? null,
    social_dominance: asset.social_dominance ?? null,
    market_dominance: asset.market_dominance ?? null,
    interactions_24h: asset.interactions_24h ?? null,
    galaxy_score_previous: asset.galaxy_score_previous ?? null,
    alt_rank_previous: asset.alt_rank_previous ?? null,
  };

  return { data };
}

/**
 * Cache market data for all pairs in ostium_available_pairs
 */
async function cacheMarketData() {
  if (isCycleRunning) {
    console.log("[LunarCrushCache] ⏭️ Skipping cycle - previous cycle still running");
    return;
  }

  isCycleRunning = true;
  console.log("[LunarCrushCache] ⏰ Starting market data caching cycle...");
  console.log("[LunarCrushCache] Started at:", new Date().toISOString());

  try {
    // Check if LunarCrush API key is configured
    if (!process.env.LUNARCRUSH_API_KEY) {
      console.log("[LunarCrushCache] ⚠️  LUNARCRUSH_API_KEY not configured");
      console.log("[LunarCrushCache] ⏭️  Skipping cycle");
      return;
    }

    // Get all pairs from ostium_available_pairs table
    const ostiumPairs = await prisma.ostium_available_pairs.findMany();
    console.log(`[LunarCrushCache] 📊 Found ${ostiumPairs.length} Ostium pairs to fetch metrics for`);

    if (ostiumPairs.length === 0) {
      console.log("[LunarCrushCache] ℹ️  No pairs found in ostium_available_pairs table");
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    let skipCount = 0;

    // Rate limiting: LunarCrush allows 10 requests per minute
    const REQUESTS_PER_MINUTE = 10;
    const MINUTE_MS = 60 * 1000;
    let requestsInCurrentMinute = 0;
    let minuteWindowStart = Date.now();

    // Process each pair
    for (let i = 0; i < ostiumPairs.length; i++) {
      const pair = ostiumPairs[i];
      const tokenSymbol = pair.symbol.split('/')[0]; // Extract token from symbol (e.g., "BTC" from "BTC/USD")
      
      // Check if a full minute has passed and reset counter
      const timeSinceWindowStart = Date.now() - minuteWindowStart;
      if (timeSinceWindowStart >= MINUTE_MS) {
        requestsInCurrentMinute = 0;
        minuteWindowStart = Date.now();
      }

      // Check if we need to wait for rate limit reset
      if (requestsInCurrentMinute >= REQUESTS_PER_MINUTE) {
        const waitTime = MINUTE_MS - (Date.now() - minuteWindowStart);
        if (waitTime > 0) {
          console.log(`[LunarCrushCache] ⏳ Rate limit reached (${REQUESTS_PER_MINUTE} requests). Waiting ${Math.ceil(waitTime / 1000)}s before continuing...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        // Reset counter for new minute window after waiting
        requestsInCurrentMinute = 0;
        minuteWindowStart = Date.now();
      }
      
      try {
        console.log(`[LunarCrushCache] 🔄 [${i + 1}/${ostiumPairs.length}] Fetching data for ${pair.symbol} (group: ${pair.group})... (${requestsInCurrentMinute + 1}/${REQUESTS_PER_MINUTE} requests this minute)`);

        // Increment counter before API call to track all API attempts
        requestsInCurrentMinute++;
        const { data } = await fetchMetricsFromAPI(tokenSymbol, pair.group || "crypto");

        // Update ostium_available_pairs with LunarCrush metrics
        await prisma.ostium_available_pairs.update({
          where: { id: pair.id },
          data: {
            galaxy_score: data.galaxy_score,
            alt_rank: data.alt_rank,
            social_volume_24h: data.social_volume_24h,
            sentiment: data.sentiment,
            percent_change_24h: data.percent_change_24h,
            volatility: data.volatility,
            price: data.price,
            volume_24h: data.volume_24h,
            market_cap: data.market_cap,
            market_cap_rank: data.market_cap_rank,
            social_dominance: data.social_dominance,
            market_dominance: data.market_dominance,
            interactions_24h: data.interactions_24h,
            galaxy_score_previous: data.galaxy_score_previous,
            alt_rank_previous: data.alt_rank_previous,
            updated_at: new Date(),
          },
        });

        successCount++;
        console.log(`[LunarCrushCache] ✅ Updated metrics for ${pair.symbol}`);

        // Small delay between requests to avoid hammering the API
        if (i < ostiumPairs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error: any) {
        failureCount++;
        console.error(`[LunarCrushCache] ❌ Failed to fetch metrics for ${pair.symbol}:`, error.message);
        // Note: requestsInCurrentMinute was already incremented before the API call
        // so failed requests still count toward rate limit
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[LunarCrushCache] 📊 METRICS UPDATE SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Total Pairs: ${ostiumPairs.length}`);
    console.log(`  Updated: ${successCount}`);
    console.log(`  Failures: ${failureCount}`);
    console.log(`  Skipped: ${skipCount}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("[LunarCrushCache] ✅ Market data caching cycle complete");
  } catch (error: any) {
    console.error("[LunarCrushCache] ❌ Fatal error:", error.message);
    console.error("[LunarCrushCache] Stack:", error.stack);
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  try {
    console.log("🚀 LunarCrush Cache Worker starting...");
    console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60 / 60} hours)`);
    console.log("");

    console.log("📋 Data Caching Flow:");
    console.log("   1. Fetch all pairs from ostium_available_pairs table");
    console.log("   2. For each pair, call LunarCrush API based on asset group");
    console.log("   3. Update ostium_available_pairs with LunarCrush metrics");
    console.log("   4. Respect 10 requests/minute rate limit");
    console.log("   5. Cache metrics in single table (no separate cache table)");
    console.log("");

    // Test database connection first
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error(
        "Database connection failed. Check DATABASE_URL environment variable."
      );
    }
    console.log("✅ Database connection: OK");

    // Test LunarCrush API key
    if (!process.env.LUNARCRUSH_API_KEY) {
      console.log("⚠️  LUNARCRUSH_API_KEY: NOT CONFIGURED");
      console.log("   Set LUNARCRUSH_API_KEY to enable caching");
    } else {
      console.log("✅ LunarCrush API Key: CONFIGURED");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Run immediately on startup
    await cacheMarketData();

    // Then run on interval
    workerInterval = setInterval(async () => {
      await cacheMarketData();
    }, INTERVAL);

    console.log("✅ LunarCrush Cache Worker started successfully");
  } catch (error: any) {
    console.error("[LunarCrushCache] ❌ Failed to start worker:", error.message);
    console.error("[LunarCrushCache] Stack:", error.stack);
    throw error; // Re-throw to be caught by caller
  }
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping LunarCrush Cache Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown("LunarCrush Cache Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[LunarCrushCache] ❌ Worker failed to start:", error);
    console.error("[LunarCrushCache] Stack:", error.stack);
    process.exit(1);
  });
}

export { cacheMarketData };

