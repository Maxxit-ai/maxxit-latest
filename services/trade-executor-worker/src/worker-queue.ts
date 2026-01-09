/**
 * Trade Execution Worker (Event-Driven with BullMQ)
 * 
 * Processes trade execution jobs from the queue instead of polling.
 * Supports parallel processing with multiple workers.
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";
import {
  createWorker,
  createWorkerPool,
  addJob,
  getQueueStats,
  startIntervalTrigger,
  shutdownQueueService,
  isRedisHealthy,
  withLock,
  getSignalDeploymentLockKey,
  QueueName,
  TradeExecutionJobData,
  ExecuteSignalJobData,
  JobResult,
  Job,
} from "@maxxit/queue";

dotenv.config();

const PORT = process.env.PORT || 5001;
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || "3");
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5");
const TRIGGER_INTERVAL = parseInt(process.env.TRIGGER_INTERVAL || "60000"); // 1 minute

// Health check server
const app = express();
app.get("/health", async (req, res) => {
  const [dbHealthy, redisHealthy] = await Promise.all([
    checkDatabaseHealth(),
    isRedisHealthy(),
  ]);

  let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  try {
    queueStats = await getQueueStats(QueueName.TRADE_EXECUTION);
  } catch {
    // Queue might not be initialized yet
  }

  const isHealthy = dbHealthy && redisHealthy;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    service: "trade-executor-worker",
    mode: "event-driven",
    workerCount: WORKER_COUNT,
    workerConcurrency: WORKER_CONCURRENCY,
    triggerInterval: TRIGGER_INTERVAL,
    database: dbHealthy ? "connected" : "disconnected",
    redis: redisHealthy ? "connected" : "disconnected",
    queue: queueStats,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Trade Executor Worker health check on port ${PORT}`);
});

/**
 * Process a single trade execution job
 */
async function processTradeExecutionJob(
  job: Job<TradeExecutionJobData>
): Promise<JobResult> {
  const { data } = job;

  if (data.type !== "EXECUTE_SIGNAL") {
    return {
      success: false,
      error: `Unknown job type: ${(data as any).type}`,
    };
  }

  const { signalId, deploymentId } = data as ExecuteSignalJobData;
  const lockKey = getSignalDeploymentLockKey(signalId, deploymentId);

  // Use distributed lock to prevent duplicate executions
  const result = await withLock(lockKey, async () => {
    return await executeSignal(signalId, deploymentId);
  });

  if (result === undefined) {
    // Lock could not be acquired, another worker is processing this
    return {
      success: true,
      message: "Job skipped - another worker is processing this signal",
    };
  }

  return result;
}

/**
 * Execute a single signal by calling external venue services
 */
async function executeSignal(signalId: string, deploymentId: string): Promise<JobResult> {
  try {
    // Check if position already exists for this deployment-signal pair
    const existingPosition = await prisma.positions.findFirst({
      where: {
        signal_id: signalId,
        deployment_id: deploymentId,
      },
    });

    if (existingPosition) {
      console.log(`[TradeExecutor] ⏭️  Position already exists for signal ${signalId.substring(0, 8)}`);
      return {
        success: true,
        message: "Position already exists",
      };
    }

    // Get signal and deployment
    const signal = await prisma.signals.findUnique({
      where: { id: signalId },
      include: {
        agents: true,
      },
    });

    const deployment = await prisma.agent_deployments.findUnique({
      where: { id: deploymentId },
    });

    if (!signal || !deployment) {
      console.log(`[TradeExecutor] ⚠️  Signal or deployment not found`);
      return {
        success: false,
        error: "Signal or deployment not found",
      };
    }

    console.log(`[TradeExecutor] 🔄 Executing signal ${signalId.substring(0, 8)}...`);
    console.log(`[TradeExecutor]    Agent: ${(signal as any).agents?.name}`);
    console.log(`[TradeExecutor]    Token: ${signal.token_symbol}`);
    console.log(`[TradeExecutor]    Side: ${signal.side}`);
    console.log(`[TradeExecutor]    Venue: ${signal.venue}`);
    console.log(`[TradeExecutor]    Fund Allocation: ${signal.llm_fund_allocation}%`);
    console.log(`[TradeExecutor]    Leverage: ${signal.llm_leverage}x`);

    // Execute trade via LLM-enabled executor
    const { executeTrade } = await import("./lib/trade-executor-llm");
    const result = await executeTrade(signal, deployment);

    if (result.success) {
      // Create position record with actual values from execution
      const riskModel =
        typeof signal.risk_model === "string"
          ? JSON.parse(signal.risk_model)
          : signal.risk_model;

      // Extract source_trader_trade_id from size_model for copy-trade positions
      const sizeModel =
        typeof signal.size_model === "string"
          ? JSON.parse(signal.size_model)
          : signal.size_model;
      const sourceTraderTradeId = sizeModel?.sourceTradeId || null;

      // Use actual values from execution result
      const entryPrice = result.entryPrice || 0;
      const collateral = result.collateral || 0;
      const rawTradeIndex =
        result.ostiumTradeIndex !== undefined &&
          result.ostiumTradeIndex !== null
          ? parseInt(String(result.ostiumTradeIndex), 10)
          : undefined;
      const ostiumTradeIndex =
        rawTradeIndex !== undefined && !isNaN(rawTradeIndex)
          ? rawTradeIndex
          : undefined;
      const ostiumTradeId = result.tradeId || result.orderId || null;

      try {
        // Use upsert to handle race conditions
        await prisma.positions.upsert({
          where: {
            deployment_id_signal_id: {
              deployment_id: deploymentId,
              signal_id: signalId,
            },
          },
          create: {
            deployment_id: deploymentId,
            signal_id: signalId,
            venue: signal.venue,
            token_symbol: signal.token_symbol,
            side: signal.side,
            qty: collateral,
            entry_price: entryPrice,
            stop_loss: riskModel.stop_loss_percent ? 0 : undefined,
            take_profit: riskModel.take_profit_percent ? 0 : undefined,
            entry_tx_hash: result.txHash,
            status: "OPEN",
            ostium_trade_index: ostiumTradeIndex,
            ostium_trade_id: ostiumTradeId ? String(ostiumTradeId) : null,
            source_trader_trade_id: sourceTraderTradeId,
          },
          update: {
            entry_tx_hash: result.txHash,
            entry_price: entryPrice,
            qty: collateral,
            ostium_trade_index: ostiumTradeIndex,
            ostium_trade_id: ostiumTradeId ? String(ostiumTradeId) : null,
            source_trader_trade_id: sourceTraderTradeId,
          },
        });

        console.log(`[TradeExecutor] ✅ Trade executed successfully`);
        console.log(`[TradeExecutor]    TX Hash: ${result.txHash || "N/A"}`);
        console.log(`[TradeExecutor]    Entry Price: $${entryPrice || "pending"}`);
        console.log(`[TradeExecutor]    Collateral: $${collateral || "N/A"}`);
        if (sourceTraderTradeId) {
          console.log(`[TradeExecutor]    📎 Source Trader Trade ID: ${sourceTraderTradeId} (copy-trade)`);
        }

        return {
          success: true,
          message: "Trade executed successfully",
          data: {
            txHash: result.txHash,
            entryPrice,
            collateral,
            ostiumTradeId,
          },
        };
      } catch (dbError: any) {
        if (dbError.code === "P2002") {
          console.log(`[TradeExecutor] ⚠️  Position already exists (race condition)`);
          return {
            success: true,
            message: "Position created by another worker",
          };
        }
        throw dbError;
      }
    } else {
      // Handle execution failure
      const errorMessage = result.error || result.reason || "Execution failed";
      const isRetryable = isRetryableError(errorMessage);

      if (isRetryable) {
        await handleRetryableError(signalId, errorMessage);
        // Throw to trigger BullMQ retry
        throw new Error(`Retryable: ${errorMessage}`);
      } else {
        await markSignalAsFailed(signalId, errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  } catch (error: any) {
    console.error(`[TradeExecutor] ❌ Error executing signal:`, error.message);

    const isRetryable = isRetryableError(error.message);

    if (isRetryable) {
      await handleRetryableError(signalId, error.message);
      throw error; // Re-throw to trigger BullMQ retry
    } else {
      await markSignalAsFailed(signalId, `Execution error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * Handle retryable error by updating signal status
 */
async function handleRetryableError(signalId: string, errorMessage: string): Promise<void> {
  try {
    const signal = await prisma.signals.findUnique({
      where: { id: signalId },
      select: { created_at: true, executor_agreement_error: true },
    });

    const signalAge = Date.now() - (signal?.created_at?.getTime() || 0);
    const MAX_RETRY_AGE = 24 * 60 * 60 * 1000; // 24 hours

    if (signalAge > MAX_RETRY_AGE) {
      await markSignalAsFailed(signalId, `Retry timeout (signal older than 24h): ${errorMessage}`);
    } else {
      const existingError = signal?.executor_agreement_error || "";
      const retryCount = (existingError.match(/RETRY #/g)?.length || 0) + 1;
      const retryError = existingError.includes("RETRYABLE")
        ? `${existingError} | RETRY #${retryCount}`
        : `RETRYABLE: ${errorMessage} | RETRY #${retryCount}`;

      await prisma.signals.update({
        where: { id: signalId },
        data: {
          executor_agreement_error: retryError,
          skipped_reason: null,
        },
      });

      console.log(`[TradeExecutor] ⚠️  Marked for retry (attempt ${retryCount}): ${errorMessage}`);
    }
  } catch (updateError) {
    console.error(`[TradeExecutor] ❌ Failed to update signal:`, updateError);
  }
}

/**
 * Mark a signal as permanently failed
 */
async function markSignalAsFailed(signalId: string, errorMessage: string): Promise<void> {
  try {
    await prisma.signals.update({
      where: { id: signalId },
      data: {
        skipped_reason: errorMessage,
        executor_agreement_error: null,
      },
    });
    console.log(`[TradeExecutor] ❌ Signal marked as failed: ${errorMessage}`);
  } catch (updateError) {
    console.error(`[TradeExecutor] ❌ Failed to update signal:`, updateError);
  }
}

/**
 * Check if an error is retryable (backend/service errors)
 */
function isRetryableError(errorMessage: string): boolean {
  if (!errorMessage) return false;

  const lowerError = errorMessage.toLowerCase();

  const retryablePatterns = [
    "service error",
    "500",
    "503",
    "502",
    "504",
    "timeout",
    "network",
    "connection",
    "econnrefused",
    "econnreset",
    "etimedout",
    "fetch failed",
    "request failed",
    "ostium service",
    "hyperliquid service",
    "backend error",
    "internal server error",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
    "retryable",
  ];

  return retryablePatterns.some((pattern) => lowerError.includes(pattern));
}

/**
 * Check for pending signals and add them to the queue
 */
async function checkAndQueuePendingSignals(): Promise<void> {
  try {
    console.log(`[Trigger] 🔍 Checking for pending signals...`);

    // Fetch pending signals that need execution
    const pendingSignals = await prisma.signals.findMany({
      where: {
        deployment_id: { not: null },
        OR: [
          { skipped_reason: null },
          {
            AND: [
              {
                executor_agreement_error: {
                  contains: "RETRYABLE",
                  mode: "insensitive",
                },
              },
              {
                created_at: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
              },
            ],
          },
        ],
        llm_should_trade: true,
        llm_fund_allocation: { gt: 0 },
        agents: {
          status: {
            in: ["PUBLIC", "PRIVATE"],
          },
        },
      },
      include: {
        positions: {
          select: {
            id: true,
            deployment_id: true,
          },
        },
        agent_deployments: true,
        agents: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      }
    });

    console.log(`[Trigger] 📊 Query returned ${pendingSignals.length} signals from DB`);

    if (pendingSignals.length === 0) {
      // Debug: Check why no signals are found
      const debugCount = await prisma.signals.count({
        where: {
          deployment_id: { not: null },
          llm_should_trade: true,
        },
      });
      console.log(`[Trigger] 📈 Total signals with deployment_id and llm_should_trade=true: ${debugCount}`);

      if (debugCount > 0) {
        // Check the first few signals to see why they're filtered
        const debugSignals = await prisma.signals.findMany({
          where: {
            deployment_id: { not: null },
            llm_should_trade: true,
          },
          include: {
            agents: { select: { status: true } },
            agent_deployments: { select: { status: true } },
          },
          take: 3,
          orderBy: { created_at: "desc" },
        });

        for (const sig of debugSignals) {
          console.log(`[Trigger] 🔎 Signal ${sig.id.substring(0, 8)}:`);
          console.log(`         - llm_fund_allocation: ${sig.llm_fund_allocation}`);
          console.log(`         - skipped_reason: ${sig.skipped_reason || "null"}`);
          console.log(`         - agent_status: ${(sig as any).agents?.status}`);
          console.log(`         - deployment_status: ${(sig as any).agent_deployments?.status}`);
        }
      }
      return;
    }

    // Filter signals that need processing
    let filteredOutDeployment = 0;
    let filteredOutPosition = 0;

    const signalsToProcess = pendingSignals.filter((signal) => {
      const designatedDeployment = (signal as any).agent_deployments;
      if (!designatedDeployment || designatedDeployment.status !== "ACTIVE") {
        filteredOutDeployment++;
        console.log(`[Trigger] ⏭️  Signal ${signal.id.substring(0, 8)} filtered: deployment status = ${designatedDeployment?.status || "not found"}`);
        return false;
      }

      const existingPosition = signal.positions.find(
        (p: any) => p.deployment_id === signal.deployment_id
      );
      if (existingPosition) {
        filteredOutPosition++;
        return false;
      }
      return true;
    });

    if (signalsToProcess.length === 0) {
      console.log(`[Trigger] ⚠️  All ${pendingSignals.length} signals filtered out:`);
      console.log(`         - Deployment not ACTIVE: ${filteredOutDeployment}`);
      console.log(`         - Position already exists: ${filteredOutPosition}`);
      return;
    }

    console.log(`[Trigger] ✅ Found ${signalsToProcess.length} pending signals to process`);

    // Add jobs to the queue
    for (const signal of signalsToProcess) {
      if (!signal.deployment_id) continue;

      await addJob(
        QueueName.TRADE_EXECUTION,
        "execute-signal",
        {
          type: "EXECUTE_SIGNAL" as const,
          signalId: signal.id,
          deploymentId: signal.deployment_id,
          timestamp: Date.now(),
        },
        {
          // Unique job ID prevents duplicates
          jobId: `execute-${signal.id}-${signal.deployment_id}`,
        }
      );
    }

    console.log(`[Trigger] 🚀 Queued ${signalsToProcess.length} signals for execution`);
  } catch (error: any) {
    console.error("[Trigger] ❌ Error checking pending signals:", error.message);
    console.error("[Trigger] Stack:", error.stack);
  }
}

/**
 * Main worker startup
 */
async function runWorker() {
  try {
    console.log("🚀 Trade Executor Worker (Event-Driven) starting...");
    console.log(`👷 Worker count: ${WORKER_COUNT}`);
    console.log(`🔄 Concurrency per worker: ${WORKER_CONCURRENCY}`);
    console.log(`⏱️  Trigger interval: ${TRIGGER_INTERVAL}ms`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Test database connection
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error("Database connection failed. Check DATABASE_URL environment variable.");
    }
    console.log("✅ Database connection: OK");

    // Test Redis connection
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      throw new Error("Redis connection failed. Check REDIS_URL environment variable.");
    }
    console.log("✅ Redis connection: OK");

    // Create worker pool for parallel processing
    createWorkerPool<TradeExecutionJobData>(
      QueueName.TRADE_EXECUTION,
      processTradeExecutionJob,
      WORKER_COUNT,
      {
        concurrency: WORKER_CONCURRENCY,
        lockDuration: 60000, // 60 second lock for trade executions
      }
    );

    // Start interval trigger to check for new signals
    startIntervalTrigger(TRIGGER_INTERVAL, checkAndQueuePendingSignals, {
      runImmediately: true,
      name: "trade-execution-trigger",
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Trade Executor Worker started successfully");
  } catch (error: any) {
    console.error("[TradeExecutor] ❌ Failed to start worker:", error.message);
    console.error("[TradeExecutor] Stack:", error.stack);
    throw error;
  }
}

// Register cleanup handlers
registerCleanup(async () => {
  console.log("🛑 Stopping Trade Executor Worker...");
  await shutdownQueueService();
});

// Setup graceful shutdown
setupGracefulShutdown("Trade Executor Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[TradeExecutor] ❌ Worker failed to start:", error);
    console.error("[TradeExecutor] Stack:", error.stack);
    setTimeout(() => {
      console.error("[TradeExecutor] Exiting after error...");
      process.exit(1);
    }, 5000);
  });
}

export { processTradeExecutionJob, executeSignal, checkAndQueuePendingSignals };
