/**
 * Signal Generator Worker (Microservice)
 * Generates trading signals from classified tweets
 * - LLM classification happens in tweet-ingestion-worker (extracts tokens, side, confidence)
 * - This worker uses LunarCrush for position sizing (0-10% based on market sentiment)
 * - Risk management (stop loss, take profit) is hardcoded in position-monitor-worker
 * Interval: 5 minutes (configurable via WORKER_INTERVAL)
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";
import { getLunarCrushScore, canUseLunarCrush } from "./lib/lunarcrush-wrapper";
import { venue_t } from "@prisma/client";

dotenv.config();

const PORT = process.env.PORT || 5008;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "30000"); // 30 seconds default

let workerInterval: NodeJS.Timeout | null = null;

/**
 * Static LunarCrush-like data for research signals
 * This placeholder avoids external calls; will be replaced with real logic later.
 */
function getStaticLunarCrushData(
  token: string,
  confidence: number | null | undefined
) {
  return {
    success: true,
    score: 0.5 + (confidence || 0) * 0.25, // simple deterministic score
    reasoning: `Static placeholder score for ${token}`,
    breakdown: {
      sentiment: confidence ?? null,
      source: "static-placeholder",
    },
  };
}

// Health check server
const app = express();
app.get("/health", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "ok" : "degraded",
    service: "signal-generator-worker",
    interval: INTERVAL,
    database: dbHealthy ? "connected" : "disconnected",
    isRunning: workerInterval !== null,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(
    `🏥 Signal Generator Worker health check server listening on port ${PORT}`
  );
});

/**
 * Generate signals from classified tweets
 */
async function generateSignals() {
  try {
    console.log("\n🔍 Signal Generator Worker - Starting cycle...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Get unprocessed Twitter signal candidates
    const unprocessedTweets = await prisma.ct_posts.findMany({
      where: {
        is_signal_candidate: true,
        processed_for_signals: false,
      },
      include: {
        ct_accounts: {
          include: {
            agent_accounts: {
              include: {
                agents: true,
              },
            },
          },
        },
      },
      orderBy: {
        tweet_created_at: "desc",
      },
      take: 20, // Process 20 tweets per cycle
    });

    // Get unprocessed Telegram signal candidates (from alpha users)
    const unprocessedTelegram = await prisma.telegram_posts.findMany({
      where: {
        is_signal_candidate: true,
        processed_for_signals: false,
        alpha_user_id: { not: null }, // Only from alpha users (DMs)
        telegram_alpha_users: {
          is_active: true,
        },
      },
      include: {
        telegram_alpha_users: true,
      },
      orderBy: {
        message_created_at: "desc",
      },
      take: 20, // Process 20 messages per cycle
    });

    // Get unprocessed Research Institute signals
    const unprocessedResearchSignals = (await prisma.research_signals.findMany({
      where: {
        is_signal_candidate: true,
        processed_for_signals: false,
        research_institutes: {
          is_active: true,
        },
      },
      include: {
        research_institutes: true,
      },
      orderBy: {
        created_at: "desc",
      },
      take: 20, // Process 20 signals per cycle
    })) as any[];

    // Get unprocessed trader trades (from tracked traders / Alpha Clubs)
    const unprocessedTraderTrades = await prisma.trader_trades.findMany({
      where: {
        processed_for_signals: false,
      },
      orderBy: {
        trade_timestamp: "desc",
      },
      take: 20, // Process 20 trades per cycle
    });

    console.log(
      `📊 Found ${unprocessedTweets.length} Twitter + ${unprocessedTelegram.length} Telegram + ${unprocessedResearchSignals.length} Research + ${unprocessedTraderTrades.length} Trader unprocessed signal candidate(s)\n`
    );

    if (
      unprocessedTweets.length === 0 &&
      unprocessedTelegram.length === 0 &&
      unprocessedResearchSignals.length === 0 &&
      unprocessedTraderTrades.length === 0
    ) {
      console.log("✅ No signals to generate\n");
      return;
    }

    let signalsGenerated = 0;

    // Process each tweet
    for (const tweet of unprocessedTweets) {
      try {
        console.log(`[Tweet ${tweet.tweet_id}] Processing...`);
        console.log(`  Text: ${tweet.tweet_text.substring(0, 60)}...`);
        console.log(`  Tokens: ${tweet.extracted_tokens.join(", ")}`);
        console.log(`  Sentiment: ${tweet.signal_type || "unknown"}`);

        // Get agents subscribed to this account
        const subscribedAgents = tweet.ct_accounts.agent_accounts
          .map((aa) => aa.agents)
          .filter((agent) => agent.status === "PUBLIC");

        if (subscribedAgents.length === 0) {
          console.log(`  ⏭️  No active agents subscribed\n`);
          continue;
        }

        console.log(`  🤖 ${subscribedAgents.length} agent(s) subscribed`);

        // Precompute LunarCrush per token (avoid repeating identical calls per agent)
        for (const token of tweet.extracted_tokens) {
          let lunarCrushData: any = undefined;

          if (canUseLunarCrush()) {
            try {
              lunarCrushData = await getLunarCrushScore(
                token,
                tweet.confidence_score || 0.5
              );
            } catch (error: any) {
              console.log(
                `    ⚠️  LunarCrush scoring failed for ${token}: ${error.message}`
              );
              lunarCrushData = null; // Mark as attempted to avoid re-calling inside generate
            }
          }

          // Generate signal for each subscribed agent using the precomputed data
          for (const agent of subscribedAgents) {
            try {
              await generateSignalForAgentAndToken(
                tweet,
                agent,
                token,
                lunarCrushData
              );
              signalsGenerated++;
            } catch (error: any) {
              console.log(
                `  ❌ Error generating signal for agent ${agent.name}:`,
                error.message
              );
            }
          }
        }

        // Mark tweet as processed
        await prisma.ct_posts.update({
          where: { id: tweet.id },
          data: { processed_for_signals: true },
        });

        console.log(`  ✅ Tweet processed\n`);
      } catch (error: any) {
        console.error(`[Tweet ${tweet.tweet_id}] ❌ Error:`, error.message);
      }
    }

    // Process Telegram messages
    for (const message of unprocessedTelegram) {
      try {
        const username =
          message.telegram_alpha_users?.telegram_username ||
          message.telegram_alpha_users?.first_name ||
          "Unknown";
        console.log(`[Telegram @${username}] Processing...`);
        console.log(`  Text: ${message.message_text.substring(0, 60)}...`);
        console.log(`  Tokens: ${message.extracted_tokens.join(", ")}`);
        console.log(`  Sentiment: ${message.signal_type || "unknown"}`);

        // Get agents subscribed to this Telegram alpha user
        const agentLinks = await prisma.agent_telegram_users.findMany({
          where: { telegram_alpha_user_id: message.alpha_user_id! },
          include: { agents: true },
        });

        const subscribedAgents = agentLinks
          .map((link: any) => link.agents)
          .filter((agent: any) => agent.status === "PUBLIC");

        if (subscribedAgents.length === 0) {
          console.log(`  ⏭️  No active agents subscribed\n`);
          // Mark as processed even if no agents
          await prisma.telegram_posts.update({
            where: { id: message.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        console.log(`  🤖 ${subscribedAgents.length} agent(s) subscribed`);

        // Normalize Telegram message to match expected tweet shape once
        const normalizedMessage = {
          ...message,
          tweet_id: message.message_id,
          tweet_text: message.message_text,
          tweet_created_at: message.message_created_at,
          ct_accounts: {
            impact_factor: message.telegram_alpha_users?.impact_factor || 0.5,
          },
        };

        // Precompute LunarCrush per token (avoid repeating identical calls per agent)
        for (const token of message.extracted_tokens) {
          let lunarCrushData: any = undefined;

          if (canUseLunarCrush()) {
            try {
              lunarCrushData = await getLunarCrushScore(
                token,
                message.confidence_score || 0.5
              );
            } catch (error: any) {
              console.log(
                `    ⚠️  LunarCrush scoring failed for ${token}: ${error.message}`
              );
              lunarCrushData = null; // Mark as attempted to avoid re-calling inside generate
            }
          }

          // Generate signal for each subscribed agent using the precomputed data
          for (const agent of subscribedAgents) {
            try {
              await generateSignalForAgentAndToken(
                normalizedMessage,
                agent,
                token,
                lunarCrushData
              );
              signalsGenerated++;
            } catch (error: any) {
              console.log(
                `  ❌ Error generating signal for agent ${agent.name}:`,
                error.message
              );
            }
          }
        }

        // Mark Telegram message as processed
        await prisma.telegram_posts.update({
          where: { id: message.id },
          data: { processed_for_signals: true },
        });

        console.log(`  ✅ Telegram message processed\n`);
      } catch (error: any) {
        console.error(
          `[Telegram ${message.message_id}] ❌ Error:`,
          error.message
        );
      }
    }

    // Process Research Institute signals
    for (const signal of unprocessedResearchSignals) {
      try {
        console.log(`[Research ${signal.id}] Processing...`);
        console.log(`  Text: ${signal.signal_text.substring(0, 60)}...`);
        console.log(`  Tokens: ${signal.extracted_tokens.join(", ")}`);
        console.log(`  Sentiment: ${signal.signal_type || "unknown"}`);

        // Get agents subscribed to this research institute
        const instituteAgentLinks =
          await prisma.agent_research_institutes.findMany({
            where: { institute_id: signal.institute_id },
            include: { agents: true },
          });

        const subscribedAgents = instituteAgentLinks
          .map((link: any) => link.agents)
          .filter((agent: any) => agent.status === "PUBLIC");

        if (subscribedAgents.length === 0) {
          console.log(`  ⏭️  No active agents subscribed\n`);
          await prisma.research_signals.update({
            where: { id: signal.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        console.log(`  🤖 ${subscribedAgents.length} agent(s) subscribed`);

        // Normalize research signal to match expected tweet shape once
        const normalizedSignal = {
          ...signal,
          tweet_id: signal.id,
          tweet_text: signal.signal_text,
          tweet_created_at: signal.created_at,
          ct_accounts: {
            impact_factor: 0.5, // Default impact factor placeholder
          },
        };

        // Precompute static LunarCrush-like data per token
        for (const token of signal.extracted_tokens) {
          const lunarCrushData = getStaticLunarCrushData(
            token,
            signal.confidence_score
          );

          for (const agent of subscribedAgents) {
            try {
              const signalCreated = await generateSignalForAgentAndToken(
                normalizedSignal,
                agent,
                token,
                lunarCrushData
              );
              if (signalCreated) {
                signalsGenerated++;
              }
            } catch (error: any) {
              console.log(
                `  ❌ Error generating signal for agent ${agent.name}:`,
                error.message
              );
            }
          }
        }

        // Mark research signal as processed
        await prisma.research_signals.update({
          where: { id: signal.id },
          data: { processed_for_signals: true },
        });

        console.log(`  ✅ Research signal processed\n`);
      } catch (error: any) {
        console.error(`[Research ${signal.id}] ❌ Error:`, error.message);
      }
    }

    // Process Trader Trades (from Alpha Clubs / copy-trading)
    for (const traderTrade of unprocessedTraderTrades) {
      try {
        console.log(`[TraderTrade ${traderTrade.id.slice(0, 8)}...] Processing...`);
        console.log(`  Token: ${traderTrade.token_symbol} | Side: ${traderTrade.side}`);
        console.log(`  Trader: ${traderTrade.trader_wallet.slice(0, 10)}...`);

        // Get the agent and its deployments
        const agent = await prisma.agents.findUnique({
          where: { id: traderTrade.agent_id },
          include: {
            agent_deployments: {
              where: { status: "ACTIVE" },
            },
          },
        });

        if (!agent) {
          console.log(`  ⏭️ Agent not found, marking as processed\n`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        if (agent.status !== "PUBLIC") {
          console.log(`  ⏭️ Agent is not PUBLIC, skipping\n`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        const deployments = agent.agent_deployments;
        if (deployments.length === 0) {
          console.log(`  ⏭️ No active deployments (club members)\n`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        console.log(`  🤖 ${deployments.length} club member(s) to receive signals`);

        // Create a normalized tweet-like object for the signal generator
        const normalizedTraderTrade = {
          tweet_id: traderTrade.source_trade_id,
          tweet_text: `Copy trade: ${traderTrade.side} ${traderTrade.token_symbol}`,
          tweet_created_at: traderTrade.trade_timestamp,
          signal_type: traderTrade.side,
          extracted_tokens: [traderTrade.token_symbol],
          confidence_score: 0.8, // High confidence for direct copy trades
          ct_accounts: {
            impact_factor: 0.7, // Default impact factor for copy trades
          },
        };

        // Get static LunarCrush data for the token
        const lunarCrushData = getStaticLunarCrushData(
          traderTrade.token_symbol,
          0.8 // High confidence for copy trades
        );

        // Generate signal for each deployment (club member)
        for (const deployment of deployments) {
          try {
            // Check for existing signal in current 6-hour bucket
            const now = new Date();
            const bucket6hStart = new Date(
              Math.floor(now.getTime() / (6 * 60 * 60 * 1000)) * 6 * 60 * 60 * 1000
            );

            const existingSignal = await prisma.signals.findFirst({
              where: {
                agent_id: agent.id,
                deployment_id: deployment.id,
                token_symbol: traderTrade.token_symbol.toUpperCase(),
                created_at: {
                  gte: bucket6hStart,
                },
              },
            });

            if (existingSignal) {
              console.log(`    ⏭️ Signal already exists for ${traderTrade.token_symbol} (deployment ${deployment.id.slice(0, 8)}...)`);
              continue;
            }

            // Check if token is available on a venue
            let signalVenue: venue_t = agent.venue;
            if (agent.venue === "MULTI") {
              // Check Ostium first, then Hyperliquid
              const ostiumMarket = await prisma.venue_markets.findFirst({
                where: {
                  token_symbol: traderTrade.token_symbol.toUpperCase(),
                  venue: "OSTIUM",
                  is_active: true,
                },
              });
              if (ostiumMarket) {
                signalVenue = "OSTIUM";
              } else {
                const hlMarket = await prisma.venue_markets.findFirst({
                  where: {
                    token_symbol: traderTrade.token_symbol.toUpperCase(),
                    venue: "HYPERLIQUID",
                    is_active: true,
                  },
                });
                if (hlMarket) {
                  signalVenue = "HYPERLIQUID";
                } else {
                  console.log(`    ⏭️ Token ${traderTrade.token_symbol} not available on any venue`);
                  continue;
                }
              }
            }

            // Calculate position size from LunarCrush
            const positionSizePercent = lunarCrushData.score
              ? Math.max(0.5, Math.min(10, lunarCrushData.score * 10))
              : 5;

            // Create signal for this deployment
            await prisma.signals.create({
              data: {
                agent_id: agent.id,
                deployment_id: deployment.id,
                token_symbol: traderTrade.token_symbol.toUpperCase(),
                venue: signalVenue,
                side: traderTrade.side,
                size_model: {
                  type: "balance-percentage",
                  value: positionSizePercent,
                  impactFactor: 0.7,
                  source: "copy-trade",
                  sourceTradeId: traderTrade.source_trade_id,
                },
                risk_model: {
                  stopLoss: 0.1,
                  takeProfit: 0.05,
                  leverage: Number(traderTrade.leverage) || 3,
                },
                source_tweets: [traderTrade.source_trade_id],
                lunarcrush_score: lunarCrushData.score,
                lunarcrush_reasoning: lunarCrushData.reasoning,
                lunarcrush_breakdown: lunarCrushData.breakdown,
              },
            });

            signalsGenerated++;
            console.log(`    ✅ Signal created for deployment ${deployment.id.slice(0, 8)}...`);
          } catch (err: any) {
            if (err.code === "P2002") {
              console.log(`    ⏭️ Signal already exists (race condition)`);
            } else {
              console.error(`    ❌ Error creating signal:`, err.message);
            }
          }
        }

        // Mark trader trade as processed
        await prisma.trader_trades.update({
          where: { id: traderTrade.id },
          data: { processed_for_signals: true },
        });

        console.log(`  ✅ Trader trade processed\n`);
      } catch (error: any) {
        console.error(`[TraderTrade ${traderTrade.id}] ❌ Error:`, error.message);
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 SIGNAL GENERATION SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Twitter Tweets: ${unprocessedTweets.length}`);
    console.log(`  Telegram Messages: ${unprocessedTelegram.length}`);
    console.log(`  Research Signals: ${unprocessedResearchSignals.length}`);
    console.log(`  Trader Trades: ${unprocessedTraderTrades.length}`);
    console.log(`  Signals Generated: ${signalsGenerated}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error: any) {
    console.error("[SignalGenerator] ❌ Fatal error:", error.message);
  }
}

/**
 * Generate a signal for a specific agent and token
 * Matches monolith flow: LLM classification (already done) + LunarCrush scoring + simple rules
 * @returns true if signal was created, false if skipped
 */
async function generateSignalForAgentAndToken(
  tweet: any,
  agent: any,
  token: string,
  lunarCrushData?: {
    success: boolean;
    score: number | null;
    reasoning: string | null;
    breakdown: any | null;
  } | null
) {
  try {
    // Stablecoins should NOT be traded (they are base currency)
    const EXCLUDED_TOKENS = ["USDC", "USDT", "DAI", "USDC.E", "BUSD", "FRAX"];
    if (EXCLUDED_TOKENS.includes(token.toUpperCase())) {
      console.log(`    ⏭️  Skipping stablecoin ${token} - base currency only`);
      return false;
    }

    // Check if token is available on the target venue
    // For MULTI agents, check if token is available on ANY enabled venue
    let venueMarket: any;
    let signalVenue: venue_t; // The actual venue to use for the signal

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

    // Determine side from tweet sentiment (already classified by LLM)
    const side = tweet.signal_type === "SHORT" ? "SHORT" : "LONG";

    // Default position size (will be overridden by LunarCrush if available)
    let positionSizePercent = 5; // Default 5%
    let lunarcrushScore: number | null = null;
    let lunarcrushReasoning: string | null = null;
    let lunarcrushBreakdown: any = null;

    // Get LunarCrush score for dynamic position sizing (0-10%)
    const hasPrecomputedLunar = typeof lunarCrushData !== "undefined";
    const lunarDataToUse = lunarCrushData;

    if (lunarDataToUse) {
      if (lunarDataToUse.success && lunarDataToUse.score !== null) {
        lunarcrushScore = lunarDataToUse.score;
        lunarcrushReasoning = lunarDataToUse.reasoning;
        lunarcrushBreakdown = lunarDataToUse.breakdown;

        if (lunarcrushScore > 0) {
          positionSizePercent = Math.max(
            0.5,
            Math.min(10, lunarcrushScore * 10)
          );
          console.log(
            `    📊 LunarCrush: ${token} score=${lunarcrushScore.toFixed(
              3
            )}, position=${positionSizePercent.toFixed(2)}%`
          );
        } else {
          positionSizePercent = 0.5;
          console.log(
            `    📊 LunarCrush: ${token} score=${lunarcrushScore.toFixed(
              3
            )} - CAUTION: minimum position (${positionSizePercent}%)`
          );
        }
      }
    } else if (!hasPrecomputedLunar && canUseLunarCrush()) {
      try {
        const lcResult = await getLunarCrushScore(
          token,
          tweet.confidence_score || 0.5
        );
        if (lcResult.success && lcResult.score !== null) {
          lunarcrushScore = lcResult.score;
          lunarcrushReasoning = lcResult.reasoning;
          lunarcrushBreakdown = lcResult.breakdown;

          if (lunarcrushScore > 0) {
            positionSizePercent = Math.max(
              0.5,
              Math.min(10, lunarcrushScore * 10)
            );
            console.log(
              `    📊 LunarCrush: ${token} score=${lunarcrushScore.toFixed(
                3
              )}, position=${positionSizePercent.toFixed(2)}%`
            );
          } else {
            positionSizePercent = 0.5;
            console.log(
              `    📊 LunarCrush: ${token} score=${lunarcrushScore.toFixed(
                3
              )} - CAUTION: minimum position (${positionSizePercent}%)`
            );
          }
        }
      } catch (lcError: any) {
        console.log(
          `    ⚠️  LunarCrush scoring failed: ${lcError.message} - using default 5%`
        );
      }
    } else if (!hasPrecomputedLunar) {
      console.log(
        `    ⚠️  LunarCrush not configured - using default 5% position size`
      );
    }

    // Check for existing signal in current 6-hour bucket to avoid Prisma error logging
    const now = new Date();
    const bucket6hStart = new Date(
      Math.floor(now.getTime() / (6 * 60 * 60 * 1000)) * 6 * 60 * 60 * 1000
    );

    const existingSignal = await prisma.signals.findFirst({
      where: {
        agent_id: agent.id,
        token_symbol: token.toUpperCase(),
        created_at: {
          gte: bucket6hStart,
        },
      },
      include: {
        positions: {
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
      // Check if the existing signal's position actually succeeded
      const hasPosition = existingSignal.positions.length > 0;

      let positionFailed = false;
      if (hasPosition) {
        const position = existingSignal.positions[0];
        // Convert Prisma Decimal to number for comparison
        const entryPrice = position.entry_price
          ? Number(position.entry_price.toString())
          : 0;
        const qty = position.qty ? Number(position.qty.toString()) : 0;

        positionFailed =
          position.status === "CLOSED" && entryPrice === 0 && qty === 0;
      }

      if (positionFailed) {
        console.log(
          `    ⚠️  Existing signal for ${token} failed (position closed with 0 values)`
        );
        console.log(
          `    ✅ Allowing new signal to be created (previous execution failed)`
        );
        // Continue to create new signal - don't return
      } else if (!hasPosition && existingSignal.skipped_reason) {
        console.log(
          `    ⚠️  Existing signal for ${token} was skipped: ${existingSignal.skipped_reason}`
        );
        console.log(
          `    ✅ Allowing new signal to be created (previous signal was skipped)`
        );
        // Continue to create new signal - don't return
      } else {
        console.log(
          `    ⏭️  Signal already exists for ${token} (within 6-hour window)`
        );
        return false; // Skip creating duplicate signal
      }
    }

    // Create signal (wrapped in try-catch as fallback)
    // Note: risk_model is unused - position monitor has hardcoded risk management:
    //   • Hard stop loss: 10%
    //   • Trailing stop: Activates at +3% profit, trails by 1%
    try {
      const signal = await prisma.signals.create({
        data: {
          agent_id: agent.id,
          token_symbol: token,
          venue: signalVenue, // MULTI agents → first available venue (Agent Where will re-route if needed)
          side: side,
          size_model: {
            type: "balance-percentage",
            value: positionSizePercent, // Dynamic from LunarCrush!
            impactFactor: tweet.ct_accounts?.impact_factor || 0,
          },
          risk_model: {
            stopLoss: 0.1, // 10% stop loss (default)
            takeProfit: 0.05, // 5% take profit
            leverage: 3, // Default leverage for perpetuals
          },
          source_tweets: [tweet.tweet_id || tweet.message_id],
          lunarcrush_score: lunarcrushScore,
          lunarcrush_reasoning: lunarcrushReasoning,
          lunarcrush_breakdown: lunarcrushBreakdown,
        },
      });

      console.log(
        `    ✅ Signal created: ${side} ${token} on ${signalVenue} (${positionSizePercent.toFixed(
          2
        )}% position)`
      );
      return true; // Signal successfully created
    } catch (createError: any) {
      // P2002: Unique constraint violation (race condition - another worker created it first)
      if (createError.code === "P2002") {
        console.log(
          `    ⏭️  Signal already exists for ${token} (race condition - created by another worker)`
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
    console.log("🚀 Signal Generator Worker starting...");
    console.log(
      `⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60} minutes)`
    );
    console.log("");
    console.log("📋 Signal Generation Flow:");
    console.log("   1. Tweet classified by LLM (in tweet-ingestion-worker)");
    console.log("   2. LunarCrush scores market data → position size (0-10%)");
    console.log("   3. Signal created with side (LONG/SHORT) + size");
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

    // Check LunarCrush availability
    if (canUseLunarCrush()) {
      console.log("✅ LunarCrush Scoring: ENABLED");
    } else {
      console.log("⚠️  LunarCrush Scoring: DISABLED");
      console.log("   Set LUNARCRUSH_API_KEY for dynamic position sizing");
      console.log("   Will use default 5% position size without it");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Run immediately on startup
    await generateSignals();

    // Then run on interval
    workerInterval = setInterval(async () => {
      await generateSignals();
    }, INTERVAL);

    console.log("✅ Signal Generator Worker started successfully");
  } catch (error: any) {
    console.error(
      "[SignalGenerator] ❌ Failed to start worker:",
      error.message
    );
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
setupGracefulShutdown("Signal Generator Worker", server);

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

export { generateSignals };
