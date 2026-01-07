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
import { checkDatabaseHealth, TradeQuotaService } from "@maxxit/database";
import { venue_t } from "@prisma/client";
import { makeTradeDecision } from "./lib/llm-trade-decision";
import {
  getLunarCrushRawData,
  canUseLunarCrush,
} from "./lib/lunarcrush-wrapper";

dotenv.config();

const PORT = process.env.PORT || 5008;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "30000"); // 30 seconds default

// Duplicate signal check configuration
// Set DUPLICATE_SIGNAL_CHECK_ENABLED=false to disable the check entirely
// Set DUPLICATE_SIGNAL_CHECK_HOURS to change the time window (default: 6 hours)
const DUPLICATE_CHECK_ENABLED = process.env.DUPLICATE_SIGNAL_CHECK_ENABLED !== "false"; // Default: true
const DUPLICATE_CHECK_HOURS = parseInt(process.env.DUPLICATE_SIGNAL_CHECK_HOURS || "6"); // Default: 6 hours

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
  console.log(
    `🏥 Signal Generator Worker with LLM health check on port ${PORT}`
  );
});

/**
 * Generate all pending signals
 * Finds tweets with NULL signal analysis and tries to generate signals
 */
async function generateAllSignals() {
  if (isCycleRunning) {
    console.log(
      "[SignalGenerator] ⏭️ Skipping cycle - previous cycle still running"
    );
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

    console.log(
      `[SignalGenerator] 📊 Found ${pendingPosts.length} telegram posts to process`
    );

    if (pendingPosts.length === 0) {
      console.log("[SignalGenerator] ✅ No pending telegram posts to process");
    } else {
      // Process each post
      for (const post of pendingPosts) {
        try {
          console.log(
            `[SignalGenerator] 🔄 Processing post ${post.id.substring(0, 8)}...`
          );
          console.log(
            `[SignalGenerator]    Content: "${post.message_text.substring(
              0,
              100
            )}..."`
          );
          console.log(`[SignalGenerator]    Signal: ${post.signal_type}`);
          console.log(
            `[SignalGenerator]    Confidence: ${(
              post.confidence_score || 0
            ).toFixed(2)}`
          );

          // Get agents based on the source of the post
          let agents: any[] = [];
          let influencerImpactFactor = 50; // Default to 50 (neutral) - will be updated if alpha_user_id exists


          if (post.alpha_user_id) {
            // For Telegram Alpha Users: find agents linked via agent_telegram_users
            // This is the proper way - only agents explicitly subscribed to this alpha user
            const alphaUser = await prisma.telegram_alpha_users.findUnique({
              where: { id: post.alpha_user_id },
            });

            if (!alphaUser) {
              console.log(`[SignalGenerator] ⚠️  Alpha user not found for post`);
              continue;
            }

            // Get the source user's flags
            const isLazyTrader = (alphaUser as any)?.lazy_trader === true;
            const isPublicSource = (alphaUser as any)?.public_source === true;

            // Get the influencer's impact factor (historical performance)
            influencerImpactFactor = (alphaUser as any)?.impact_factor ?? 50; // Default to 50 (neutral) if not set
            console.log(`[SignalGenerator]    Impact Factor of source: ${influencerImpactFactor}/100`);

            console.log(
              `[SignalGenerator]    Source: @${alphaUser.telegram_username || alphaUser.first_name
              }`
            );
            console.log(
              `[SignalGenerator]    Flags: lazy_trader=${isLazyTrader}, public_source=${isPublicSource}`
            );

            // Skip if source is neither lazy_trader nor public_source (invalid signal source)
            if (!isLazyTrader && !isPublicSource) {
              console.log(
                `[SignalGenerator] ⏭️  Skipping - source is neither lazy_trader nor public_source`
              );
              continue;
            }

            // Get agents linked to this telegram alpha user
            const agentLinks = await prisma.agent_telegram_users.findMany({
              where: { telegram_alpha_user_id: post.alpha_user_id },
              include: {
                agents: {
                  include: {
                    agent_deployments: {
                      where: {
                        status: "ACTIVE",
                      },
                    },
                  },
                },
              },
            });

            // Filter agents based on source user's flags and agent status:
            //
            // For PUBLIC agents: only include if source is public_source
            // For PRIVATE agents: include if source is lazy_trader OR public_source
            //   - lazy_trader=true: lazy trader agents receiving their own signals
            //   - public_source=true: normal private agents subscribed to public alphas
            // DRAFT agents: never include
            agents = agentLinks
              .map((link) => link.agents)
              .filter((agent) => {
                // Skip agents with no active deployments
                if (
                  !agent.agent_deployments ||
                  agent.agent_deployments.length === 0
                ) {
                  return false;
                }

                if (agent.status === "PUBLIC") {
                  if (!isPublicSource) {
                    console.log(
                      `[SignalGenerator]    ⏭️  Skipping PUBLIC agent ${agent.name}: source is not public_source`
                    );
                    return false;
                  }
                  return true;
                }

                if (agent.status === "PRIVATE") {
                  if (isLazyTrader || isPublicSource) {
                    return true;
                  }
                  console.log(
                    `[SignalGenerator]    ⏭️  Skipping PRIVATE agent ${agent.name}: source is neither lazy_trader nor public_source`
                  );
                  return false;
                }

                // DRAFT agents should never receive signals
                return false;
              });
          } else if (post.source_id) {
            // For Telegram Channels: find agents linked via research_institutes
            const telegramSource = await prisma.telegram_sources.findUnique({
              where: { id: post.source_id },
              include: {
                research_institutes: {
                  include: {
                    agent_research_institutes: {
                      include: {
                        agents: {
                          include: {
                            agent_deployments: {
                              where: {
                                status: "ACTIVE",
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            });

            if (telegramSource?.research_institutes) {
              agents =
                telegramSource.research_institutes.agent_research_institutes
                  .map((ari) => ari.agents)
                  .filter((agent) => {
                    // Skip agents with no active deployments
                    if (
                      !agent.agent_deployments ||
                      agent.agent_deployments.length === 0
                    ) {
                      return false;
                    }
                    // For telegram channels, only PUBLIC agents receive signals
                    return agent.status === "PUBLIC";
                  });
            }
          } else {
            console.log(
              `[SignalGenerator] ⚠️  Post has no alpha_user_id or source_id, skipping`
            );
            continue;
          }

          if (agents.length === 0) {
            console.log(
              "[SignalGenerator] ⚠️  No eligible agents found for this source"
            );
            // Mark as processed even if no agents
            await prisma.telegram_posts.update({
              where: { id: post.id },
              data: { processed_for_signals: true },
            });
            continue;
          }

          console.log(
            `[SignalGenerator] 🤖 Found ${agents.length} eligible agent(s)`
          );

          // Extract tokens from classified post
          const extractedTokens = post.extracted_tokens || [];

          if (extractedTokens.length === 0) {
            console.log("[SignalGenerator] ⏭️  No tokens extracted, skipping");
            continue;
          }

          console.log(
            `[SignalGenerator] 🪙 Tokens: ${extractedTokens.join(", ")}`
          );

          // Generate signal for each deployment, agent, and token combination
          // Each deployment has its own trading preferences, so we generate separate signals
          for (const agent of agents) {
            // Check if this is a Lazy Trader agent
            // Lazy Trader agents are PRIVATE agents with names containing "Lazy" and "Trader" (case-insensitive)
            // This handles variations like "Lazy Trader", "Lazyz rader", etc.
            const isLazyTraderAgent =
              agent.status === "PRIVATE" &&
              agent.name &&
              agent.name.toLowerCase().includes("lazy") &&
              agent.name.toLowerCase().includes("trader");

            console.log("checking lazy trader agent",agent.status + " " + agent.name + " " + isLazyTraderAgent)

            console.log(
              `[SignalGenerator]    🔍 Checking Lazy Trader agent: ${agent.name}, isLazyTraderAgent: ${isLazyTraderAgent}`
            );

            if (isLazyTraderAgent) {
              console.log(
                `[SignalGenerator]    🔍 Detected Lazy Trader agent: ${agent.name} - will deprioritize confidence score`
              );
            }

          for (const deployment of agent.agent_deployments) {
            // Check trade quota before generating signal
            try {
              const hasQuota = await TradeQuotaService.hasAvailableTrades(deployment.user_wallet);
              if (!hasQuota) {
                console.log(
                  `[SignalGenerator]    ⏭️  User ${deployment.user_wallet.substring(0, 10)}... has no trade quota - skipping deployment`
                );
                continue;
              }
            } catch (quotaCheckError: any) {
              console.log(
                `[SignalGenerator]    ⚠️  Failed to check trade quota: ${quotaCheckError.message} - proceeding anyway`
              );
            }

            for (const token of extractedTokens) {
              try {
                const success = await generateSignalForAgentAndToken(
                  post,
                  agent,
                  deployment,
                  token,
                  isLazyTraderAgent,
                  influencerImpactFactor
                );

                if (success) {
                  console.log(
                    `[SignalGenerator] ✅ Signal created for ${agent.name
                    } (deployment ${deployment.id.substring(0, 8)}): ${token}`
                  );

                  // Deduct trade quota after successful signal creation
                  try {
                    await TradeQuotaService.useTradeQuota(deployment.user_wallet);
                    console.log(
                      `[SignalGenerator]    💳 Trade quota deducted for ${deployment.user_wallet.substring(0, 10)}...`
                    );
                  } catch (quotaDeductError: any) {
                    console.error(
                      `[SignalGenerator]    ⚠️  Failed to deduct trade quota: ${quotaDeductError.message}`
                    );
                  }
                }
              } catch (error: any) {
                console.error(
                  `[SignalGenerator] ❌ Failed to generate signal for ${agent.name
                  } (deployment ${deployment.id.substring(0, 8)}): ${token}: ${error.message
                  }`
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
    }

    // ========================================================================
    // Process Trader Trades (Copy Trading Alpha Clubs)
    // ========================================================================

    const pendingTraderTrades = await prisma.trader_trades.findMany({
      where: {
        processed_for_signals: false,
      },
      orderBy: {
        trade_timestamp: "desc",
      }
    });

    console.log(
      `[SignalGenerator] 📊 Found ${pendingTraderTrades.length} trader trades to process`
    );

    for (const traderTrade of pendingTraderTrades) {
      try {
        console.log(
          `[SignalGenerator] 🔄 Processing trader trade ${traderTrade.id.substring(0, 8)}...`
        );
        console.log(
          `[SignalGenerator]    Token: ${traderTrade.token_symbol} | Side: ${traderTrade.side}`
        );
        console.log(
          `[SignalGenerator]    Trader: ${traderTrade.trader_wallet.substring(0, 10)}...`
        );

        // Get the agent and its deployments
        const agent = await prisma.agents.findUnique({
          where: { id: traderTrade.agent_id },
          include: {
            agent_deployments: {
              where: { status: "ACTIVE" },
            },
            agent_top_traders: {
              where: { is_active: true },
              include: {
                top_traders: {
                  select: { impact_factor: true },
                },
              },
            },
          },
        });

        if (!agent) {
          console.log(`[SignalGenerator] ⚠️  Agent not found, marking as processed`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        if (agent.status !== "PUBLIC" && agent.status !== "PRIVATE") {
          console.log(`[SignalGenerator] ⏭️  Agent is DRAFT, skipping`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        const deployments = agent.agent_deployments;
        if (deployments.length === 0) {
          console.log(`[SignalGenerator] ⚠️  No active deployments (club members)`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        console.log(
          `[SignalGenerator] 🤖 Found ${deployments.length} club member(s) to receive signals`
        );

        // Get the top trader's impact factor for this trade
        const topTrader = await prisma.top_traders.findFirst({
          where: { wallet_address: traderTrade.trader_wallet.toLowerCase() },
          select: { impact_factor: true },
        });
        const traderImpactFactor = topTrader?.impact_factor ?? 50;
        console.log(
          `[SignalGenerator]    Trader Impact Factor: ${traderImpactFactor.toFixed(2)}/100`
        );

        const entryPrice = Number(traderTrade.entry_price.toString());
        const takeProfitPrice = traderTrade.take_profit_price ? Number(traderTrade.take_profit_price.toString()) : null;
        const stopLossPrice = traderTrade.stop_loss_price ? Number(traderTrade.stop_loss_price.toString()) : null;

        let takeProfitPercent = 0.10;
        let stopLossPercent = 0.05;

        if (entryPrice > 0) {
          if (takeProfitPrice && takeProfitPrice > 0) {
            if (traderTrade.side === "LONG") {
              takeProfitPercent = Math.abs((takeProfitPrice - entryPrice) / entryPrice);
            } else {
              takeProfitPercent = Math.abs((entryPrice - takeProfitPrice) / entryPrice);
            }
          }

          if (stopLossPrice && stopLossPrice > 0) {
            if (traderTrade.side === "LONG") {
              stopLossPercent = Math.abs((entryPrice - stopLossPrice) / entryPrice);
            } else {
              stopLossPercent = Math.abs((stopLossPrice - entryPrice) / entryPrice);
            }
          }
        }

        console.log(
          `[SignalGenerator]    TP: ${(takeProfitPercent * 100).toFixed(2)}% (${takeProfitPrice ? 'from trader' : 'default'}) | SL: ${(stopLossPercent * 100).toFixed(2)}% (${stopLossPrice ? 'from trader' : 'default'})`
        );

        const normalizedTraderTrade = {
          id: traderTrade.id,
          message_id: traderTrade.source_trade_id,
          message_text: `Copy trade from top trader: ${traderTrade.side} ${traderTrade.token_symbol} with ${traderTrade.leverage}x leverage`,
          message_created_at: traderTrade.trade_timestamp,
          signal_type: traderTrade.side,
          extracted_tokens: [traderTrade.token_symbol],
          confidence_score: 0.7,
          alpha_user_id: null,
          source_id: null,
          take_profit: takeProfitPercent,
          stop_loss: stopLossPercent,
          take_profit_price: takeProfitPrice,
          stop_loss_price: stopLossPrice,
          timeline_window: null,
        };

        // Generate signals for each deployment
        for (const deployment of deployments) {
          try {
            const success = await generateSignalForAgentAndToken(
              normalizedTraderTrade,
              agent,
              deployment,
              traderTrade.token_symbol,
              false,
              traderImpactFactor
            );

            if (success) {
              console.log(
                `[SignalGenerator] ✅ Signal created for ${agent.name} (deployment ${deployment.id.substring(0, 8)}): ${traderTrade.token_symbol}`
              );
            }
          } catch (error: any) {
            console.error(
              `[SignalGenerator] ❌ Failed to generate signal for ${agent.name} (deployment ${deployment.id.substring(0, 8)}): ${traderTrade.token_symbol}: ${error.message}`
            );
          }
        }

        await prisma.trader_trades.update({
          where: { id: traderTrade.id },
          data: { processed_for_signals: true },
        });
      } catch (error: any) {
        console.error(
          `[SignalGenerator] ❌ Error processing trader trade ${traderTrade.id}:`,
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
 * @param isLazyTraderAgent - True if this is a Lazy Trader agent (don't prioritize confidence score as much)
 * @param influencerImpactFactor - Impact factor of the signal sender (0-100, 50=neutral)
 * @returns true if signal was created, false if skipped
 */
async function generateSignalForAgentAndToken(
  post: any,
  agent: any,
  deployment: any,
  token: string,
  isLazyTraderAgent: boolean = false,
  influencerImpactFactor: number = 50
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
        // const hyperliquidMarket = await prisma.venue_markets.findFirst({
        //   where: {
        //     token_symbol: token.toUpperCase(),
        //     venue: "HYPERLIQUID",
        //     is_active: true,
        //   },
        // });

        // if (hyperliquidMarket) {
        //   venueMarket = hyperliquidMarket;
        //   signalVenue = "HYPERLIQUID";
        //   console.log(
        //     `    ✅ ${token} available on HYPERLIQUID (not on OSTIUM, using HYPERLIQUID)`
        //   );
        // } else {
        //   console.log(
        //     `    ⏭️  Skipping ${token} - not available on OSTIUM or HYPERLIQUID`
        //   );
        //   console.log(
        //     `       (Multi-venue agents need token on at least one enabled venue)`
        //   );
        //   return false;
        // }

        console.log(`    ⏭️  Skipping ${token} - not available on OSTIUM`);
        console.log(
          `    📝 Creating skipped signal - token not supported in venue_markets`
        );

        // Determine side from post sentiment
        const side = post.signal_type === "SHORT" ? "SHORT" : "LONG";

        try {
          await prisma.signals.create({
            data: {
              agent_id: agent.id,
              deployment_id: deployment.id,
              token_symbol: token,
              venue: "OSTIUM", // Default to OSTIUM for MULTI agents
              side: side,
              size_model: {
                type: "balance-percentage",
                value: 0,
                impactFactor: 0,
              },
              risk_model: {
                stopLoss: 0.1,
                takeProfit: 0.05,
                leverage: 1,
              },
              source_tweets: [post.message_id],
              skipped_reason: `Token ${token} is not supported/available in Ostium pairs`,
              llm_decision: `Token ${token} is not supported/available in Ostium pairs. Cannot proceed with trade.`,
              llm_should_trade: false,
              llm_fund_allocation: 0,
              llm_leverage: 0,
              trade_executed: null,
            },
          });

          console.log(
            `    ✅ Skipped signal stored for deployment ${deployment.id.substring(
              0,
              8
            )}: ${token} - Token not supported in OSTIUM`
          );

          // Deduct trade quota for processing this signal
          try {
            await TradeQuotaService.useTradeQuota(deployment.user_wallet);
            console.log(
              `    💳 Trade quota deducted for ${deployment.user_wallet.substring(0, 10)}...`
            );
          } catch (quotaError: any) {
            console.error(
              `    ⚠️  Failed to deduct trade quota: ${quotaError.message}`
            );
          }
        } catch (error) {
          console.error(`    ❌ Error storing skipped signal: ${error}`);
        }

        return false;
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
        console.log(
          `    📝 Creating skipped signal - token not supported in venue_markets`
        );

        // Determine side from post sentiment
        const side = post.signal_type === "SHORT" ? "SHORT" : "LONG";

        try {
          await prisma.signals.create({
            data: {
              agent_id: agent.id,
              deployment_id: deployment.id,
              token_symbol: token,
              venue: agent.venue,
              side: side,
              size_model: {
                type: "balance-percentage",
                value: 0,
                impactFactor: 0,
              },
              risk_model: {
                stopLoss: 0.1,
                takeProfit: 0.05,
                leverage: 1,
              },
              source_tweets: [post.message_id],
              skipped_reason: `Token ${token} is not supported/available in ${agent.venue} pairs`,
              llm_decision: `Token ${token} is not supported/available in ${agent.venue} pairs. Cannot proceed with trade.`,
              llm_should_trade: false,
              llm_fund_allocation: 0,
              llm_leverage: 0,
              trade_executed: null,
            },
          });

          console.log(
            `    ✅ Skipped signal stored for deployment ${deployment.id.substring(
              0,
              8
            )}: ${token} - Token not supported in ${agent.venue}`
          );

          // Deduct trade quota for processing this signal
          try {
            await TradeQuotaService.useTradeQuota(deployment.user_wallet);
            console.log(
              `    💳 Trade quota deducted for ${deployment.user_wallet.substring(0, 10)}...`
            );
          } catch (quotaError: any) {
            console.error(
              `    ⚠️  Failed to deduct trade quota: ${quotaError.message}`
            );
          }
        } catch (error) {
          console.error(`    ❌ Error storing skipped signal: ${error}`);
        }

        return false;
      }

      signalVenue = agent.venue; // Use agent's specific venue
      console.log(
        `    ✅ ${token} available on ${agent.venue} (${venueMarket.market_name})`
      );
    }

    // Determine side from post sentiment (already classified by LLM)
    const side = post.signal_type === "SHORT" ? "SHORT" : "LONG";

    // Check for existing signal (configurable via environment variables)
    if (DUPLICATE_CHECK_ENABLED) {
      const now = new Date();
      const checkWindowMs = DUPLICATE_CHECK_HOURS * 60 * 60 * 1000;
      const checkWindowStart = new Date(now.getTime() - checkWindowMs);

      const existingSignal = await prisma.signals.findFirst({
        where: {
          agent_id: agent.id,
          deployment_id: deployment.id,
          token_symbol: token.toUpperCase(),
          created_at: {
            gte: checkWindowStart,
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
              `    ⏭️  Signal already exists for ${token} for this deployment (within last ${DUPLICATE_CHECK_HOURS} hours)`
            );
            return false;
          }
        } else if (existingSignal.skipped_reason) {
          console.log(
            `    ⏭️  Skipped signal already exists for ${token} (within last ${DUPLICATE_CHECK_HOURS} hours)`
          );
          return false;
        } else {
          console.log(
            `    ⏭️  Signal exists but no position yet for ${token} - trade executor will process`
          );
          return false;
        }
      }
    } else {
      console.log(`    ℹ️  Duplicate signal check DISABLED - proceeding without check`);
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
    let venueMakerMaxLeverage: number | undefined;

    if (signalVenue === "HYPERLIQUID") {
      // Get Hyperliquid balance via service
      const userAddress = await prisma.user_agent_addresses.findUnique({
        where: { user_wallet: deployment.user_wallet.toLowerCase() },
        select: { hyperliquid_agent_address: true },
      });

      if (userAddress?.hyperliquid_agent_address) {
        try {
          const balanceResponse = await fetch(
            `${process.env.HYPERLIQUID_SERVICE_URL ||
            "https://hyperliquid-service.onrender.com"
            }/balance`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: userAddress.hyperliquid_agent_address,
              }),
            }
          );

          if (balanceResponse.ok) {
            const balanceData = (await balanceResponse.json()) as any;
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
            `${process.env.OSTIUM_SERVICE_URL || "http://localhost:5002"
            }/balance`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: deployment.safe_wallet || deployment.user_wallet,
              }),
            }
          );

          if (balanceResponse.ok) {
            const balanceData = (await balanceResponse.json()) as any;
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
        ostiumPair = await prisma.ostium_available_pairs.findFirst({
          where: { symbol },
        });
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

      // If token not found in ostium_available_pairs, log warning
      // Note: This should theoretically not happen if venue_markets is properly synced
      // The token should have been caught earlier in the venue_markets check
      if (!ostiumPair) {
        console.log(
          `    ⚠️  Token ${token} not found in ostium_available_pairs (but was in venue_markets)`
        );
        console.log(
          `    ⚠️  This indicates a sync issue between venue_markets and ostium_available_pairs`
        );
        // Continue anyway - we'll use default leverage
      }

      if (
        ostiumPair?.max_leverage !== undefined &&
        ostiumPair?.max_leverage !== null
      ) {
        const numericLeverage = Number(ostiumPair.max_leverage);
        venueMaxLeverage = Number.isFinite(numericLeverage)
          ? numericLeverage
          : undefined;
      }

      if (
        ostiumPair?.maker_max_leverage !== undefined &&
        ostiumPair?.maker_max_leverage !== null
      ) {
        const numericMakerLeverage = Number(ostiumPair.maker_max_leverage);
        venueMakerMaxLeverage = Number.isFinite(numericMakerLeverage)
          ? numericMakerLeverage
          : undefined;
      }
    }

    // Get raw LunarCrush data if available (for additional context)
    let lunarcrushData: {
      data: Record<string, any>;
      descriptions: Record<string, string>;
    } | null = null;
    if (canUseLunarCrush()) {
      try {
        const rawDataResult = await getLunarCrushRawData(token);
        if (
          rawDataResult.success &&
          rawDataResult.data &&
          rawDataResult.descriptions
        ) {
          lunarcrushData = {
            data: rawDataResult.data,
            descriptions: rawDataResult.descriptions,
          };
        }
      } catch (error) {
        console.log(`    ⚠️  Failed to fetch LunarCrush data: ${error}`);
      }
    }

    let currentPositions: {
      token: string;
      side: string;
      collateral: number;
      entryPrice: number;
      leverage: number;
      notionalUsd: number;
      takeProfitPrice: number | null;
      stopLossPrice: number | null;
      tradeId: string;
    }[] = [];

    if (signalVenue === "OSTIUM") {
      const userAddress = await prisma.user_agent_addresses.findUnique({
        where: { user_wallet: deployment.user_wallet.toLowerCase() },
        select: { ostium_agent_address: true },
      });

      if (userAddress?.ostium_agent_address) {
        try {
          const positionsResponse = await fetch(
            `${process.env.OSTIUM_SERVICE_URL || "http://localhost:5002"}/positions`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: deployment.safe_wallet || deployment.user_wallet,
              }),
            }
          );

          if (positionsResponse.ok) {
            const positionsData = (await positionsResponse.json()) as any;
            if (positionsData.success && Array.isArray(positionsData.positions)) {
              currentPositions = positionsData.positions.map((pos: any) => ({
                token: pos.market,
                side: pos.side?.toUpperCase() || "",
                collateral: pos.collateral || 0,
                entryPrice: pos.entryPrice || 0,
                leverage: pos.leverage || 1,
                notionalUsd: pos.notionalUsd || 0,
                takeProfitPrice: pos.takeProfitPrice || null,
                stopLossPrice: pos.stopLossPrice || null,
                tradeId: pos.tradeId || "",
              }));
            }
          }
        } catch (error) {
          console.log(`    ⚠️  Failed to fetch Ostium positions: ${error}`);
        }
      }
    } else if (signalVenue === "HYPERLIQUID") {
      const openPositions = await prisma.positions.findMany({
        where: {
          deployment_id: deployment.id,
          status: "OPEN",
          venue: "HYPERLIQUID",
        },
        select: {
          id: true,
          token_symbol: true,
          side: true,
          qty: true,
          entry_price: true,
          take_profit: true,
          stop_loss: true,
        },
      });

      currentPositions = openPositions.map((pos) => ({
        token: pos.token_symbol,
        side: pos.side,
        collateral: pos.qty ? Number(pos.qty) : 0,
        entryPrice: pos.entry_price ? Number(pos.entry_price) : 0,
        leverage: 1,
        notionalUsd: pos.qty ? Number(pos.qty) : 0,
        takeProfitPrice: pos.take_profit ? Number(pos.take_profit) : null,
        stopLossPrice: pos.stop_loss ? Number(pos.stop_loss) : null,
        tradeId: pos.id,
      }));
    }

    console.log(`    📈 Current open positions from ${signalVenue}: ${currentPositions.length}`);

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
      makerMaxLeverage: venueMakerMaxLeverage,
      currentPositions,
      isLazyTraderAgent,
      influencerImpactFactor,
    });

    console.log(
      `    📊 LLM Decision: ${tradeDecision.shouldOpenNewPosition ? "OPEN NEW" : "SKIP"} | Net Position Change: ${tradeDecision.netPositionChange || "NONE"}`
    );
    if (tradeDecision.closeExistingPositionIds.length > 0) {
      console.log(`    🔄 Close Positions: ${tradeDecision.closeExistingPositionIds.join(', ')}`);
    }
    console.log(
      `    💰 Fund Allocation: ${tradeDecision.fundAllocation.toFixed(2)}%`
    );
    if (signalVenue === "OSTIUM") {
      console.log(`    ⚙️  Leverage: ${tradeDecision.leverage}x`);
    }
    console.log(`    💭 Reason: ${tradeDecision.reason}`);

    // If LLM decides not to open a new position, create a skipped signal record
    if (!tradeDecision.shouldOpenNewPosition) {
      console.log(`    ⏭️  Creating skipped signal based on LLM decision (net: ${tradeDecision.netPositionChange || "NONE"})`);

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
              stopLoss: post.stop_loss || 0.05,
              takeProfit: post.take_profit || 0.1,
              leverage: signalVenue === "OSTIUM" ? tradeDecision.leverage : 3,
            },
            source_tweets: [post.message_id],
            skipped_reason: tradeDecision.reason,
            llm_decision: tradeDecision.reason,
            llm_should_trade: tradeDecision.shouldOpenNewPosition,
            llm_fund_allocation: tradeDecision.fundAllocation,
            llm_leverage: tradeDecision.leverage,
            llm_close_trade_id: tradeDecision.closeExistingPositionIds.length > 0
              ? JSON.stringify(tradeDecision.closeExistingPositionIds)
              : null,
            llm_net_position_change: tradeDecision.netPositionChange || "NONE",
            trade_executed: null,
          },
        });

        console.log(
          `    ✅ Skipped signal stored for deployment ${deployment.id.substring(
            0,
            8
          )}: ${side} ${token} on ${signalVenue}`
        );
        console.log(`    💭 Skipped reason: ${tradeDecision.reason}`);

        // Deduct trade quota for processing this signal
        try {
          await TradeQuotaService.useTradeQuota(deployment.user_wallet);
          console.log(
            `    💳 Trade quota deducted for ${deployment.user_wallet.substring(0, 10)}...`
          );
        } catch (quotaError: any) {
          console.error(
            `    ⚠️  Failed to deduct trade quota: ${quotaError.message}`
          );
        }
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
            stopLoss: post.stop_loss || 0.05,
            takeProfit: post.take_profit || 0.10,
            leverage: signalVenue === "OSTIUM" ? tradeDecision.leverage : 3, // Use LLM leverage for Ostium, default for Hyperliquid
          },
          source_tweets: [post.message_id],
          llm_decision: tradeDecision.reason,
          llm_should_trade: tradeDecision.shouldOpenNewPosition,
          llm_fund_allocation: tradeDecision.fundAllocation,
          llm_leverage: tradeDecision.leverage,
          llm_close_trade_id: tradeDecision.closeExistingPositionIds.length > 0
            ? JSON.stringify(tradeDecision.closeExistingPositionIds)
            : null,
          llm_net_position_change: tradeDecision.netPositionChange || "NONE",
          trade_executed: null,
        },
      });

      console.log(
        `    ✅ Signal created for deployment ${deployment.id.substring(
          0,
          8
        )}: ${side} ${token} on ${signalVenue} (${tradeDecision.fundAllocation.toFixed(
          2
        )}% position)`
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
    console.log(
      "   2. LLM decision for trade execution, fund allocation, and leverage"
    );
    console.log("   3. Signal created if LLM decides to trade");
    console.log("");
    console.log("🛡️  Risk Management (Hardcoded in Position Monitor):");
    console.log("   • Hard Stop Loss: 10%");
    console.log("   • Trailing Stop: Activates at +3% profit, trails by 1%");
    console.log(
      "   Note: These are NOT read from signal, but hardcoded in monitor"
    );
    console.log("");
    console.log("🔄 Duplicate Signal Check Configuration:");
    console.log(`   • Enabled: ${DUPLICATE_CHECK_ENABLED ? "YES" : "NO"}`);
    if (DUPLICATE_CHECK_ENABLED) {
      console.log(`   • Time Window: ${DUPLICATE_CHECK_HOURS} hours`);
    }
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
      side: "LONG",
    })
      .then(() => true)
      .catch(() => false);

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
