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
import { prisma, checkDatabaseHealth, disconnectPrisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup, createHealthCheckHandler } from "@maxxit/common";
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
  getSignalGenerationLockKey,
  QueueName,
  GenerateTelegramSignalJobData,
  SignalGenerationJobData,
  JobResult,
  Job,
} from "@maxxit/queue";
import { makeTradeDecision } from "./lib/llm-trade-decision";
import { getLunarCrushRawData, canUseLunarCrush } from "./lib/lunarcrush-wrapper";

// Bull Board imports
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

dotenv.config();

const PORT = process.env.PORT || 5008;
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || "3");
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "3");
const TRIGGER_INTERVAL = parseInt(process.env.TRIGGER_INTERVAL || "30000"); // 30 seconds

// Duplicate signal check configuration
const DUPLICATE_CHECK_ENABLED = process.env.DUPLICATE_SIGNAL_CHECK_ENABLED !== "false";
const DUPLICATE_CHECK_HOURS = parseInt(process.env.DUPLICATE_SIGNAL_CHECK_HOURS || "6");

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("signal-generator-worker", async () => {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      isRedisHealthy(),
    ]);

    let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
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
  console.log(`📊 Bull Board available at http://localhost:${PORT}/admin/queues`);
}

// Stablecoins should NOT be traded (they are base currency)
const EXCLUDED_TOKENS = ["USDC", "USDT", "DAI", "USDC.E", "BUSD", "FRAX"];

/**
 * Process a single signal generation job
 */
async function processSignalGenerationJob(
  job: Job<SignalGenerationJobData>
): Promise<JobResult> {
  const { data } = job;

  if (data.type !== "GENERATE_TELEGRAM_SIGNAL") {
    return {
      success: false,
      error: `Unknown job type: ${(data as any).type}`,
    };
  }

  const jobData = data as GenerateTelegramSignalJobData;
  const { postId, agentId, deploymentId, token, isLazyTraderAgent, influencerImpactFactor } = jobData;

  const lockKey = getSignalGenerationLockKey(postId, deploymentId, token);

  // Use distributed lock to prevent duplicate signal generation
  const result = await withLock(lockKey, async () => {
    return await generateSignalForJob(jobData);
  });

  if (result === undefined) {
    return {
      success: true,
      message: "Job skipped - another worker is processing this signal",
    };
  }

  return result;
}

/**
 * Generate signal for a specific job
 */
async function generateSignalForJob(
  jobData: GenerateTelegramSignalJobData
): Promise<JobResult> {
  const { postId, agentId, deploymentId, token, isLazyTraderAgent, influencerImpactFactor } = jobData;

  try {
    // Fetch post, agent, and deployment
    const [post, agent, deployment] = await Promise.all([
      prisma.telegram_posts.findUnique({ where: { id: postId } }),
      prisma.agents.findUnique({ where: { id: agentId } }),
      prisma.agent_deployments.findUnique({ where: { id: deploymentId } }),
    ]);

    if (!post || !agent || !deployment) {
      console.log(`[SignalGen] ⚠️  Data not found: post=${!!post}, agent=${!!agent}, deployment=${!!deployment}`);
      return { success: false, error: "Post, agent, or deployment not found" };
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
      await createSkippedSignal(agent, deployment, post, token, venueResult.venue, skipReason);
      return { success: true, message: skipReason };
    }

    const signalVenue = venueResult.venue;

    // Determine side from post sentiment
    const side = post.signal_type === "SHORT" ? "SHORT" : "LONG";

    // Check for duplicate signal
    if (DUPLICATE_CHECK_ENABLED) {
      const duplicate = await checkDuplicateSignal(agent.id, deploymentId, token);
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
    const { maxLeverage, makerMaxLeverage } = await getMaxLeverage(token, signalVenue);

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

    console.log(`[SignalGen] 📊 LLM Decision: ${tradeDecision.shouldOpenNewPosition ? "OPEN" : "SKIP"} | ${token}`);

    // Create signal based on LLM decision
    if (!tradeDecision.shouldOpenNewPosition) {
      await createSkippedSignal(agent, deployment, post, token, signalVenue, tradeDecision.reason, tradeDecision);
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
        },
        risk_model: {
          stopLoss: 0.1,
          takeProfit: 0.05,
          leverage: signalVenue === "OSTIUM" ? tradeDecision.leverage : 3,
        },
        source_tweets: [post.message_id],
        llm_decision: tradeDecision.reason,
        llm_should_trade: true,
        llm_fund_allocation: tradeDecision.fundAllocation,
        llm_leverage: tradeDecision.leverage,
        llm_close_trade_id: tradeDecision.closeExistingPositionIds?.length > 0
          ? JSON.stringify(tradeDecision.closeExistingPositionIds)
          : null,
        llm_net_position_change: tradeDecision.netPositionChange || "NONE",
        trade_executed: null,
      },
    });

    console.log(`[SignalGen] ✅ Signal created: ${side} ${token} on ${signalVenue} (${tradeDecision.fundAllocation.toFixed(2)}%)`);

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
 * Check if token is available on venue
 */
async function checkVenueAvailability(agent: any, token: string): Promise<{
  available: boolean;
  venue: venue_t;
  reason?: string;
}> {
  if (agent.venue === "MULTI") {
    const ostiumMarket = await prisma.venue_markets.findFirst({
      where: { token_symbol: token.toUpperCase(), venue: "OSTIUM", is_active: true },
    });

    if (ostiumMarket) {
      return { available: true, venue: "OSTIUM" };
    }

    return { available: false, venue: "OSTIUM", reason: `Token ${token} not available on OSTIUM` };
  } else {
    const venueMarket = await prisma.venue_markets.findFirst({
      where: { token_symbol: token.toUpperCase(), venue: agent.venue, is_active: true },
    });

    if (venueMarket) {
      return { available: true, venue: agent.venue };
    }

    return { available: false, venue: agent.venue, reason: `Token ${token} not available on ${agent.venue}` };
  }
}

/**
 * Check for duplicate signal within time window
 */
async function checkDuplicateSignal(agentId: string, deploymentId: string, token: string): Promise<boolean> {
  const checkWindowMs = DUPLICATE_CHECK_HOURS * 60 * 60 * 1000;
  const checkWindowStart = new Date(Date.now() - checkWindowMs);

  const existingSignal = await prisma.signals.findFirst({
    where: {
      agent_id: agentId,
      deployment_id: deploymentId,
      token_symbol: token.toUpperCase(),
      created_at: { gte: checkWindowStart },
    },
  });

  return !!existingSignal;
}

/**
 * Get user balance from venue
 */
async function getUserBalance(deployment: any, venue: venue_t): Promise<number> {
  try {
    if (venue === "OSTIUM") {
      const balanceResponse = await fetch(
        `${process.env.OSTIUM_SERVICE_URL || "http://localhost:5002"}/balance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: deployment.safe_wallet || deployment.user_wallet }),
        }
      );

      if (balanceResponse.ok) {
        const data = await balanceResponse.json() as any;
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
async function getCurrentPositions(deployment: any, venue: venue_t): Promise<any[]> {
  try {
    if (venue === "OSTIUM") {
      const positionsResponse = await fetch(
        `${process.env.OSTIUM_SERVICE_URL || "http://localhost:5002"}/positions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: deployment.safe_wallet || deployment.user_wallet }),
        }
      );

      if (positionsResponse.ok) {
        const data = await positionsResponse.json() as any;
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
async function getMaxLeverage(token: string, venue: venue_t): Promise<{
  maxLeverage?: number;
  makerMaxLeverage?: number;
}> {
  if (venue !== "OSTIUM") return {};

  const tokenSymbol = token.toUpperCase();
  const ostiumPair = await prisma.ostium_available_pairs.findFirst({
    where: {
      OR: [
        { symbol: `${tokenSymbol}/USD` },
        { symbol: `USD/${tokenSymbol}` },
        { symbol: { startsWith: `${tokenSymbol}/` } },
        { symbol: { endsWith: `/${tokenSymbol}` } },
      ],
    },
  });

  if (!ostiumPair) return {};

  return {
    maxLeverage: ostiumPair.max_leverage ? Number(ostiumPair.max_leverage) : undefined,
    makerMaxLeverage: ostiumPair.maker_max_leverage ? Number(ostiumPair.maker_max_leverage) : undefined,
  };
}

/**
 * Create a skipped signal record
 */
async function createSkippedSignal(
  agent: any,
  deployment: any,
  post: any,
  token: string,
  venue: venue_t,
  reason: string,
  tradeDecision?: any
): Promise<void> {
  const side = post.signal_type === "SHORT" ? "SHORT" : "LONG";

  await prisma.signals.create({
    data: {
      agent_id: agent.id,
      deployment_id: deployment.id,
      token_symbol: token,
      venue: venue,
      side: side,
      size_model: { type: "balance-percentage", value: 0, impactFactor: 0 },
      risk_model: { stopLoss: 0.1, takeProfit: 0.05, leverage: 1 },
      source_tweets: [post.message_id],
      skipped_reason: reason,
      llm_decision: reason,
      llm_should_trade: false,
      llm_fund_allocation: tradeDecision?.fundAllocation || 0,
      llm_leverage: tradeDecision?.leverage || 0,
      trade_executed: null,
    },
  });

  console.log(`[SignalGen] ⏭️  Skipped signal for ${token}: ${reason}`);
}

/**
 * Check for pending posts and add jobs to queue (fallback trigger)
 */
async function checkAndQueuePendingPosts(): Promise<void> {
  try {
    // Get pending posts
    const pendingPosts = await prisma.telegram_posts.findMany({
      where: {
        is_signal_candidate: true,
        processed_for_signals: false,
      },
      orderBy: { message_created_at: "desc" },
      take: 20,
    });

    if (pendingPosts.length === 0) return;

    console.log(`[Trigger] Found ${pendingPosts.length} pending posts`);

    let jobsQueued = 0;

    for (const post of pendingPosts) {
      try {
        // Get agents and deployments for this post
        const { agents, influencerImpactFactor } = await getAgentsForPost(post);

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
        console.error(`[Trigger] Error processing post ${post.id}:`, error.message);
      }
    }

    if (jobsQueued > 0) {
      console.log(`[Trigger] Queued ${jobsQueued} signal generation jobs`);
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
    const alphaUser = await prisma.telegram_alpha_users.findUnique({
      where: { id: post.alpha_user_id },
    });

    if (!alphaUser) return { agents: [], influencerImpactFactor };

    const isLazyTrader = (alphaUser as any)?.lazy_trader === true;
    const isPublicSource = (alphaUser as any)?.public_source === true;
    influencerImpactFactor = (alphaUser as any)?.impact_factor ?? 50;

    if (!isLazyTrader && !isPublicSource) {
      return { agents: [], influencerImpactFactor };
    }

    const agentLinks = await prisma.agent_telegram_users.findMany({
      where: { telegram_alpha_user_id: post.alpha_user_id },
      include: {
        agents: {
          include: {
            agent_deployments: { where: { status: "ACTIVE" } },
          },
        },
      },
    });

    agents = agentLinks
      .map((link) => link.agents)
      .filter((agent) => {
        if (!agent.agent_deployments || agent.agent_deployments.length === 0) return false;

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
    console.log(`📊 Effective parallel capacity: ${WORKER_COUNT * WORKER_CONCURRENCY} concurrent LLM calls`);
  } catch (error: any) {
    console.error("[SignalGenerator] ❌ Failed to start worker:", error.message);
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
