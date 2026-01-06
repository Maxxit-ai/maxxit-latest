/**
 * Influencer Impact Monitoring Worker (Microservice)
 * Monitors P&L for signals by comparing stored token_price with current CoinGecko prices
 * Interval: 20 seconds (configurable via WORKER_INTERVAL)
 *
 * Flow:
 * 1. Fetch all telegram_posts where impact_factor_flag = false
 * 2. For each post, get extracted_tokens and token_price
 * 3. Fetch latest price from CoinGecko for each token
 * 4. Calculate P&L percentage: ((current_price - token_price) / token_price) * 100
 *    - For LONG signals: positive P&L if price increased
 *    - For SHORT signals: positive P&L if price decreased
 * 5. Update pnl column in telegram_posts
 */

import dotenv from "dotenv";
import express from "express";
import { promises as fs } from "fs";
import path from "path";
import { prisma, checkDatabaseHealth, disconnectPrisma } from "@maxxit/database";
import {
  setupGracefulShutdown,
  registerCleanup,
  createHealthCheckHandler,
} from "@maxxit/common";

dotenv.config();

const PORT = process.env.PORT || 5008;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "20000"); // 20 seconds default

// Path to store CoinGecko coins list JSON file
const COINGECKO_CACHE_FILE = path.join(
  __dirname,
  "../../coingecko-coins-cache.json"
);

let workerInterval: NodeJS.Timeout | null = null;

// In-memory cache for CoinGecko coin list
// Maps uppercase symbol -> coinGeckoId
let coinGeckoIdMap: Map<string, string> | null = null;

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("influencer-impact-monitoring-worker", async () => {
    const dbHealthy = await checkDatabaseHealth();
    return {
      database: dbHealthy ? "connected" : "disconnected",
      interval: INTERVAL,
      isRunning: workerInterval !== null,
      coinGeckoMapLoaded: coinGeckoIdMap !== null,
    };
  })
);

const server = app.listen(PORT, () => {
  console.log(
    `🏥 Influencer Impact Monitoring Worker health check on port ${PORT}`
  );
});

// Well-known major coins mapping (symbol -> coinGeckoId)
// These are hardcoded to avoid ambiguity with meme coins using same symbols
const MAJOR_COINS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  BNB: "binancecoin",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  LTC: "litecoin",
  TRX: "tron",
  SHIB: "shiba-inu",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  PEPE: "pepe",
  HBAR: "hedera-hashgraph",
  FIL: "filecoin",
  ICP: "internet-computer",
  VET: "vechain",
  AAVE: "aave",
  MKR: "maker",
  GRT: "the-graph",
  FTM: "fantom",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  CRV: "curve-dao-token",
  SNX: "havven",
  COMP: "compound-governance-token",
  YFI: "yearn-finance",
  SUSHI: "sushi",
  "1INCH": "1inch",
  ENS: "ethereum-name-service",
  LDO: "lido-dao",
  RPL: "rocket-pool",
  IMX: "immutable-x",
  GMX: "gmx",
  BLUR: "blur",
  WLD: "worldcoin-wld",
  SEI: "sei-network",
  TIA: "celestia",
  INJ: "injective-protocol",
  RUNE: "thorchain",
  KAVA: "kava",
  ALGO: "algorand",
  XLM: "stellar",
  EOS: "eos",
  XTZ: "tezos",
  FLOW: "flow",
  EGLD: "elrond-erd-2",
  HYPE: "hyperliquid",
};

/**
 * Load CoinGecko coins list from the static JSON file
 * This file is committed to GitHub and read-only at runtime
 */
async function loadCoinGeckoIdMap(): Promise<void> {
  try {
    console.log("[CoinGecko] Loading coins list from static JSON file...");

    const fileContent = await fs.readFile(COINGECKO_CACHE_FILE, "utf-8");
    const cachedData = JSON.parse(fileContent) as {
      timestamp: number;
      coins: Array<{ id: string; symbol: string; name: string }>;
    };

    // Create a map: uppercase symbol -> coinGeckoId
    coinGeckoIdMap = new Map<string, string>();

    // First, add all major coins (these take priority)
    for (const [symbol, id] of Object.entries(MAJOR_COINS)) {
      coinGeckoIdMap.set(symbol, id);
    }

    // Then add remaining coins from the JSON file (only if not already in map)
    for (const coin of cachedData.coins) {
      const symbolUpper = coin.symbol.toUpperCase();
      // Skip if already mapped (major coins take priority)
      if (!coinGeckoIdMap.has(symbolUpper)) {
        coinGeckoIdMap.set(symbolUpper, coin.id);
      }
    }

    console.log(
      `[CoinGecko] ✅ Loaded ${coinGeckoIdMap.size} coin mappings (${Object.keys(MAJOR_COINS).length} major coins prioritized)`
    );
  } catch (error: any) {
    console.error(
      "[CoinGecko] ❌ Failed to load CoinGecko coins list:",
      error.message
    );
    throw new Error(
      `CoinGecko cache file not found or invalid: ${COINGECKO_CACHE_FILE}. Run 'npm run fetch-coingecko' locally to generate it.`
    );
  }
}

/**
 * Map token symbol to CoinGecko ID
 * Uses the dynamically loaded CoinGecko coins list
 * Falls back to lowercase symbol if not found
 */
function getCoinGeckoId(symbol: string): string | null {
  if (!coinGeckoIdMap) {
    console.warn(
      "[CoinGecko] ⚠️  CoinGecko ID map not loaded, cannot resolve symbol"
    );
    return null;
  }

  const symbolUpper = symbol.toUpperCase();
  const coinGeckoId = coinGeckoIdMap.get(symbolUpper);

  if (coinGeckoId) {
    return coinGeckoId;
  }

  // Fallback: try lowercase symbol as-is (some coins might use lowercase IDs)
  console.warn(
    `[CoinGecko] ⚠️  Symbol "${symbol}" not found in CoinGecko list, using lowercase fallback`
  );
  return symbol.toLowerCase();
}

/**
 * Fetch latest price from CoinGecko for a token
 * Returns the most recent price from the 24h chart data
 */
async function fetchCoinGeckoPrice(
  tokenSymbol: string
): Promise<number | null> {
  try {
    const coinGeckoId = getCoinGeckoId(tokenSymbol);
    console.log("coinGeckoId", coinGeckoId);

    if (!coinGeckoId) {
      console.warn(
        `[CoinGecko] Could not resolve CoinGecko ID for ${tokenSymbol}`
      );
      return null;
    }

    const url = `https://www.coingecko.com/price_charts/${coinGeckoId}/usd/24_hours.json`;

    console.log(`[CoinGecko] Fetching price for ${tokenSymbol} (${coinGeckoId})`);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.warn(
        `[CoinGecko] Failed to fetch price for ${tokenSymbol}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = (await response.json()) as {
      stats?: Array<[number, number]>;
    };

    if (!data.stats || !Array.isArray(data.stats) || data.stats.length === 0) {
      console.warn(`[CoinGecko] No price data found for ${tokenSymbol}`);
      return null;
    }

    // Get the last (most recent) price from the stats array
    const lastPricePoint = data.stats[data.stats.length - 1];
    console.log("lastPricePoint", lastPricePoint);
    const latestPrice = lastPricePoint[1]; // [timestamp, price]
    console.log("latestPrice", latestPrice);

    console.log(
      `[CoinGecko] Latest price for ${tokenSymbol}: $${latestPrice.toFixed(2)}`
    );

    return latestPrice;
  } catch (error: any) {
    console.error(
      `[CoinGecko] Error fetching price for ${tokenSymbol}:`,
      error.message
    );
    return null;
  }
}

/**
 * Calculate P&L percentage
 * For LONG: positive if current_price > token_price
 * For SHORT: positive if current_price < token_price
 */
function calculatePnL(
  tokenPrice: number,
  currentPrice: number,
  signalType: string | null
): number {
  if (!tokenPrice || tokenPrice === 0) {
    return 0;
  }

  if (signalType === "LONG") {
    // Long position: profit if price goes up
    return ((currentPrice - tokenPrice) / tokenPrice) * 100;
  } else if (signalType === "SHORT") {
    // Short position: profit if price goes down
    return ((tokenPrice - currentPrice) / tokenPrice) * 100;
  } else {
    // Neutral or unknown: calculate as if long
    return ((currentPrice - tokenPrice) / tokenPrice) * 100;
  }
}

/**
 * Process and update P&L for signals
 */
async function processImpactMonitoring() {
  console.log(
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );
  console.log("  📊 INFLUENCER IMPACT MONITORING WORKER");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Fetch all posts where impact_factor_flag = false
    const unprocessedPosts = await prisma.telegram_posts.findMany({
      where: {
        impact_factor_flag: false,
        is_signal_candidate: true, // Only process actual signals
        token_price: { not: null }, // Must have a stored price
        extracted_tokens: { isEmpty: false }, // Must have tokens
      },
      select: {
        id: true,
        extracted_tokens: true,
        token_price: true,
        signal_type: true,
        pnl: true,
      },
      orderBy: {
        message_created_at: "asc", // Process oldest first
      },
      take: 100, // Process in batches
    });

    if (unprocessedPosts.length === 0) {
      console.log("✅ No unprocessed signals found\n");
      return;
    }

    console.log(
      `📋 Found ${unprocessedPosts.length} signal(s) to monitor\n`
    );

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    // Process each post
    for (const post of unprocessedPosts) {
      try {
        if (
          !post.extracted_tokens ||
          post.extracted_tokens.length === 0 ||
          !post.token_price
        ) {
          console.log(
            `[Post ${post.id}] ⚠️  Skipping: missing tokens or token_price`
          );
          continue;
        }

        // Get the first token (primary token)
        const primaryToken = post.extracted_tokens[0].toUpperCase();
        console.log(
          `[Post ${post.id}] Processing token: ${primaryToken} (stored price: $${post.token_price})`
        );

        // Fetch current price from CoinGecko
        const currentPrice = await fetchCoinGeckoPrice(primaryToken);
        console.log("currentPrice", currentPrice);
        if (currentPrice === null) {
          console.log(
            `[Post ${post.id}] ⚠️  Could not fetch current price, skipping`
          );
          totalErrors++;
          continue;
        }

        // Calculate P&L
        const pnl = calculatePnL(
          post.token_price,
          currentPrice,
          post.signal_type
        );

        console.log(
          `[Post ${post.id}] P&L: ${pnl.toFixed(2)}% (${post.signal_type || "NEUTRAL"})`
        );

        // Update P&L in database
        await prisma.telegram_posts.update({
          where: { id: post.id },
          data: {
            pnl: pnl,
          },
        });

        totalProcessed++;
        totalUpdated++;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error: any) {
        totalErrors++;
        console.error(`[Post ${post.id}] ❌ Error:`, error.message);
      }
    }

    console.log(
      "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log("📊 PROCESSING SUMMARY");
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log(`  Signals Processed: ${totalProcessed}`);
    console.log(`  P&L Updated: ${totalUpdated}`);
    console.log(`  Errors: ${totalErrors}`);
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    );
  } catch (error: any) {
    console.error(
      "[InfluencerImpactMonitoring] ❌ Fatal error:",
      error.message
    );
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Influencer Impact Monitoring Worker starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000}s)`);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Load CoinGecko coins list before starting
  try {
    await loadCoinGeckoIdMap();
  } catch (error: any) {
    console.error(
      "[InfluencerImpactMonitoring] ❌ Failed to load CoinGecko map, worker cannot start:",
      error.message
    );
    process.exit(1);
  }

  // Run immediately on startup
  await processImpactMonitoring();

  // Then run on interval
  workerInterval = setInterval(async () => {
    await processImpactMonitoring();
  }, INTERVAL);
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log(
    "🛑 Stopping Influencer Impact Monitoring Worker interval..."
  );
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  await disconnectPrisma();
  console.log("✅ Prisma disconnected");
});

// Setup graceful shutdown
setupGracefulShutdown("Influencer Impact Monitoring Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error(
      "[InfluencerImpactMonitoring] ❌ Worker failed to start:",
      error
    );
    process.exit(1);
  });
}

export { processImpactMonitoring };
