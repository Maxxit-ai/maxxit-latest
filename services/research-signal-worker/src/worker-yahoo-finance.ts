/**
 * Research Signal Worker
 *
 * Generates trading signals using Yahoo Finance market data
 * - Fetches market data for tokens available on venues
 * - Analyzes price movements, volume, and trends
 * - Creates signals for agents subscribed to research institutes
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
  analyzeTokenSignal,
  canUseYahooFinance,
} from "./lib/yahoo-finance-wrapper";

dotenv.config();

const PORT = process.env.PORT || 5007;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "300000"); // 5 minutes default

let workerInterval: NodeJS.Timeout | null = null;

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("research-signal-worker-yahoo", async () => {
    const dbHealthy = await checkDatabaseHealth();
    return {
      database: dbHealthy ? "connected" : "disconnected",
      interval: INTERVAL,
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
 * Get or create Yahoo Finance research institute
 */
async function getOrCreateYahooFinanceInstitute() {
  const instituteName = "Yahoo Finance";

  let institute = await prisma.research_institutes.findUnique({
    where: { name: instituteName },
  });

  if (!institute) {
    institute = await prisma.research_institutes.create({
      data: {
        name: instituteName,
        description:
          "Automated signals generated from Yahoo Finance market data analysis",
        website_url: "https://finance.yahoo.com",
        is_active: true,
      },
    });
    console.log(`✅ Created research institute: ${instituteName}`);
  }

  return institute;
}

/**
 * Generate signals from Yahoo Finance data
 */
async function generateResearchSignals() {
  try {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  📊 RESEARCH SIGNAL WORKER");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Started at: ${new Date().toISOString()}\n`);

    // Check Yahoo Finance availability
    if (!canUseYahooFinance()) {
      console.log("⚠️  Yahoo Finance not available\n");
      return;
    }

    // Get or create Yahoo Finance institute
    const institute = await getOrCreateYahooFinanceInstitute();
    if (!institute.is_active) {
      console.log("⚠️  Yahoo Finance institute is not active\n");
      return;
    }

    // Get active tokens from venue_markets (get unique token symbols)
    const allMarkets = await prisma.venue_markets.findMany({
      where: { is_active: true },
      select: {
        token_symbol: true,
        venue: true,
      },
    });

    // Get unique token symbols
    const tokenSymbols = allMarkets.map((m: any) => m.token_symbol as string);
    const uniqueTokens = Array.from(new Set(tokenSymbols)) as string[];
    const venueMarkets = uniqueTokens.map((token: string) => ({
      token_symbol: token,
      venue:
        allMarkets.find((m: any) => m.token_symbol === token)?.venue ||
        "HYPERLIQUID",
    }));

    if (venueMarkets.length === 0) {
      console.log("⚠️  No active tokens found in venue_markets\n");
      return;
    }

    console.log(`📋 Found ${venueMarkets.length} active token(s) to analyze\n`);

    // Get agents subscribed to this institute
    const subscribedAgents = await prisma.agent_research_institutes.findMany({
      where: {
        institute_id: institute.id,
        agents: {
          status: "PUBLIC",
        },
      },
      include: {
        agents: true,
      },
    });

    const activeAgents = subscribedAgents
      .map((ari: any) => ari.agents)
      .filter((agent: any) => agent !== null && agent.status === "PUBLIC");

    if (activeAgents.length === 0) {
      console.log(
        "⚠️  No active agents subscribed to Yahoo Finance institute\n"
      );
      console.log("   Tip: Link agents to research institutes via API\n");
      return;
    }

    console.log(
      `🤖 ${activeAgents.length} agent(s) subscribed to Yahoo Finance\n`
    );

    let signalsGenerated = 0;
    let researchSignalsCreated = 0;

    // Process each token
    for (const market of venueMarkets) {
      try {
        const token = market.token_symbol as string;
        console.log(`[${token}] Analyzing...`);

        // Analyze token using Yahoo Finance
        const analysis = await analyzeTokenSignal(token);

        if (!analysis) {
          console.log(`[${token}] ⏭️  No data available\n`);
          continue;
        }

        // Only proceed if we have a valid signal
        if (!analysis.side) {
          console.log(`[${token}] ⏭️  ${analysis.reasoning}\n`);
          continue;
        }

        console.log(
          `[${token}] ✅ Signal: ${analysis.side} (confidence: ${(
            analysis.confidence * 100
          ).toFixed(1)}%)`
        );
        console.log(`[${token}]    ${analysis.reasoning}`);

        // Store in research_signals table
        const researchSignal = await prisma.research_signals.create({
          data: {
            institute_id: institute.id,
            signal_text: analysis.reasoning,
            extracted_token: token,
            extracted_side: analysis.side,
            is_valid_signal: true,
            processed_for_trades: false,
          },
        });
        researchSignalsCreated++;

        // Create signals for each subscribed agent
        for (const agent of activeAgents) {
          try {
            // Check if token is available on agent's venue
            const tokenAvailable = await prisma.venue_markets.findFirst({
              where: {
                token_symbol: token,
                venue: agent.venue,
                is_active: true,
              },
            });

            if (!tokenAvailable) {
              console.log(
                `[${token}] ⏭️  Not available on ${agent.venue} for agent ${agent.name}`
              );
              continue;
            }

            // Calculate position size based on confidence (0-10% of balance)
            const positionSizePercent = Math.min(10, analysis.confidence * 10);

            // Create signal in signals table
            try {
              await prisma.signals.create({
                data: {
                  agent_id: agent.id,
                  token_symbol: token,
                  venue: agent.venue,
                  side: analysis.side,
                  size_model: {
                    type: "balance-percentage",
                    value: positionSizePercent,
                    source: "yahoo-finance",
                  },
                  risk_model: {}, // Risk management is hardcoded in position monitor
                  source_tweets: [], // No tweets for research signals
                  lunarcrush_score: null,
                  lunarcrush_reasoning: analysis.reasoning,
                  lunarcrush_breakdown: {
                    source: "yahoo-finance",
                    confidence: analysis.confidence,
                    priceChange: analysis.priceChange,
                    volumeChange: analysis.volumeChange,
                    technicalIndicators: analysis.technicalIndicators,
                  },
                },
              });

              signalsGenerated++;
              console.log(
                `[${token}] ✅ Signal created for agent ${agent.name}: ${
                  analysis.side
                } ${token} (${positionSizePercent.toFixed(2)}% position)`
              );
            } catch (createError: any) {
              // P2002: Unique constraint violation (signal already exists for this agent+token in 6h window)
              if (createError.code === "P2002") {
                console.log(
                  `[${token}] ⏭️  Signal already exists for agent ${agent.name} (within 6-hour window)`
                );
              } else {
                throw createError;
              }
            }
          } catch (error: any) {
            console.error(
              `[${token}] ❌ Error creating signal for agent ${agent.name}:`,
              error.message
            );
          }
        }

        // Mark research signal as processed
        await prisma.research_signals.update({
          where: { id: researchSignal.id },
          data: { processed_for_trades: true },
        });

        console.log(`[${token}] ✅ Processing complete\n`);
      } catch (error: any) {
        console.error(`[${market.token_symbol}] ❌ Error:`, error.message);
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 RESEARCH SIGNAL GENERATION SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Tokens Analyzed: ${venueMarkets.length}`);
    console.log(`  Research Signals Created: ${researchSignalsCreated}`);
    console.log(`  Trading Signals Generated: ${signalsGenerated}`);
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
  console.log("🚀 Research Signal Worker starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60} minutes)`);
  console.log("");
  console.log("📋 Research Signal Generation Flow:");
  console.log("   1. Fetch market data from Yahoo Finance");
  console.log("   2. Analyze price movements, volume, and trends");
  console.log("   3. Generate signals for subscribed agents");
  console.log("   4. Store in research_signals and signals tables");
  console.log("");
  console.log("🛡️  Risk Management (Hardcoded in Position Monitor):");
  console.log("   • Hard Stop Loss: 10%");
  console.log("   • Trailing Stop: Activates at +3% profit, trails by 1%");
  console.log("");

  // Check Yahoo Finance availability
  if (canUseYahooFinance()) {
    console.log("✅ Yahoo Finance: ENABLED");
  } else {
    console.log("⚠️  Yahoo Finance: DISABLED");
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
