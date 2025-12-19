/**
 * Signal Generator Worker with LLM Decision Making (Microservice)
 * Generates trading signals from classified tweets
 * - LLM classification happens in tweet-ingestion-worker (extracts tokens, side, confidence)
 * - This worker uses LLM (Perplexity) for trade decisions including fund allocation and leverage
 * - Risk management (stop loss, take profit) is hardcoded in position-monitor-worker
 * Interval: 5 minutes (configurable via WORKER_INTERVAL)
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";
import { venue_t } from "@prisma/client";
import { makeTradeDecision } from "./lib/llm-trade-decision";
import { getLunarCrushRawData, canUseLunarCrush } from "./lib/lunarcrush-wrapper";

dotenv.config();

const PORT = process.env.PORT || 5008;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "30000"); // 30 seconds default

let workerInterval: NodeJS.Timeout | null = null;
let isCycleRunning = false;

// Health check server
const app = express();
app.get("/health", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "ok" : "degraded",
    service: "signal-generator-worker-llm",
    interval: INTERVAL,
    database: dbHealthy ? "connected" : "disconnected",
    isRunning: workerInterval !== null,
    isCycleRunning,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Signal Generator Worker with LLM health check on port ${PORT}`);
});

/**
 * Generate all pending signals
 * Finds tweets with NULL signal analysis and tries to generate signals
 */
async function generateAllSignals() {
  if (isCycleRunning) {
    console.log("[SignalGenerator] ⏭️ Skipping cycle - previous cycle still running");
    return;
  }

  isCycleRunning = true;
  console.log("[SignalGenerator] ⏰ Running signal generation cycle...");
  
  try {
    // Get all telegram posts with signal classification that haven't been processed
    const pendingPosts = await prisma.telegram_posts.findMany({
      where: {
        is_signal_candidate: true,
        processed_for_signals: false,
      },
      orderBy: {
        message_created_at: "desc",
      },
      take: 20, // Process 20 posts per run
    });

    console.log(`[SignalGenerator] 📊 Found ${pendingPosts.length} telegram posts to process`);

    if (pendingPosts.length === 0) {
      console.log("[SignalGenerator] ✅ No pending telegram posts to process");
      return;
    }

    // Process each post
    for (const post of pendingPosts) {
      try {
        console.log(`[SignalGenerator] 🔄 Processing post ${post.id.substring(0, 8)}...`);
        console.log(`[SignalGenerator]    Content: "${post.message_text.substring(0, 100)}..."`);
        console.log(`[SignalGenerator]    Signal: ${post.signal_type}`);
        console.log(`[SignalGenerator]    Confidence: ${(post.confidence_score || 0).toFixed(2)}`);

        // Get all active agents for this signal
        const agents = await prisma.agents.findMany({
          where: {
            status: { in: ["PUBLIC", "PRIVATE"] },
            agent_deployments: {
              some: {
                status: "ACTIVE",
              },
            },
          },
          include: {
            agent_deployments: {
              where: {
                status: "ACTIVE",
              },
            },
          },
        });

        if (agents.length === 0) {
          console.log("[SignalGenerator] ⚠️  No active agents found");
          continue;
        }

        // Extract tokens from classified post
        const extractedTokens = post.extracted_tokens || [];

        if (extractedTokens.length === 0) {
          console.log("[SignalGenerator] ⏭️  No tokens extracted, skipping");
          continue;
        }

        console.log(`[SignalGenerator] 🪙 Tokens: ${extractedTokens.join(", ")}`);

        // Generate signal for each deployment, agent, and token combination
        // Each deployment has its own trading preferences, so we generate separate signals
        for (const agent of agents) {
          for (const deployment of agent.agent_deployments) {
            for (const token of extractedTokens) {
              try {
                const success = await generateSignalForAgentAndToken(
                  post,
                  agent,
                  deployment,
                  token
                );
                
                if (success) {
                  console.log(
                    `[SignalGenerator] ✅ Signal created for ${agent.name} (deployment ${deployment.id.substring(0, 8)}): ${token}`
                  );
                }
              } catch (error: any) {
                console.error(
                  `[SignalGenerator] ❌ Failed to generate signal for ${agent.name} (deployment ${deployment.id.substring(0, 8)}): ${token}: ${error.message}`
                );
              }
            }
          }
        }

        // Mark post as processed after attempting to generate signals for all deployments
        await prisma.telegram_posts.update({
          where: { id: post.id },
          data: {
            processed_for_signals: true,
          },
        });
      } catch (error: any) {
        console.error(
          `[SignalGenerator] ❌ Error processing post ${post.id}:`,
          error.message
        );
      }
    }

    console.log("[SignalGenerator] ✅ Signal generation cycle complete");
  } catch (error: any) {
    console.error("[SignalGenerator] ❌ Fatal error:", error.message);
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Generate a signal for a specific agent deployment and token using LLM decision making
 * @returns true if signal was created, false if skipped
 */
async function generateSignalForAgentAndToken(
  post: any,
  agent: any,
  deployment: any,
  token: string
) {
  try {
    // Stablecoins should NOT be traded (they are base currency)
    const EXCLUDED_TOKENS = ["USDC", "USDT", "DAI", "USDC.E", "BUSD", "FRAX"];
    if (EXCLUDED_TOKENS.includes(token.toUpperCase())) {
      console.log(`    ⏭️  Skipping stablecoin ${token} - base currency only`);
      return false;
    }

    // Check if token is available on target venue
    // For MULTI agents, check if token is available on ANY enabled venue
    let venueMarket: any;
    let signalVenue: venue_t; // The actual venue to use for signal

    if (agent.venue === "MULTI") {
      // For multi-venue agents, check Ostium FIRST, then Hyperliquid
      // Priority: OSTIUM → HYPERLIQUID

      // Check Ostium first
      const ostiumMarket = await prisma.venue_markets.findFirst({
        where: {
          token_symbol: token.toUpperCase(),
          venue: "OSTIUM",
          is_active: true,
        },
      });

      if (ostiumMarket) {
        venueMarket = ostiumMarket;
        signalVenue = "OSTIUM";
        console.log(
          `    ✅ ${token} available on OSTIUM (multi-venue, using OSTIUM)`
        );
      } else {
        // Ostium not available, check Hyperliquid
        const hyperliquidMarket = await prisma.venue_markets.findFirst({
          where: {
            token_symbol: token.toUpperCase(),
            venue: "HYPERLIQUID",
            is_active: true,
          },
        });

        if (hyperliquidMarket) {
          venueMarket = hyperliquidMarket;
          signalVenue = "HYPERLIQUID";
          console.log(
            `    ✅ ${token} available on HYPERLIQUID (not on OSTIUM, using HYPERLIQUID)`
          );
        } else {
          console.log(
            `    ⏭️  Skipping ${token} - not available on OSTIUM or HYPERLIQUID`
          );
          console.log(
            `       (Multi-venue agents need token on at least one enabled venue)`
          );
          return false;
        }
      }
    } else {
      // For single-venue agents, check specific venue
      venueMarket = await prisma.venue_markets.findFirst({
        where: {
          token_symbol: token.toUpperCase(),
          venue: agent.venue,
          is_active: true,
        },
      });

      if (!venueMarket) {
        console.log(
          `    ⏭️  Skipping ${token} - not available on ${agent.venue}`
        );
        console.log(
          `       (Only ${agent.venue}-supported tokens will generate signals)`
        );
        return false;
      }

      signalVenue = agent.venue; // Use agent's specific venue
      console.log(
        `    ✅ ${token} available on ${agent.venue} (${venueMarket.market_name})`
      );
    }

    // Determine side from post sentiment (already classified by LLM)
    const side = post.signal_type === "SHORT" ? "SHORT" : "LONG";

    // Check for existing signal 
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    const existingSignal = await prisma.signals.findFirst({
      where: {
        agent_id: agent.id,
        deployment_id: deployment.id,
        token_symbol: token.toUpperCase(),
        created_at: {
          gte: sixHoursAgo,
        },
      },
      include: {
        positions: {
          where: {
            deployment_id: deployment.id,
          },
          select: {
            status: true,
            entry_price: true,
            qty: true,
          },
          take: 1,
        },
      },
    });

    if (existingSignal) {
      const existingPosition = existingSignal.positions[0];

      if (existingPosition) {
        const entryPrice = existingPosition.entry_price
          ? Number(existingPosition.entry_price.toString())
          : 0;
        const qty = existingPosition.qty
          ? Number(existingPosition.qty.toString())
          : 0;

        const positionFailed =
          existingPosition.status === "CLOSED" && entryPrice === 0 && qty === 0;

        if (positionFailed) {
          console.log(
            `    ⚠️  Existing signal for ${token} failed (position closed with 0 values)`
          );
          console.log(
            `    ✅ Allowing new signal to be created (previous execution failed)`
          );
        } else {
          console.log(
            `    ⏭️  Signal already exists for ${token} for this deployment (within last 6 hours)`
          );
          return false;
        }
      } else if (existingSignal.skipped_reason) {
        console.log(
          `    ⏭️  Skipped signal already exists for ${token} (within last 6 hours)`
        );
        return false;
      } else {
        console.log(
          `    ⏭️  Signal exists but no position yet for ${token} - trade executor will process`
        );
        return false;
      }
    }
    
    // Get trading preferences from the specific agent deployment (preferences are per deployment)
    const userTradingPreferences = {
      risk_tolerance: deployment.risk_tolerance,
      trade_frequency: deployment.trade_frequency,
      social_sentiment_weight: deployment.social_sentiment_weight,
      price_momentum_focus: deployment.price_momentum_focus,
      market_rank_priority: deployment.market_rank_priority,
    };

    // Get user's balance for the venue
    let userBalance = 0;
    // Track venue/token-specific max leverage (used to inform the LLM)
    let venueMaxLeverage: number | undefined;
    
    if (signalVenue === "HYPERLIQUID") {
      // Get Hyperliquid balance via service
      const userAddress = await prisma.user_agent_addresses.findUnique({
        where: { user_wallet: deployment.user_wallet.toLowerCase() },
        select: { hyperliquid_agent_address: true },
      });

      if (userAddress?.hyperliquid_agent_address) {
        try {
          const balanceResponse = await fetch(
            `${process.env.HYPERLIQUID_SERVICE_URL || "https://hyperliquid-service.onrender.com"}/balance`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: userAddress.hyperliquid_agent_address,
              }),
            }
          );

          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json() as any;
            if (balanceData.success) {
              userBalance = parseFloat(balanceData.withdrawable || "0");
            }
          }
        } catch (error) {
          console.log(`    ⚠️  Failed to fetch Hyperliquid balance: ${error}`);
        }
      }
    } else if (signalVenue === "OSTIUM") {
      // Get Ostium balance via service
      const userAddress = await prisma.user_agent_addresses.findUnique({
        where: { user_wallet: deployment.user_wallet.toLowerCase() },
        select: { ostium_agent_address: true },
      });

      if (userAddress?.ostium_agent_address) {
        try {
          const balanceResponse = await fetch(
            `${process.env.OSTIUM_SERVICE_URL || "http://localhost:5002"}/balance`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: deployment.safe_wallet || deployment.user_wallet,
              }),
            }
          );

          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json() as any;
            if (balanceData.success) {
              userBalance = parseFloat(balanceData.usdcBalance || "0");
            }
          }
        } catch (error) {
          console.log(`    ⚠️  Failed to fetch Ostium balance: ${error}`);
        }
      }

      // Fetch max leverage for this token from ostium_available_pairs to inform LLM
      const tokenSymbol = token.toUpperCase();
      const possibleSymbols = [`${tokenSymbol}/USD`, `USD/${tokenSymbol}`];
      let ostiumPair = null;

      for (const symbol of possibleSymbols) {
        ostiumPair = await prisma.ostium_available_pairs.findFirst({ where: { symbol } });
        if (ostiumPair) break;
      }

      if (!ostiumPair) {
        ostiumPair = await prisma.ostium_available_pairs.findFirst({
          where: {
            OR: [
              { symbol: { startsWith: `${tokenSymbol}/` } },
              { symbol: { endsWith: `/${tokenSymbol}` } },
            ],
          },
        });
      }

      if (ostiumPair?.max_leverage !== undefined && ostiumPair?.max_leverage !== null) {
        const numericLeverage = Number(ostiumPair.max_leverage);
        venueMaxLeverage = Number.isFinite(numericLeverage) ? numericLeverage : undefined;
      }
    }

    // Get raw LunarCrush data if available (for additional context)
    let lunarcrushData: { data: Record<string, any>; descriptions: Record<string, string> } | null = null;
    if (canUseLunarCrush()) {
      try {
        const rawDataResult = await getLunarCrushRawData(token);
        if (rawDataResult.success && rawDataResult.data && rawDataResult.descriptions) {
          lunarcrushData = {
            data: rawDataResult.data,
            descriptions: rawDataResult.descriptions,
          };
        }
      } catch (error) {
        console.log(`    ⚠️  Failed to fetch LunarCrush data: ${error}`);
      }
    }

    // Make LLM decision
    console.log(`    🤖 Making LLM trade decision for ${token}...`);
    const tradeDecision = await makeTradeDecision({
      message: post.message_text,
      confidenceScore: post.confidence_score || 0.5,
      lunarcrushData,
      userTradingPreferences: userTradingPreferences,
      userBalance,
      venue: signalVenue,
      token,
      side,
      maxLeverage: venueMaxLeverage,
    });

    console.log(
      `    📊 LLM Decision: ${tradeDecision.shouldTrade ? "TRADE" : "SKIP"}`
    );
    console.log(
      `    💰 Fund Allocation: ${tradeDecision.fundAllocation.toFixed(2)}%`
    );
    if (signalVenue === "OSTIUM") {
      console.log(`    ⚙️  Leverage: ${tradeDecision.leverage}x`);
    }
    console.log(`    💭 Reason: ${tradeDecision.reason}`);

    // If LLM decides not to trade, create a skipped signal record
    if (!tradeDecision.shouldTrade) {
      console.log(`    ⏭️  Creating skipped signal based on LLM decision`);

      try {
        await prisma.signals.create({
          data: {
            agent_id: agent.id,
            deployment_id: deployment.id,
            token_symbol: token,
            venue: signalVenue,
            side: side,
            size_model: {
              type: "balance-percentage",
              value: tradeDecision.fundAllocation,
              impactFactor: 0,
            },
            risk_model: {
              stopLoss: 0.1,
              takeProfit: 0.05,
              leverage: signalVenue === "OSTIUM" ? tradeDecision.leverage : 3,
            },
            source_tweets: [post.message_id],
            skipped_reason: tradeDecision.reason,
            llm_decision: tradeDecision.reason,
            llm_should_trade: tradeDecision.shouldTrade,
            llm_fund_allocation: tradeDecision.fundAllocation,
            llm_leverage: tradeDecision.leverage,
          },
        });

        console.log(`    ✅ Skipped signal stored for deployment ${deployment.id.substring(0, 8)}: ${side} ${token} on ${signalVenue}`);
        console.log(`    💭 Skipped reason: ${tradeDecision.reason}`);
      } catch (error) {
        console.error(`    ❌ Error storing skipped signal: ${error}`);
      }
      
      return false;
    }

    // Create signal with LLM decision (per deployment)
    try {
      const signal = await prisma.signals.create({
        data: {
          agent_id: agent.id,
          deployment_id: deployment.id,
          token_symbol: token,
          venue: signalVenue, // MULTI agents → first available venue (Agent Where will re-route if needed)
          side: side,
          size_model: {
            type: "balance-percentage",
            value: tradeDecision.fundAllocation, // From LLM decision
            impactFactor: 0,
          },
          risk_model: {
            stopLoss: 0.1, // 10% stop loss (default)
            takeProfit: 0.05, // 5% take profit
            leverage: signalVenue === "OSTIUM" ? tradeDecision.leverage : 3, // Use LLM leverage for Ostium, default for Hyperliquid
          },
          source_tweets: [post.message_id],
          llm_decision: tradeDecision.reason,
          llm_should_trade: tradeDecision.shouldTrade,
          llm_fund_allocation: tradeDecision.fundAllocation,
          llm_leverage: tradeDecision.leverage,
        },
      });

      console.log(
        `    ✅ Signal created for deployment ${deployment.id.substring(0, 8)}: ${side} ${token} on ${signalVenue} (${tradeDecision.fundAllocation.toFixed(2)}% position)`
      );
      if (signalVenue === "OSTIUM") {
        console.log(
          `    ⚙️  Signal created with leverage: ${tradeDecision.leverage}x`
        );
      }
      return true; // Signal successfully created
    } catch (createError: any) {
      // P2002: Unique constraint violation (rare race condition)
      if (createError.code === "P2002") {
        console.log(
          `    ⏭️  Signal already exists for ${token} (race condition - created by concurrent process)`
        );
        return false; // Signal not created due to race condition
      } else {
        // Re-throw unexpected errors
        throw createError;
      }
    }
  } catch (error: any) {
    throw error;
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  try {
    console.log("🚀 Signal Generator Worker with LLM starting...");
    console.log(
      `⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60} minutes)`
    );
    console.log("");
    console.log("📋 Signal Generation Flow with LLM:");
    console.log("   1. Tweet classified by LLM (in tweet-ingestion-worker)");
    console.log("   2. LLM decision for trade execution, fund allocation, and leverage");
    console.log("   3. Signal created if LLM decides to trade");
    console.log("");
    console.log("🛡️  Risk Management (Hardcoded in Position Monitor):");
    console.log("   • Hard Stop Loss: 10%");
    console.log("   • Trailing Stop: Activates at +3% profit, trails by 1%");
    console.log(
      "   Note: These are NOT read from signal, but hardcoded in monitor"
    );
    console.log("");

    // Test database connection first
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error(
        "Database connection failed. Check DATABASE_URL environment variable."
      );
    }
    console.log("✅ Database connection: OK");

    // Check if LLM decision provider is configured
    const decisionMaker = makeTradeDecision({
      message: "test",
      confidenceScore: 0.5,
      userBalance: 1000,
      venue: "OSTIUM",
      token: "BTC",
      side: "LONG"
    }).then(() => true).catch(() => false);
    
    if (await decisionMaker) {
      console.log("✅ LLM Decision Maker: AVAILABLE");
    } else {
      console.log("⚠️  LLM Decision Maker: NOT CONFIGURED");
      console.log("   Set TRADE_DECISION_PROVIDER and corresponding API keys");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Run immediately on startup
    await generateAllSignals();

    // Then run on interval
    workerInterval = setInterval(async () => {
      await generateAllSignals();
    }, INTERVAL);

    console.log("✅ Signal Generator Worker with LLM started successfully");
  } catch (error: any) {
    console.error("[SignalGenerator] ❌ Failed to start worker:", error.message);
    console.error("[SignalGenerator] Stack:", error.stack);
    throw error; // Re-throw to be caught by caller
  }
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping Signal Generator Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown("Signal Generator Worker with LLM", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[SignalGenerator] ❌ Worker failed to start:", error);
    console.error("[SignalGenerator] Stack:", error.stack);
    // Don't exit immediately - let Railway health checks handle it
    // This allows the service to stay up and show errors in logs
    setTimeout(() => {
      console.error("[SignalGenerator] Exiting after error...");
      process.exit(1);
    }, 5000);
  });
}

export { generateAllSignals, generateSignalForAgentAndToken };