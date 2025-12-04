/**
 * Research Signal Worker - Non-Crypto Trading Signal Generator
 *
 * Generates trading signals using hybrid data sources:
 * - Finnhub: Stock quotes (free tier)
 * - MarketAux: News with sentiment analysis (free tier)
 *
 * Features:
 * - Fetches market data and news for assets available on OSTIUM venue
 * - Analyzes price movements and news sentiment using LLM
 * - Creates signals in research_signals table
 *
 * Interval: 5 minutes (configurable via WORKER_INTERVAL)
 */

import dotenv from "dotenv";
import express from "express";
import {
  prisma,
  checkDatabaseHealth,
  disconnectPrisma,
} from "@maxxit/database";
import {
  setupGracefulShutdown,
  registerCleanup,
  createHealthCheckHandler,
} from "@maxxit/common";
import {
  createHybridProvider,
  isAnyProviderAvailable,
  getAvailableProviders,
  getAssetType,
  isSymbolSupported,
  NormalizedAssetData,
  AssetType,
} from "./lib/data-providers";
import {
  createNewsSignalClassifier,
  SignalClassification,
} from "./lib/news-signal-classifier";

dotenv.config();

const PORT = process.env.PORT || 5007;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "300000"); // 5 minutes default

// Finnhub Research Institute ID (from research_institutes table)
const FINNHUB_INSTITUTE_ID = "39949239-a292-4c81-998e-d622405196a3";
const FINNHUB_INSTITUTE_NAME = "Finnhub Insights";

let workerInterval: NodeJS.Timeout | null = null;

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("research-signal-worker", async () => {
    const dbHealthy = await checkDatabaseHealth();
    const providerAvailable = isAnyProviderAvailable();
    const providers = getAvailableProviders();

    return {
      database: dbHealthy ? "connected" : "disconnected",
      mode: "hybrid-non-crypto",
      interval: INTERVAL,
      providers: {
        finnhub: providers.finnhub ? "available" : "not configured",
        marketaux: providers.marketaux ? "available" : "not configured",
      },
      isRunning: workerInterval !== null,
    };
  })
);

const server = app.listen(PORT, () => {
  console.log(
    `🏥 Research Signal Worker health check server listening on port ${PORT}`
  );
});

/**
 * Get or verify Finnhub research institute exists
 */
async function getOrCreateFinnhubInstitute() {
  // First try to find by ID
  let institute = await prisma.research_institutes.findUnique({
    where: { id: FINNHUB_INSTITUTE_ID },
  });

  if (institute) {
    return institute;
  }

  // If not found by ID, try to find by name
  institute = await prisma.research_institutes.findUnique({
    where: { name: FINNHUB_INSTITUTE_NAME },
  });

  if (institute) {
    console.log(
      `✅ Found existing institute: ${FINNHUB_INSTITUTE_NAME} (ID: ${institute.id})`
    );
    return institute;
  }

  // Create new institute
  institute = await prisma.research_institutes.create({
    data: {
      id: FINNHUB_INSTITUTE_ID,
      name: FINNHUB_INSTITUTE_NAME,
      description:
        "Analytics and market intelligence. Provides data-driven insights for non-crypto assets using Finnhub + MarketAux.",
      website_url: "https://finnhub.io/",
      x_handle: "Finnhub_io",
      is_active: true,
    },
  });

  console.log(`✅ Created research institute: ${FINNHUB_INSTITUTE_NAME}`);
  return institute;
}

/**
 * Fetch non-crypto assets from venue_markets table (OSTIUM venue only)
 */
async function fetchNonCryptoAssets(): Promise<
  Array<{
    symbol: string;
    marketName: string;
    group: string;
    assetType: AssetType;
  }>
> {
  // Fetch all OSTIUM venue markets that are non-crypto
  const markets = await prisma.venue_markets.findMany({
    where: {
      venue: "OSTIUM",
      group: {
        in: ["indices", "forex", "commodities", "stocks"],
      },
    },
    select: {
      token_symbol: true,
      market_name: true,
      group: true,
      is_active: true,
    },
  });

  // Filter to only supported symbols and map to asset type
  const assets = markets
    .filter((m: any) => {
      const symbol = m.token_symbol as string;
      const supported = isSymbolSupported(symbol);
      if (!supported) {
        console.log(
          `[${symbol}] ⚠️  Not supported by data providers - skipping`
        );
      }
      return supported;
    })
    .map((m: any) => ({
      symbol: m.token_symbol as string,
      marketName: m.market_name as string,
      group: m.group as string,
      assetType:
        getAssetType(m.token_symbol as string) || ("stocks" as AssetType),
    }));

  return assets;
}

/**
 * Check if we recently processed this asset (within last 6 hours)
 */
async function wasRecentlyProcessed(
  symbol: string,
  instituteId: string
): Promise<boolean> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const recentSignal = await prisma.research_signals.findFirst({
    where: {
      institute_id: instituteId,
      extracted_token: symbol,
      created_at: {
        gte: sixHoursAgo,
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return recentSignal !== null;
}

/**
 * Store research signal in database
 */
async function storeResearchSignal(
  instituteId: string,
  symbol: string,
  classification: SignalClassification,
  assetData: NormalizedAssetData
): Promise<void> {
  // Build signal text from classification and news
  const signalText = buildSignalText(symbol, classification, assetData);

  // Get the first news URL as source
  const sourceUrl = classification.sourceUrls[0] || null;

  await prisma.research_signals.create({
    data: {
      institute_id: instituteId,
      signal_text: signalText,
      source_url: sourceUrl,
      extracted_token: symbol,
      extracted_side: classification.side,
      is_valid_signal: classification.isSignalCandidate,
      processed_for_trades: false, // Will be processed by signal-generator-worker
    },
  });
}

/**
 * Build signal text from classification data
 */
function buildSignalText(
  symbol: string,
  classification: SignalClassification,
  assetData: NormalizedAssetData
): string {
  const parts: string[] = [];

  // Header
  parts.push(`[${symbol}] ${classification.sentiment.toUpperCase()} Signal`);

  // Data source info
  parts.push(`Data Source: ${assetData.provider}`);

  // Price info if available
  if (assetData.quote) {
    const changeStr =
      assetData.quote.changePercent >= 0
        ? `+${assetData.quote.changePercent.toFixed(2)}%`
        : `${assetData.quote.changePercent.toFixed(2)}%`;
    parts.push(`Price: ${assetData.quote.currentPrice} (${changeStr})`);
  }

  // Sentiment info
  if (assetData.news) {
    parts.push(
      `News Sentiment: ${assetData.news.averageSentiment.toFixed(2)} (${
        assetData.news.articleCount
      } articles)`
    );
  }

  // Reasoning
  parts.push(`Analysis: ${classification.reasoning}`);

  // Key factors
  if (classification.keyFactors.length > 0) {
    parts.push(`Key Factors: ${classification.keyFactors.join(", ")}`);
  }

  // Top news headlines
  if (classification.newsHeadlines.length > 0) {
    parts.push(`Recent News:`);
    classification.newsHeadlines.slice(0, 3).forEach((headline, i) => {
      parts.push(`  ${i + 1}. ${headline}`);
    });
  }

  return parts.join("\n");
}

/**
 * Main signal generation function
 */
async function generateResearchSignals() {
  try {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  📊 NON-CRYPTO RESEARCH SIGNAL WORKER (HYBRID)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Started at: ${new Date().toISOString()}\n`);

    // Check data provider availability
    const providers = getAvailableProviders();
    console.log(`📡 Data Providers:`);
    console.log(
      `   • Finnhub (quotes): ${
        providers.finnhub ? "✅ Available" : "❌ Not configured"
      }`
    );
    console.log(
      `   • MarketAux (news): ${
        providers.marketaux ? "✅ Available" : "❌ Not configured"
      }`
    );

    if (!providers.finnhub && !providers.marketaux) {
      console.log("\n⚠️  No data providers available!");
      console.log("   Set FINNHUB_API_KEY and/or MARKETAUX_API_KEY");
      return;
    }

    // Create hybrid provider
    const provider = createHybridProvider();
    if (!provider.isAvailable()) {
      console.log("⚠️  Hybrid provider not available");
      return;
    }
    console.log(`\n✅ Using: ${provider.name}`);

    // Check LLM classifier availability
    const classifier = createNewsSignalClassifier();
    if (!classifier) {
      console.log("⚠️  LLM Classifier not available");
      console.log(
        "   Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY"
      );
      return;
    }

    // Get or create Finnhub institute
    const institute = await getOrCreateFinnhubInstitute();
    if (!institute.is_active) {
      console.log("⚠️  Research institute is not active\n");
      return;
    }

    // Fetch non-crypto assets from database
    const assets = await fetchNonCryptoAssets();

    if (assets.length === 0) {
      console.log(
        "⚠️  No supported non-crypto assets found in venue_markets\n"
      );
      return;
    }

    console.log(
      `\n📋 Found ${assets.length} supported non-crypto asset(s) to analyze\n`
    );

    // Track statistics
    let assetsProcessed = 0;
    let assetsSkipped = 0;
    let signalsGenerated = 0;
    let errorsCount = 0;

    // Process each asset
    for (const asset of assets) {
      const { symbol, marketName, assetType } = asset;

      try {
        console.log(`\n[${symbol}] Processing (${assetType})...`);

        // Check if recently processed
        const recentlyProcessed = await wasRecentlyProcessed(
          symbol,
          institute.id
        );
        if (recentlyProcessed) {
          console.log(
            `[${symbol}] ⏭️  Skipping - already processed within 6 hours`
          );
          assetsSkipped++;
          continue;
        }

        // Fetch asset data using hybrid provider
        console.log(`[${symbol}] 📡 Fetching data (Finnhub + MarketAux)...`);
        const assetData = await provider.getAssetData(symbol, assetType);

        if (assetData.error) {
          console.log(`[${symbol}] ⚠️  ${assetData.error}`);
        }

        // Log what we got
        console.log(`[${symbol}] 📦 Data source: ${assetData.provider}`);

        if (assetData.quote) {
          console.log(
            `[${symbol}] 💰 Price: ${
              assetData.quote.currentPrice
            } (${assetData.quote.changePercent?.toFixed(2)}%)`
          );
        } else {
          console.log(
            `[${symbol}] ⚠️  No price data (Finnhub free tier limitation)`
          );
        }

        if (assetData.news) {
          const sentimentEmoji =
            assetData.news.averageSentiment > 0.1
              ? "📈"
              : assetData.news.averageSentiment < -0.1
              ? "📉"
              : "➡️";
          console.log(
            `[${symbol}] 📰 News: ${
              assetData.news.articleCount
            } articles, sentiment: ${assetData.news.averageSentiment.toFixed(
              2
            )} ${sentimentEmoji}`
          );
          console.log(
            `[${symbol}]    Bullish: ${assetData.news.bullishCount}, Bearish: ${assetData.news.bearishCount}, Neutral: ${assetData.news.neutralCount}`
          );
        } else {
          console.log(`[${symbol}] ⚠️  No news data available`);
        }

        // Skip if no meaningful data
        if (!assetData.quote && !assetData.news) {
          console.log(`[${symbol}] ⏭️  Skipping - no market data available`);
          assetsSkipped++;
          continue;
        }

        // Classify using LLM
        console.log(`[${symbol}] 🤖 Analyzing with LLM...`);
        const classification = await classifier.classifyAssetData(assetData);

        console.log(
          `[${symbol}] 📊 Result: ${classification.sentiment} (confidence: ${(
            classification.confidence * 100
          ).toFixed(1)}%)`
        );

        if (classification.isSignalCandidate && classification.side) {
          console.log(`[${symbol}] ✅ Signal: ${classification.side}`);
          console.log(`[${symbol}]    Reasoning: ${classification.reasoning}`);

          // Store in research_signals
          await storeResearchSignal(
            institute.id,
            symbol,
            classification,
            assetData
          );
          signalsGenerated++;

          console.log(`[${symbol}] 💾 Stored in research_signals`);
        } else {
          console.log(`[${symbol}] ➖ No actionable signal`);
          if (classification.reasoning) {
            console.log(`[${symbol}]    Reason: ${classification.reasoning}`);
          }

          // Still store for tracking (with is_valid_signal = false)
          await storeResearchSignal(
            institute.id,
            symbol,
            classification,
            assetData
          );
        }

        assetsProcessed++;
      } catch (error: any) {
        console.error(`[${symbol}] ❌ Error: ${error.message}`);
        errorsCount++;
      }
    }

    // Summary
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 RESEARCH SIGNAL GENERATION SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Total Assets: ${assets.length}`);
    console.log(`  Processed: ${assetsProcessed}`);
    console.log(`  Skipped: ${assetsSkipped}`);
    console.log(`  Signals Generated: ${signalsGenerated}`);
    console.log(`  Errors: ${errorsCount}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error: any) {
    console.error("[ResearchSignal] ❌ Fatal error:", error.message);
    console.error(error.stack);
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Non-Crypto Research Signal Worker starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60} minutes)`);
  console.log("");
  console.log("📋 Signal Generation Flow:");
  console.log("   1. Fetch non-crypto assets from OSTIUM venue_markets");
  console.log("   2. Get quotes from Finnhub (stocks only on free tier)");
  console.log("   3. Get news + sentiment from MarketAux");
  console.log("   4. Analyze with LLM classifier");
  console.log("   5. Store signals in research_signals table");
  console.log("");
  console.log("📊 Supported Asset Types:");
  console.log("   • Stocks (NVDA, AAPL, MSFT, TSLA, etc.) - quotes + news");
  console.log("   • Indices (SPX, DJI, NDX, etc.) - news only via ETF proxies");
  console.log("   • Forex (EUR, GBP, AUD, etc.) - news only via ETF proxies");
  console.log(
    "   • Commodities (XAU, XAG, CL, etc.) - news only via ETF proxies"
  );
  console.log("");

  // Check provider availability
  const providers = getAvailableProviders();
  console.log("📡 Data Providers:");
  if (providers.finnhub) {
    console.log("   ✅ Finnhub: ENABLED (stock quotes)");
  } else {
    console.log("   ⚠️  Finnhub: NOT CONFIGURED");
    console.log("      Set FINNHUB_API_KEY to enable stock quotes");
  }

  if (providers.marketaux) {
    console.log("   ✅ MarketAux: ENABLED (news + sentiment)");
  } else {
    console.log("   ⚠️  MarketAux: NOT CONFIGURED");
    console.log("      Set MARKETAUX_API_KEY to enable news sentiment");
  }

  // Check LLM availability
  const classifier = createNewsSignalClassifier();
  if (classifier) {
    console.log("   ✅ LLM Classifier: ENABLED");
  } else {
    console.log("   ⚠️  LLM Classifier: NOT CONFIGURED");
    console.log(
      "      Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY"
    );
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Run immediately on startup
  await generateResearchSignals();

  // Then run on interval
  workerInterval = setInterval(async () => {
    await generateResearchSignals();
  }, INTERVAL);
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping Research Signal Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  await disconnectPrisma();
  console.log("✅ Prisma disconnected");
});

// Setup graceful shutdown
setupGracefulShutdown("Research Signal Worker", server);

// Start worker
if (require.main === module) {
  console.log("✅ Environment check passed");
  console.log("   DATABASE_URL: [SET]");
  console.log(
    "   FINNHUB_API_KEY:",
    process.env.FINNHUB_API_KEY ? "[SET]" : "[NOT SET]"
  );
  console.log(
    "   MARKETAUX_API_KEY:",
    process.env.MARKETAUX_API_KEY ? "[SET]" : "[NOT SET]"
  );
  console.log("   PORT:", PORT);
  console.log("   NODE_ENV:", process.env.NODE_ENV || "development");

  // Test database connection before starting
  checkDatabaseHealth()
    .then((healthy: boolean) => {
      if (!healthy) {
        console.error("❌ FATAL: Cannot connect to database!");
        console.error("   Check DATABASE_URL and database availability.");
        process.exit(1);
      }
      console.log("✅ Database connection verified");

      // Start worker
      return runWorker();
    })
    .catch((error: Error) => {
      console.error("[ResearchSignal] ❌ Worker failed to start:", error);
      console.error("   Error details:", error.stack);
      process.exit(1);
    });
}

export { generateResearchSignals };
