/**
 * Signal Generator Worker with BullMQ (Event-Driven Parallel Processing)
 *
 * Generates trading signals from classified telegram posts using LLM (Perplexity).
 * Jobs are processed in parallel across multiple workers for faster throughput.
 *
 * Flow:
 * 1. Interval trigger finds unprocessed telegram posts with is_signal_candidate=true
 * 2. For each post/deployment/token combination, a job is added to the queue
 * 3. Worker pool processes jobs in parallel, calling Perplexity LLM for trade decisions
 * 4. Signals are created in the database based on LLM decisions
 */

import dotenv from "dotenv";
import express from "express";
import {
  prisma,
  checkDatabaseHealth,
  disconnectPrisma,
  TradeQuotaService,
} from "@maxxit/database";
import {
  setupGracefulShutdown,
  registerCleanup,
  createHealthCheckHandler,
} from "@maxxit/common";
import { venue_t } from "@prisma/client";
import {
  createWorkerPool,
  createQueue,
  addJob,
  getQueueStats,
  startIntervalTrigger,
  shutdownQueueService,
  isRedisHealthy,
  withLock,
  waitForLock,
  releaseLock,
  getSignalGenerationLockKey,
  getUserQuotaLockKey,
  QueueName,
  GenerateTelegramSignalJobData,
  GenerateTraderTradeSignalJobData,
  SignalGenerationJobData,
  SendNotificationJobData,
  JobResult,
  Job,
} from "@maxxit/queue";
import { makeTradeDecision } from "./lib/llm-trade-decision";
import {
  getLunarCrushRawData,
  canUseLunarCrush,
} from "./lib/lunarcrush-wrapper";

// Bull Board imports
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

dotenv.config();

const PORT = process.env.PORT || 5008;
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || "3");
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "3");
const TRIGGER_INTERVAL = parseInt(process.env.TRIGGER_INTERVAL || "60000"); // 60 seconds

// Duplicate signal check configuration
const DUPLICATE_CHECK_ENABLED =
  process.env.DUPLICATE_SIGNAL_CHECK_ENABLED !== "false";
const DUPLICATE_CHECK_HOURS = parseInt(
  process.env.DUPLICATE_SIGNAL_CHECK_HOURS || "6"
);

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("signal-generator-worker", async () => {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      isRedisHealthy(),
    ]);

    let queueStats = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
    try {
      queueStats = await getQueueStats(QueueName.SIGNAL_GENERATION);
    } catch {
      // Queue might not be initialized yet
    }

    return {
      database: dbHealthy ? "connected" : "disconnected",
      redis: redisHealthy ? "connected" : "disconnected",
      workerCount: WORKER_COUNT,
      workerConcurrency: WORKER_CONCURRENCY,
      triggerInterval: TRIGGER_INTERVAL,
      queue: queueStats,
    };
  })
);

const server = app.listen(PORT, () => {
  console.log(`🏥 Signal Generator Worker health check on port ${PORT}`);
});

/**
 * Setup Bull Board for queue visualization
 */
function setupBullBoard() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  const signalGenerationQueue = createQueue(QueueName.SIGNAL_GENERATION);

  createBullBoard({
    queues: [new BullMQAdapter(signalGenerationQueue)],
    serverAdapter,
  });

  app.use("/admin/queues", serverAdapter.getRouter());
  console.log(
    `📊 Bull Board available at http://localhost:${PORT}/admin/queues`
  );
}

// Stablecoins should NOT be traded (they are base currency)
const EXCLUDED_TOKENS = ["USDC", "USDT", "DAI", "USDC.E", "BUSD", "FRAX"];

/**
 * Queue a notification job for the user
 * This sends immediate notifications for skipped signals, quota exceeded, etc.
 */
async function queueNotification(params: {
  userWallet: string;
  notificationType: SendNotificationJobData["notificationType"];
  signalId?: string;
  context?: {
    token?: string;
    side?: string;
    venue?: string;
    agentName?: string;
    reason?: string;
  };
}): Promise<void> {
  try {
    // Use stable job ID for deduplication:
    // - For signal-based notifications: use signalId
    // - For quota notifications: use wallet + token + time window (5 min) to prevent spam
    let jobId: string;

    if (params.signalId) {
      // Signal-based notification - unique per signal
      jobId = `notify-${params.signalId}-${params.userWallet.toLowerCase()}`;
    } else if (params.notificationType === "QUOTA_EXCEEDED") {
      // Quota exceeded - deduplicate per user + token within a 5-minute window
      // This prevents spamming users when multiple deployments hit quota simultaneously
      const timeWindow = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute windows
      const token = params.context?.token || "general";
      jobId = `notify-quota-${params.userWallet.toLowerCase()}-${token}-${timeWindow}`;
    } else {
      // Other notifications - use timestamp but include more context
      const token = params.context?.token || "general";
      const agent =
        params.context?.agentName?.replace(/\s+/g, "_") || "unknown";
      jobId = `notify-${params.notificationType
        }-${params.userWallet.toLowerCase()}-${token}-${agent}-${Date.now()}`;
    }

    await addJob(
      QueueName.TELEGRAM_NOTIFICATION,
      "send-notification",
      {
        type: "SEND_NOTIFICATION" as const,
        signalId: params.signalId,
        userWallet: params.userWallet.toLowerCase(),
        notificationType: params.notificationType,
        context: params.context,
        timestamp: Date.now(),
      },
      { jobId }
    );
    console.log(
      `[SignalGen] 📤 Queued ${params.notificationType
      } notification for ${params.userWallet.substring(
        0,
        10
      )}... (jobId: ${jobId.substring(0, 30)}...)`
    );
  } catch (notifyError: any) {
    // Job with same ID already exists - this is expected for deduplication
    if (notifyError.message?.includes("already exists")) {
      console.log(
        `[SignalGen] ⏭️  Notification already queued for ${params.userWallet.substring(
          0,
          10
        )}... (deduplication)`
      );
      return;
    }
    console.error(
      `[SignalGen] ⚠️  Failed to queue notification: ${notifyError.message}`
    );
  }
}

/**
 * Process a single signal generation job
 */
async function processSignalGenerationJob(
  job: Job<SignalGenerationJobData>
): Promise<JobResult> {
  const { data } = job;

  if (data.type === "GENERATE_TELEGRAM_SIGNAL") {
    const jobData = data as GenerateTelegramSignalJobData;
    const { postId, deploymentId, token } = jobData;

    const lockKey = getSignalGenerationLockKey(postId, deploymentId, token);

    // Use distributed lock to prevent duplicate signal generation
    const result = await withLock(lockKey, async () => {
      return await generateTelegramSignalForJob(jobData);
    });

    if (result === undefined) {
      return {
        success: true,
        message: "Job skipped - another worker is processing this signal",
      };
    }

    return result;
  } else if (data.type === "GENERATE_TRADER_TRADE_SIGNAL") {
    const jobData = data as GenerateTraderTradeSignalJobData;
    const { tradeId, deploymentId, tokenSymbol } = jobData;

    const lockKey = getSignalGenerationLockKey(
      tradeId,
      deploymentId,
      tokenSymbol
    );

    // Use distributed lock to prevent duplicate signal generation
    const result = await withLock(lockKey, async () => {
      return await generateTraderTradeSignalForJob(jobData);
    });

    if (result === undefined) {
      // Lock could not be acquired, throw error so BullMQ retries
      throw new Error(`Lock busy for signal ${tradeId.substring(0, 8)}-${tokenSymbol} - will retry`);
    }

    return result;
  }

  return {
    success: false,
    error: `Unknown job type: ${(data as any).type}`,
  };
}

/**
 * Generate signal for a specific telegram signal job
 */
async function generateTelegramSignalForJob(
  jobData: GenerateTelegramSignalJobData
): Promise<JobResult> {
  const {
    postId,
    agentId,
    deploymentId,
    token,
    isLazyTraderAgent,
    influencerImpactFactor,
  } = jobData;

  try {
    // Fetch post, agent, and deployment
    const [post, agent, deployment] = await Promise.all([
      prisma.telegram_posts.findUnique({ where: { id: postId } }),
      prisma.agents.findUnique({ where: { id: agentId } }),
      prisma.agent_deployments.findUnique({ where: { id: deploymentId } }),
    ]);

    if (!post || !agent || !deployment) {
      console.log(
        `[SignalGen] ⚠️  Data not found: post=${!!post}, agent=${!!agent}, deployment=${!!deployment}`
      );
      return { success: false, error: "Post, agent, or deployment not found" };
    }

    // ========================================================================
    // ATOMIC QUOTA RESERVATION WITH USER-LEVEL LOCK
    // This prevents race conditions when multiple deployments for the same user
    // try to reserve quota simultaneously
    // ========================================================================
    const quotaLockKey = getUserQuotaLockKey(deployment.user_wallet);
    let quotaReserved = false;

    // Wait for up to 10 seconds to acquire the quota lock
    // This ensures proper ordering of quota operations for the same user
    const quotaLockAcquired = await waitForLock(quotaLockKey, 10000, 30000);

    if (!quotaLockAcquired) {
      console.log(
        `[SignalGen] ⚠️  Could not acquire quota lock for ${deployment.user_wallet.substring(
          0,
          10
        )}... - retrying later`
      );
      throw new Error("Could not acquire quota lock - will retry");
    }

    try {
      // Atomically check and reserve quota
      const quotaResult = await TradeQuotaService.reserveTradeQuota(
        deployment.user_wallet
      );

      if (!quotaResult.success) {
        console.log(
          `[SignalGen] ⏭️  User ${deployment.user_wallet} has no trade quota (remaining: ${quotaResult.remaining
          }) - skipping`
        );

        // Send quota exceeded notification (deduplicated by time window)
        await queueNotification({
          userWallet: deployment.user_wallet.toLowerCase(),
          notificationType: "QUOTA_EXCEEDED",
          context: {
            token: token,
            agentName: agent.name || "Unknown Agent",
          },
        });

        return { success: true, message: "No trade quota available" };
      }

      quotaReserved = true;
      console.log(
        `[SignalGen] 💳 Quota reserved for ${deployment.user_wallet} (remaining: ${quotaResult.remaining})`
      );
    } finally {
      // Always release the quota lock
      await releaseLock(quotaLockKey);
    }

    // Skip stablecoins
    if (EXCLUDED_TOKENS.includes(token.toUpperCase())) {
      console.log(`[SignalGen] ⏭️  Skipping stablecoin ${token}`);
      return { success: true, message: `Skipped stablecoin ${token}` };
    }

    // Check venue availability
    const venueResult = await checkVenueAvailability(agent, token);
    if (!venueResult.available) {
      const skipReason = venueResult.reason || `Token ${token} not available`;
      await createSkippedSignal(
        agent,
        deployment,
        post,
        token,
        venueResult.venue,
        skipReason,
        null,
        null
      );
      return { success: true, message: skipReason };
    }

    const signalVenue = venueResult.venue;

    // Determine side from post sentiment
    const side = post.signal_type === "SHORT" ? "SHORT" : "LONG";

    // Check for duplicate signal
    if (DUPLICATE_CHECK_ENABLED) {
      const duplicate = await checkDuplicateSignal(
        agent.id,
        deploymentId,
        token
      );
      if (duplicate) {
        console.log(`[SignalGen] ⏭️  Duplicate signal exists for ${token}`);
        return { success: true, message: `Duplicate signal for ${token}` };
      }
    }

    // Get trading preferences
    const userTradingPreferences = {
      risk_tolerance: deployment.risk_tolerance,
      trade_frequency: deployment.trade_frequency,
      social_sentiment_weight: deployment.social_sentiment_weight,
      price_momentum_focus: deployment.price_momentum_focus,
      market_rank_priority: deployment.market_rank_priority,
    };

    // Get user balance and positions
    const userBalance = await getUserBalance(deployment, signalVenue);
    const currentPositions = await getCurrentPositions(deployment, signalVenue);
    const { maxLeverage, makerMaxLeverage } = await getMaxLeverage(
      token,
      signalVenue
    );

    // Get LunarCrush data if available
    let lunarcrushData: any = null;
    if (canUseLunarCrush()) {
      try {
        const rawDataResult = await getLunarCrushRawData(token);
        if (rawDataResult.success && rawDataResult.data) {
          lunarcrushData = {
            data: rawDataResult.data,
            descriptions: rawDataResult.descriptions,
          };
        }
      } catch (error) {
        console.log(`[SignalGen] ⚠️  Failed to fetch LunarCrush data`);
      }
    }

    // Make LLM trade decision (this calls Perplexity API)
    console.log(`[SignalGen] 🤖 Making LLM trade decision for ${token}...`);
    const tradeDecision = await makeTradeDecision({
      message: post.message_text,
      confidenceScore: post.confidence_score || 0.5,
      lunarcrushData,
      userTradingPreferences,
      userBalance,
      venue: signalVenue,
      token,
      side,
      maxLeverage,
      makerMaxLeverage,
      currentPositions,
      isLazyTraderAgent,
      influencerImpactFactor,
    });

    console.log(
      `[SignalGen] 📊 LLM Decision: ${tradeDecision.shouldOpenNewPosition ? "OPEN" : "SKIP"
      } | ${token}`
    );

    // Create signal based on LLM decision
    if (!tradeDecision.shouldOpenNewPosition) {
      await createSkippedSignal(
        agent,
        deployment,
        post,
        token,
        signalVenue,
        tradeDecision.reason,
        tradeDecision
      );
      return { success: true, message: `Skipped: ${tradeDecision.reason}` };
    }

    // Create the actual signal
    await prisma.signals.create({
      data: {
        agent_id: agent.id,
        deployment_id: deploymentId,
        token_symbol: token,
        venue: signalVenue,
        side: side,
        size_model: {
          type: "balance-percentage",
          value: tradeDecision.fundAllocation,
          impactFactor: 0,
          sourceTradeId: (post as any).sourceTradeId || null,
        },
        risk_model: {
          stopLoss: (post as any).stop_loss || 0.05,
          takeProfit: (post as any).take_profit || 0.1,
          leverage: signalVenue === "OSTIUM" ? tradeDecision.leverage : 3,
        },
        source_tweets: [post.message_id],
        llm_decision: tradeDecision.reason,
        llm_should_trade: true,
        llm_fund_allocation: tradeDecision.fundAllocation,
        llm_leverage: tradeDecision.leverage,
        llm_close_trade_id:
          tradeDecision.closeExistingPositionIds?.length > 0
            ? JSON.stringify(tradeDecision.closeExistingPositionIds)
            : null,
        llm_net_position_change: tradeDecision.netPositionChange || "NONE",
        trade_executed: null,
      },
    });

    console.log(
      `[SignalGen] ✅ Signal created: ${side} ${token} on ${signalVenue} (${tradeDecision.fundAllocation.toFixed(
        2
      )}%)`
    );

    // Note: Quota was already reserved atomically at the start of this function
    // No need to deduct again - the reservation IS the deduction

    return {
      success: true,
      message: `Signal created: ${side} ${token}`,
      data: {
        token,
        side,
        venue: signalVenue,
        fundAllocation: tradeDecision.fundAllocation,
      },
    };
  } catch (error: any) {
    console.error(`[SignalGen] ❌ Error:`, error.message);
    throw error; // Re-throw to trigger BullMQ retry
  }
}

/**
 * Generate signal for a specific trader trade job (copy-trading)
 */
async function generateTraderTradeSignalForJob(
  jobData: GenerateTraderTradeSignalJobData
): Promise<JobResult> {
  const {
    tradeId,
    agentId,
    deploymentId,
    tokenSymbol,
    side,
    traderWallet,
    leverage,
    entryPrice,
    takeProfitPrice,
    stopLossPrice,
    takeProfitPercent,
    stopLossPercent,
    sourceTradeId,
    traderImpactFactor,
    agentName,
    agentDescription,
    tokenFilters,
  } = jobData;

  try {
    // Fetch agent and deployment
    const [agent, deployment] = await Promise.all([
      prisma.agents.findUnique({ where: { id: agentId } }),
      prisma.agent_deployments.findUnique({ where: { id: deploymentId } }),
    ]);

    if (!agent || !deployment) {
      console.log(
        `[SignalGen] ⚠️  Data not found: agent=${!!agent}, deployment=${!!deployment}`
      );
      return { success: false, error: "Agent or deployment not found" };
    }

    // ========================================================================
    // ATOMIC QUOTA RESERVATION WITH USER-LEVEL LOCK
    // This prevents race conditions when multiple deployments for the same user
    // try to reserve quota simultaneously
    // ========================================================================
    const quotaLockKey = getUserQuotaLockKey(deployment.user_wallet);
    let quotaReserved = false;

    // Wait for up to 10 seconds to acquire the quota lock
    const quotaLockAcquired = await waitForLock(quotaLockKey, 10000, 30000);

    if (!quotaLockAcquired) {
      console.log(
        `[SignalGen] ⚠️  Could not acquire quota lock for ${deployment.user_wallet.substring(
          0,
          10
        )}... - retrying later`
      );
      throw new Error("Could not acquire quota lock - will retry");
    }

    try {
      // Atomically check and reserve quota
      const quotaResult = await TradeQuotaService.reserveTradeQuota(
        deployment.user_wallet
      );

      if (!quotaResult.success) {
        console.log(
          `[SignalGen] ⏭️  User ${deployment.user_wallet.substring(
            0,
            10
          )}... has no trade quota (remaining: ${quotaResult.remaining
          }) - skipping`
        );

        // Send quota exceeded notification (deduplicated by time window)
        await queueNotification({
          userWallet: deployment.user_wallet.toLowerCase(),
          notificationType: "QUOTA_EXCEEDED",
          context: {
            token: tokenSymbol,
            agentName: agentName || "Unknown Agent",
          },
        });

        return { success: true, message: "No trade quota available" };
      }

      quotaReserved = true;
      console.log(
        `[SignalGen] 💳 Quota reserved for ${deployment.user_wallet.substring(
          0,
          10
        )}... (remaining: ${quotaResult.remaining})`
      );
    } finally {
      // Always release the quota lock
      await releaseLock(quotaLockKey);
    }

    // Skip stablecoins
    if (EXCLUDED_TOKENS.includes(tokenSymbol.toUpperCase())) {
      console.log(`[SignalGen] ⏭️  Skipping stablecoin ${tokenSymbol}`);
      return { success: true, message: `Skipped stablecoin ${tokenSymbol}` };
    }

    // Check venue availability
    const venueResult = await checkVenueAvailability(agent, tokenSymbol);
    if (!venueResult.available) {
      const skipReason =
        venueResult.reason || `Token ${tokenSymbol} not available`;

      // Create a normalized post object for skipped signal
      const normalizedPost = {
        signal_type: side,
        message_id: sourceTradeId,
        stop_loss: stopLossPercent,
        take_profit: takeProfitPercent,
        sourceTradeId: sourceTradeId,
      };

      await createSkippedSignal(
        agent,
        deployment,
        normalizedPost,
        tokenSymbol,
        venueResult.venue,
        skipReason,
        null,
        sourceTradeId
      );
      return { success: true, message: skipReason };
    }

    const signalVenue = venueResult.venue;

    // Check for duplicate signal
    if (DUPLICATE_CHECK_ENABLED) {
      const duplicate = await checkDuplicateSignal(
        agent.id,
        deploymentId,
        tokenSymbol
      );
      if (duplicate) {
        console.log(
          `[SignalGen] ⏭️  Duplicate signal exists for ${tokenSymbol}`
        );
        return {
          success: true,
          message: `Duplicate signal for ${tokenSymbol}`,
        };
      }
    }

    // Get trading preferences
    const userTradingPreferences = {
      risk_tolerance: deployment.risk_tolerance,
      trade_frequency: deployment.trade_frequency,
      social_sentiment_weight: deployment.social_sentiment_weight,
      price_momentum_focus: deployment.price_momentum_focus,
      market_rank_priority: deployment.market_rank_priority,
    };

    // Get user balance and positions
    const userBalance = await getUserBalance(deployment, signalVenue);
    const currentPositions = await getCurrentPositions(deployment, signalVenue);
    const { maxLeverage, makerMaxLeverage } = await getMaxLeverage(
      tokenSymbol,
      signalVenue
    );

    // Get LunarCrush data if available
    let lunarcrushData: any = null;
    if (canUseLunarCrush()) {
      try {
        const rawDataResult = await getLunarCrushRawData(tokenSymbol);
        if (rawDataResult.success && rawDataResult.data) {
          lunarcrushData = {
            data: rawDataResult.data,
            descriptions: rawDataResult.descriptions,
          };
        }
      } catch (error) {
        console.log(`[SignalGen] ⚠️  Failed to fetch LunarCrush data`);
      }
    }

    // Make LLM trade decision
    console.log(
      `[SignalGen] 🤖 Making LLM trade decision for ${tokenSymbol} (copy-trade: ${agentName})...`
    );
    const tradeDecision = await makeTradeDecision({
      message: `Copy trade from top trader: ${side} ${tokenSymbol} with ${leverage}x leverage`,
      confidenceScore: 0.7,
      lunarcrushData,
      userTradingPreferences,
      userBalance,
      venue: signalVenue,
      token: tokenSymbol,
      side: side as "LONG" | "SHORT",
      maxLeverage,
      makerMaxLeverage,
      currentPositions,
      isLazyTraderAgent: false,
      influencerImpactFactor: traderImpactFactor,
      copyTradeClubContext: {
        clubName: agentName,
        clubDescription: agentDescription || null,
        tokenFilters: tokenFilters || [],
      },
    });

    console.log(
      `[SignalGen] 📊 LLM Decision: ${tradeDecision.shouldOpenNewPosition ? "OPEN" : "SKIP"
      } | ${tokenSymbol}`
    );

    // Create signal based on LLM decision
    if (!tradeDecision.shouldOpenNewPosition) {
      const normalizedPost = {
        signal_type: side,
        message_id: sourceTradeId,
        stop_loss: stopLossPercent,
        take_profit: takeProfitPercent,
        sourceTradeId: sourceTradeId,
      };
      await createSkippedSignal(
        agent,
        deployment,
        normalizedPost,
        tokenSymbol,
        signalVenue,
        tradeDecision.reason,
        tradeDecision,
        sourceTradeId
      );
      return { success: true, message: `Skipped: ${tradeDecision.reason}` };
    }

    // Create the actual signal
    await prisma.signals.create({
      data: {
        agent_id: agent.id,
        deployment_id: deploymentId,
        token_symbol: tokenSymbol,
        venue: signalVenue,
        side: side,
        size_model: {
          type: "balance-percentage",
          value: tradeDecision.fundAllocation,
          impactFactor: 0,
          sourceTradeId: sourceTradeId,
        },
        risk_model: {
          stopLoss: stopLossPercent,
          takeProfit: takeProfitPercent,
          leverage: signalVenue === "OSTIUM" ? tradeDecision.leverage : 3,
        },
        source_tweets: [sourceTradeId],
        llm_decision: tradeDecision.reason,
        llm_should_trade: true,
        llm_fund_allocation: tradeDecision.fundAllocation,
        llm_leverage: tradeDecision.leverage,
        llm_close_trade_id:
          tradeDecision.closeExistingPositionIds?.length > 0
            ? JSON.stringify(tradeDecision.closeExistingPositionIds)
            : null,
        llm_net_position_change: tradeDecision.netPositionChange || "NONE",
        trade_executed: null,
      },
    });

    // Note: Quota was already reserved atomically at the start of this function
    // No need to deduct again - the reservation IS the deduction

    console.log(
      `[SignalGen] ✅ Signal created (copy-trade): ${side} ${tokenSymbol} on ${signalVenue} (${tradeDecision.fundAllocation.toFixed(
        2
      )}%)`
    );

    return {
      success: true,
      message: `Signal created: ${side} ${tokenSymbol}`,
      data: {
        token: tokenSymbol,
        side,
        venue: signalVenue,
        fundAllocation: tradeDecision.fundAllocation,
      },
    };
  } catch (error: any) {
    console.error(`[SignalGen] ❌ Error (copy-trade):`, error.message);
    throw error;
  }
}

/**
 * Check if token is available on venue
 */
async function checkVenueAvailability(
  agent: any,
  token: string
): Promise<{
  available: boolean;
  venue: venue_t;
  reason?: string;
}> {
  if (agent.venue === "MULTI") {
    // ✅ OPTIMIZED: Only check existence, no need to fetch all columns
    const ostiumMarket = await prisma.venue_markets.findFirst({
      where: {
        token_symbol: token.toUpperCase(),
        venue: "OSTIUM",
        is_active: true,
      },
      select: { id: true },
    });

    if (ostiumMarket) {
      return { available: true, venue: "OSTIUM" };
    }

    return {
      available: false,
      venue: "OSTIUM",
      reason: `Token ${token} not available on OSTIUM`,
    };
  } else {
    // ✅ OPTIMIZED: Only check existence, no need to fetch all columns
    const venueMarket = await prisma.venue_markets.findFirst({
      where: {
        token_symbol: token.toUpperCase(),
        venue: agent.venue,
        is_active: true,
      },
      select: { id: true },
    });

    if (venueMarket) {
      return { available: true, venue: agent.venue };
    }

    return {
      available: false,
      venue: agent.venue,
      reason: `Token ${token} not available on ${agent.venue}`,
    };
  }
}

/**
 * Check for duplicate signal within time window
 */
async function checkDuplicateSignal(
  agentId: string,
  deploymentId: string,
  token: string
): Promise<boolean> {
  const checkWindowMs = DUPLICATE_CHECK_HOURS * 60 * 60 * 1000;
  const checkWindowStart = new Date(Date.now() - checkWindowMs);

  // ✅ OPTIMIZED: Only check existence, no need to fetch all columns
  const existingSignal = await prisma.signals.findFirst({
    where: {
      agent_id: agentId,
      deployment_id: deploymentId,
      token_symbol: token.toUpperCase(),
      created_at: { gte: checkWindowStart },
    },
    select: { id: true },
  });

  return !!existingSignal;
}

/**
 * Get user balance from venue
 */
async function getUserBalance(
  deployment: any,
  venue: venue_t
): Promise<number> {
  try {
    if (venue === "OSTIUM") {
      const balanceResponse = await fetch(
        `${process.env.OSTIUM_SERVICE_URL || "http://localhost:5002"}/balance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: deployment.safe_wallet || deployment.user_wallet,
            isTestnet: deployment.is_testnet || false,
          }),
        }
      );

      if (balanceResponse.ok) {
        const data = (await balanceResponse.json()) as any;
        if (data.success) return parseFloat(data.usdcBalance || "0");
      }
    }
  } catch (error) {
    console.log(`[SignalGen] ⚠️  Failed to fetch balance`);
  }

  return 0;
}

/**
 * Get current positions from venue
 */
async function getCurrentPositions(
  deployment: any,
  venue: venue_t
): Promise<any[]> {
  try {
    if (venue === "OSTIUM") {
      const positionsResponse = await fetch(
        `${process.env.OSTIUM_SERVICE_URL || "http://localhost:5002"
        }/positions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: deployment.safe_wallet || deployment.user_wallet,
            isTestnet: deployment.is_testnet || false,
          }),
        }
      );

      if (positionsResponse.ok) {
        const data = (await positionsResponse.json()) as any;
        if (data.success && Array.isArray(data.positions)) {
          return data.positions.map((pos: any) => ({
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
    }
  } catch (error) {
    console.log(`[SignalGen] ⚠️  Failed to fetch positions`);
  }

  return [];
}

/**
 * Get max leverage for token on venue
 */
async function getMaxLeverage(
  token: string,
  venue: venue_t
): Promise<{
  maxLeverage?: number;
  makerMaxLeverage?: number;
}> {
  if (venue !== "OSTIUM") return {};

  const tokenSymbol = token.toUpperCase();
  // ✅ OPTIMIZED: Only select fields actually used
  const ostiumPair = await prisma.ostium_available_pairs.findFirst({
    where: {
      OR: [
        { symbol: `${tokenSymbol}/USD` },
        { symbol: `USD/${tokenSymbol}` },
        { symbol: { startsWith: `${tokenSymbol}/` } },
        { symbol: { endsWith: `/${tokenSymbol}` } },
      ],
    },
    select: {
      max_leverage: true,
      maker_max_leverage: true,
    },
  });

  if (!ostiumPair) return {};

  return {
    maxLeverage: ostiumPair.max_leverage
      ? Number(ostiumPair.max_leverage)
      : undefined,
    makerMaxLeverage: ostiumPair.maker_max_leverage
      ? Number(ostiumPair.maker_max_leverage)
      : undefined,
  };
}

/**
 * Create a skipped signal record and queue notification
 * Returns the created signal ID for deduplication purposes
 */
async function createSkippedSignal(
  agent: any,
  deployment: any,
  post: any,
  token: string,
  venue: venue_t,
  reason: string,
  tradeDecision?: any,
  sourceTradeId?: string | null
): Promise<string> {
  const side = post.signal_type === "SHORT" ? "SHORT" : "LONG";

  // Create signal and capture the ID for notification deduplication
  const createdSignal = await prisma.signals.create({
    data: {
      agent_id: agent.id,
      deployment_id: deployment.id,
      token_symbol: token,
      venue: venue,
      side: side,
      size_model: {
        type: "balance-percentage",
        value: 0,
        impactFactor: 0,
        sourceTradeId: sourceTradeId || post.sourceTradeId || null,
      },
      risk_model: {
        stopLoss: post.stop_loss || 0.05,
        takeProfit: post.take_profit || 0.1,
        leverage: 1,
      },
      source_tweets: [post.message_id],
      skipped_reason: reason,
      llm_decision: reason,
      llm_should_trade: false,
      llm_fund_allocation: tradeDecision?.fundAllocation || 0,
      llm_leverage: tradeDecision?.leverage || 0,
      trade_executed: null,
    },
  });

  // Note: Quota was already reserved atomically at the start of the signal generation function
  // No need to deduct again - the reservation IS the deduction

  console.log(
    `[SignalGen] ⏭️  Skipped signal ${createdSignal.id.substring(
      0,
      8
    )}... for ${token}: ${reason.substring(0, 50)}...`
  );

  // Queue immediate notification for skipped signal with signalId for proper deduplication
  // This prevents the fallback trigger from sending duplicate notifications
  await queueNotification({
    userWallet: deployment.user_wallet.toLowerCase(),
    signalId: createdSignal.id, // Include signal ID for deduplication with fallback trigger
    notificationType: "SIGNAL_NOT_TRADED",
    context: {
      token: token,
      side: side,
      venue: venue,
      agentName: agent.name || "Unknown Agent",
      reason: reason,
    },
  });

  return createdSignal.id;
}

/**
 * Check for pending posts and add jobs to queue (fallback trigger)
 */
async function checkAndQueuePendingPosts(): Promise<void> {
  try {
    // Get pending posts
    // ✅ OPTIMIZED: Only select fields actually used
    const pendingPosts = await prisma.telegram_posts.findMany({
      where: {
        is_signal_candidate: true,
        processed_for_signals: false,
      },
      select: {
        id: true,
        alpha_user_id: true,
        extracted_tokens: true,
        message_id: true,
      },
      orderBy: { message_created_at: "asc" },
      take: 100,
    });

    if (pendingPosts.length === 0) {
      console.log("[Trigger] No pending telegram posts to process");
    } else {
      console.log(`[Trigger] Found ${pendingPosts.length} pending posts`);

      let jobsQueued = 0;

      for (const post of pendingPosts) {
        try {
          // Get agents and deployments for this post
          const { agents, influencerImpactFactor } = await getAgentsForPost(
            post
          );

          if (agents.length === 0) {
            // Mark as processed if no agents
            await prisma.telegram_posts.update({
              where: { id: post.id },
              data: { processed_for_signals: true },
            });
            continue;
          }

          const extractedTokens = post.extracted_tokens || [];
          if (extractedTokens.length === 0) continue;

          // Queue jobs for each agent/deployment/token combination
          for (const agent of agents) {
            const isLazyTraderAgent =
              agent.status === "PRIVATE" &&
              agent.name?.toLowerCase().includes("lazy") &&
              agent.name?.toLowerCase().includes("trader");

            for (const deployment of agent.agent_deployments || []) {
              for (const token of extractedTokens) {
                await addJob(
                  QueueName.SIGNAL_GENERATION,
                  "generate-telegram-signal",
                  {
                    type: "GENERATE_TELEGRAM_SIGNAL" as const,
                    postId: post.id,
                    agentId: agent.id,
                    deploymentId: deployment.id,
                    token: token,
                    isLazyTraderAgent,
                    influencerImpactFactor,
                    timestamp: Date.now(),
                  },
                  {
                    jobId: `signal-${post.id}-${deployment.id}-${token}`,
                  }
                );
                jobsQueued++;
              }
            }
          }

          // Mark post as processed
          await prisma.telegram_posts.update({
            where: { id: post.id },
            data: { processed_for_signals: true },
          });
        } catch (error: any) {
          console.error(
            `[Trigger] Error processing post ${post.id}:`,
            error.message
          );
        }
      }

      if (jobsQueued > 0) {
        console.log(
          `[Trigger] Queued ${jobsQueued} telegram signal generation jobs`
        );
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
        trade_timestamp: "asc",
      },
    });

    console.log(
      `[Trigger] Found ${pendingTraderTrades.length} trader trades to process`
    );

    let traderJobsQueued = 0;

    for (const traderTrade of pendingTraderTrades) {
      try {
        console.log(
          `[Trigger] Processing trader trade ${traderTrade.id.substring(
            0,
            8
          )}...`
        );

        // Get the agent and its deployments
        // ✅ OPTIMIZED: Only select fields actually used
        const agent = await prisma.agents.findUnique({
          where: { id: traderTrade.agent_id },
          select: {
            id: true,
            name: true,
            status: true,
            description: true,
            token_filters: true,
            venue: true,
            agent_deployments: {
              where: { status: "ACTIVE" },
              select: {
                id: true,
              },
            },
          },
        });

        if (!agent) {
          console.log(`[Trigger] Agent not found, marking as processed`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        if (agent.status !== "PUBLIC" && agent.status !== "PRIVATE") {
          console.log(`[Trigger] Agent is DRAFT, skipping`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        const deployments = agent.agent_deployments;
        if (deployments.length === 0) {
          console.log(`[Trigger] No active deployments (club members)`);
          await prisma.trader_trades.update({
            where: { id: traderTrade.id },
            data: { processed_for_signals: true },
          });
          continue;
        }

        console.log(
          `[Trigger] Found ${deployments.length} club member(s) to receive signals`
        );

        // Get the top trader's impact factor
        const topTrader = await prisma.top_traders.findFirst({
          where: { wallet_address: traderTrade.trader_wallet.toLowerCase() },
          select: { impact_factor: true },
        });
        const traderImpactFactor = topTrader?.impact_factor ?? 50;

        // Calculate TP/SL percentages from trader values
        const entryPrice = Number(traderTrade.entry_price.toString());
        const takeProfitPrice = traderTrade.take_profit_price
          ? Number(traderTrade.take_profit_price.toString())
          : null;
        const stopLossPrice = traderTrade.stop_loss_price
          ? Number(traderTrade.stop_loss_price.toString())
          : null;

        let takeProfitPercent = 0.1;
        let stopLossPercent = 0.05;

        if (entryPrice > 0) {
          if (takeProfitPrice && takeProfitPrice > 0) {
            if (traderTrade.side === "LONG") {
              takeProfitPercent = Math.abs(
                (takeProfitPrice - entryPrice) / entryPrice
              );
            } else {
              takeProfitPercent = Math.abs(
                (entryPrice - takeProfitPrice) / entryPrice
              );
            }
          }

          if (stopLossPrice && stopLossPrice > 0) {
            if (traderTrade.side === "LONG") {
              stopLossPercent = Math.abs(
                (entryPrice - stopLossPrice) / entryPrice
              );
            } else {
              stopLossPercent = Math.abs(
                (stopLossPrice - entryPrice) / entryPrice
              );
            }
          }
        }

        console.log(
          `[Trigger] TP: ${(takeProfitPercent * 100).toFixed(2)}% | SL: ${(
            stopLossPercent * 100
          ).toFixed(2)}%`
        );

        // Queue jobs for each deployment
        for (const deployment of deployments) {
          await addJob(
            QueueName.SIGNAL_GENERATION,
            "generate-trader-trade-signal",
            {
              type: "GENERATE_TRADER_TRADE_SIGNAL" as const,
              tradeId: traderTrade.id,
              agentId: agent.id,
              deploymentId: deployment.id,
              tokenSymbol: traderTrade.token_symbol,
              side: traderTrade.side,
              traderWallet: traderTrade.trader_wallet,
              leverage: Number(traderTrade.leverage),
              entryPrice: entryPrice,
              takeProfitPrice: takeProfitPrice,
              stopLossPrice: stopLossPrice,
              takeProfitPercent: takeProfitPercent,
              stopLossPercent: stopLossPercent,
              sourceTradeId: traderTrade.source_trade_id,
              traderImpactFactor: traderImpactFactor,
              agentName: agent.name,
              agentDescription: agent.description,
              tokenFilters: agent.token_filters || [],
              timestamp: Date.now(),
            },
            {
              jobId: `trader-signal-${traderTrade.id}-${deployment.id}`,
            }
          );
          traderJobsQueued++;
        }

        // Mark trade as processed
        await prisma.trader_trades.update({
          where: { id: traderTrade.id },
          data: { processed_for_signals: true },
        });
      } catch (error: any) {
        console.error(
          `[Trigger] Error processing trader trade ${traderTrade.id}:`,
          error.message
        );
      }
    }

    if (traderJobsQueued > 0) {
      console.log(
        `[Trigger] Queued ${traderJobsQueued} trader trade signal jobs`
      );
    }
  } catch (error: any) {
    console.error("[Trigger] Error checking pending posts:", error.message);
  }
}

/**
 * Get agents and their deployments for a post
 */
async function getAgentsForPost(post: any): Promise<{
  agents: any[];
  influencerImpactFactor: number;
}> {
  let agents: any[] = [];
  let influencerImpactFactor = 50;

  if (post.alpha_user_id) {
    // ✅ OPTIMIZED: Only select fields actually used
    const alphaUser = await prisma.telegram_alpha_users.findUnique({
      where: { id: post.alpha_user_id },
      select: {
        lazy_trader: true,
        public_source: true,
        impact_factor: true,
      },
    });

    if (!alphaUser) return { agents: [], influencerImpactFactor };

    const isLazyTrader = (alphaUser as any)?.lazy_trader === true;
    const isPublicSource = (alphaUser as any)?.public_source === true;
    influencerImpactFactor = (alphaUser as any)?.impact_factor ?? 50;

    if (!isLazyTrader && !isPublicSource) {
      return { agents: [], influencerImpactFactor };
    }

    // ✅ OPTIMIZED: Only select fields actually used
    const agentLinks = await prisma.agent_telegram_users.findMany({
      where: { telegram_alpha_user_id: post.alpha_user_id },
      select: {
        agents: {
          select: {
            id: true,
            name: true,
            status: true,
            agent_deployments: {
              where: { status: "ACTIVE" },
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    agents = agentLinks
      .map((link) => link.agents)
      .filter((agent) => {
        if (!agent.agent_deployments || agent.agent_deployments.length === 0)
          return false;

        if (agent.status === "PUBLIC") return isPublicSource;
        if (agent.status === "PRIVATE") return isLazyTrader || isPublicSource;
        return false;
      });
  }

  return { agents, influencerImpactFactor };
}

/**
 * Main worker startup
 */
async function runWorker() {
  try {
    console.log("🚀 Signal Generator Worker (Event-Driven) starting...");
    console.log(`👷 Worker count: ${WORKER_COUNT}`);
    console.log(`🔄 Concurrency per worker: ${WORKER_CONCURRENCY}`);
    console.log(`⏱️  Trigger interval: ${TRIGGER_INTERVAL}ms`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error("Database connection failed.");
    }
    console.log("✅ Database connection: OK");

    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      throw new Error("Redis connection failed.");
    }
    console.log("✅ Redis connection: OK");

    setupBullBoard();

    // Create worker pool
    createWorkerPool<SignalGenerationJobData>(
      QueueName.SIGNAL_GENERATION,
      processSignalGenerationJob,
      WORKER_COUNT,
      {
        concurrency: WORKER_CONCURRENCY,
        lockDuration: 180000, // 3 minutes for LLM calls
      }
    );

    // Start interval trigger
    startIntervalTrigger(TRIGGER_INTERVAL, checkAndQueuePendingPosts, {
      runImmediately: true,
      name: "signal-generator-trigger",
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Signal Generator Worker started successfully");
    console.log(
      `📊 Effective parallel capacity: ${WORKER_COUNT * WORKER_CONCURRENCY
      } concurrent LLM calls`
    );
  } catch (error: any) {
    console.error(
      "[SignalGenerator] ❌ Failed to start worker:",
      error.message
    );
    throw error;
  }
}

// Cleanup handlers
registerCleanup(async () => {
  console.log("🛑 Stopping Signal Generator Worker...");
  await shutdownQueueService();
  await disconnectPrisma();
  console.log("✅ Cleanup complete");
});

setupGracefulShutdown("Signal Generator Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[SignalGenerator] ❌ Worker failed to start:", error);
    setTimeout(() => process.exit(1), 5000);
  });
}

export { processSignalGenerationJob, checkAndQueuePendingPosts };
