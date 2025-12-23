/**
 * Trade Execution Worker (Microservice)
 * Runs automatically to execute pending signals
 * Interval: 30 seconds (configurable via WORKER_INTERVAL)
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const PORT = process.env.PORT || 5001;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "600000"); // 10 minutes default

let workerInterval: NodeJS.Timeout | null = null;
let isCycleRunning = false;

// Health check server
const app = express();
app.get("/health", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "ok" : "degraded",
    service: "trade-executor-worker",
    interval: INTERVAL,
    database: dbHealthy ? "connected" : "disconnected",
    isRunning: workerInterval !== null,
    isCycleRunning,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Trade Executor Worker health check on port ${PORT}`);
});

/**
 * Execute all pending signals
 * Finds signals without positions for their designated deployment and tries to execute them
 *
 * IMPORTANT: Each signal is created for a SPECIFIC deployment_id.
 * We must only execute a signal for its designated deployment, not for all deployments.
 */
async function executeAllPendingSignals() {
  if (isCycleRunning) {
    console.log("[TradeExecutor] ⏭️ Skipping cycle - previous cycle still running");
    return;
  }

  isCycleRunning = true;
  console.log("[TradeExecutor] ⏰ Running trade execution cycle...");

  try {
    // Fetch pending signals that:
    // 1. Have a deployment_id assigned (signals are created per-deployment)
    // 2. Don't have a position for that specific deployment yet
    // 3. Are not skipped
    // 4. Have llm_should_trade = true AND llm_fund_allocation > 0
    // 5. Belong to active agents with active deployments
    const pendingSignals = await prisma.signals.findMany({
      where: {
        deployment_id: { not: null }, // Must have a designated deployment
        // Include signals that are not executed, OR signals that failed due to retryable errors
        OR: [
          { trade_executed: null }, // Not executed yet
          {
            // Retryable errors: backend/service errors that should be retried
            // Only retry signals created in last 24 hours
            AND: [
              {
                executor_agreement_error: {
                  contains: "RETRYABLE",
                  mode: "insensitive",
                },
              },
              {
                created_at: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                },
              },
            ],
          },
        ],
        // Only execute signals where LLM decided to trade AND has allocation > 0
        llm_should_trade: true,
        llm_fund_allocation: { gt: 0 },
        agents: {
          status: {
            in: ["PUBLIC", "PRIVATE"]
          },
        },
      },
      include: {
        agents: true,
        // Include positions to check if one already exists for this signal's deployment
        positions: {
          select: {
            id: true,
            deployment_id: true,
          },
        },
        // Include the designated deployment to verify it's active
        agent_deployments: true,
      },
      orderBy: {
        created_at: "asc",
      },
      take: 20, // Process 20 signals per run
    });

    // Filter out signals that already have a position for their designated deployment
    // or whose designated deployment is not active
    const signalsToProcess = pendingSignals.filter((signal) => {
      // Check if the signal's designated deployment is active
      const designatedDeployment = (signal as any).agent_deployments;
      if (!designatedDeployment || designatedDeployment.status !== "ACTIVE") {
        return false;
      }

      // Check if a position already exists for this signal's designated deployment
      const existingPosition = signal.positions.find(
        (p: any) => p.deployment_id === signal.deployment_id
      );
      return !existingPosition;
    });

    console.log(
      `[TradeExecutor] 📊 Found ${pendingSignals.length} signals, ${signalsToProcess.length} need execution`
    );

    if (signalsToProcess.length === 0) {
      console.log("[TradeExecutor] ✅ No pending signals to process");
      return;
    }

    // Process each signal - execute ONLY for its designated deployment
    for (const signal of signalsToProcess) {
      try {
        const designatedDeploymentId = signal.deployment_id;

        if (!designatedDeploymentId) {
          console.log(
            `[TradeExecutor] ⚠️  Signal ${signal.id}: No deployment_id assigned, skipping`
          );
          continue;
        }

        console.log(
          `[TradeExecutor] 🔄 Processing signal ${signal.id.substring(0, 8)}...`
        );
        console.log(
          `[TradeExecutor]    Agent: ${(signal as any).agents?.name}`
        );
        console.log(`[TradeExecutor]    Token: ${signal.token_symbol}`);
        console.log(`[TradeExecutor]    Side: ${signal.side}`);
        console.log(`[TradeExecutor]    Venue: ${signal.venue}`);
        console.log(
          `[TradeExecutor]    Fund Allocation: ${signal.llm_fund_allocation}%`
        );
        console.log(`[TradeExecutor]    Leverage: ${signal.llm_leverage}x`);
        console.log(
          `[TradeExecutor]    Designated Deployment: ${designatedDeploymentId.substring(
            0,
            8
          )}`
        );

        // Execute the signal ONLY for its designated deployment
        try {
          await executeSignal(signal.id, designatedDeploymentId);
        } catch (error: any) {
          console.error(
            `[TradeExecutor] ❌ Error executing signal ${signal.id.substring(
              0,
              8
            )}: ${error.message}`
          );
        }
      } catch (error: any) {
        console.error(
          `[TradeExecutor] ❌ Error processing signal ${signal.id}:`,
          error.message
        );
      }
    }

    console.log("[TradeExecutor] ✅ Trade execution cycle complete");
  } catch (error: any) {
    console.error("[TradeExecutor] ❌ Fatal error in execution cycle:", error);
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Execute a single signal by calling external venue services
 */
async function executeSignal(signalId: string, deploymentId: string) {
  try {
    // Check if position already exists for this deployment-signal pair
    const existingPosition = await prisma.positions.findFirst({
      where: {
        signal_id: signalId,
        deployment_id: deploymentId,
      },
    });

    if (existingPosition) {
      console.log(
        `[TradeExecutor]       ⏭️  Position already exists for this deployment`
      );
      return;
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
      console.log(`[TradeExecutor]       ⚠️  Signal or deployment not found`);
      return;
    }

    // Execute trade via LLM-enabled executor
    const { executeTrade } = await import("./lib/trade-executor-llm");
    const result = await executeTrade(signal, deployment);

    if (result.success) {
      // Create position record with actual values from execution
      const sizeModel =
        typeof signal.size_model === "string"
          ? JSON.parse(signal.size_model)
          : signal.size_model;

      const riskModel =
        typeof signal.risk_model === "string"
          ? JSON.parse(signal.risk_model)
          : signal.risk_model;

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

      console.log(`[TradeExecutor]       DEBUG - Extracted values:`);
      console.log(`[TradeExecutor]       - result.tradeId: ${result.tradeId}`);
      console.log(`[TradeExecutor]       - result.orderId: ${result.orderId}`);
      console.log(`[TradeExecutor]       - ostiumTradeId: ${ostiumTradeId}`);

      try {
        // Use upsert to handle race conditions (unique constraint on deployment_id + signal_id)
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
            qty: collateral, // Collateral in USDC
            entry_price: entryPrice, // Actual entry price from execution
            stop_loss: riskModel.stop_loss_percent ? 0 : undefined,
            take_profit: riskModel.take_profit_percent ? 0 : undefined,
            entry_tx_hash: result.txHash,
            status: "OPEN",
            ostium_trade_index: ostiumTradeIndex, // Store Ostium trade index for closing
            ostium_trade_id: ostiumTradeId ? String(ostiumTradeId) : null,
          },
          update: {
            // If position already exists, update with new data (shouldn't happen normally)
            entry_tx_hash: result.txHash,
            entry_price: entryPrice,
            qty: collateral,
            ostium_trade_index: ostiumTradeIndex,
            ostium_trade_id: ostiumTradeId ? String(ostiumTradeId) : null,
          },
        });

        await prisma.signals.update({
          where: { id: signalId },
          data: {
            trade_executed: "SUCCESS",
            execution_result: "Trade executed successfully: " + result.txHash,
          },
        });

        console.log(`[TradeExecutor]       ✅ Trade executed successfully`);
        console.log(`[TradeExecutor]       TX Hash: ${result.txHash || "N/A"}`);
        console.log(
          `[TradeExecutor]       Entry Price: $${entryPrice || "pending"}`
        );
        console.log(
          `[TradeExecutor]       Collateral: $${collateral || "N/A"}`
        );
        console.log(
          `[TradeExecutor]       Ostium Trade ID: ${ostiumTradeId || "NOT SET"}`
        );
        console.log(
          `[TradeExecutor]       Ostium Trade Index: ${
            ostiumTradeIndex !== undefined ? ostiumTradeIndex : "NOT SET"
          }`
        );
      } catch (dbError: any) {
        // Handle any database errors gracefully
        if (dbError.code === "P2002") {
          // Unique constraint violation - position already exists
          console.log(
            `[TradeExecutor]       ⚠️  Position already exists for this deployment-signal pair`
          );
          console.log(
            `[TradeExecutor]       Trade was executed but position record already created`
          );
          await prisma.signals.update({
            where: { id: signalId },
            data: {
              trade_executed: "SUCCESS",
              execution_result: "Success",
            },
          });
        } else {
          throw dbError; // Re-throw other errors
        }
      }
    } else {
      // Check if error is retryable (backend/service errors)
      const errorMessage = result.error || result.reason || "Execution failed";
      const isRetryable = isRetryableError(errorMessage);

      if (isRetryable) {
        // Check signal age - only retry signals created within last 24 hours
        const signal = await prisma.signals.findUnique({
          where: { id: signalId },
          select: { created_at: true, executor_agreement_error: true },
        });

        const signalAge = Date.now() - (signal?.created_at?.getTime() || 0);
        const MAX_RETRY_AGE = 24 * 60 * 60 * 1000; // 24 hours
        const MAX_RETRIES = 2;

        // Count retries by checking how many times RETRY # appears
        const retryCount =
          (signal?.executor_agreement_error?.match(/RETRY #/g)?.length || 0) +
          1;

        if (signalAge > MAX_RETRY_AGE) {
          // Signal too old - mark as permanently failed
          await prisma.signals.update({
            where: { id: signalId },
            data: {
              trade_executed: "FAILED",
              execution_result: `Retry timeout (signal older than 24h): ${errorMessage}`,
              executor_agreement_error: null,
            },
          });
          console.log(
            `[TradeExecutor]       ❌ Trade failed - signal too old for retry: ${errorMessage}`
          );
        } else if (retryCount > MAX_RETRIES) {
          // Max retries reached - mark as permanently failed
          await prisma.signals.update({
            where: { id: signalId },
            data: {
              trade_executed: "FAILED",
              execution_result: `Max retries (${MAX_RETRIES}) exceeded: ${errorMessage}`,
              executor_agreement_error: null,
            },
          });
          console.log(
            `[TradeExecutor]       ❌ Trade failed after ${MAX_RETRIES} retries: ${errorMessage}`
          );
        } else {
          // Store error in executor_agreement_error for retry tracking
          const existingError = signal?.executor_agreement_error || "";
          const retryError = existingError.includes("RETRYABLE")
            ? `${existingError} | RETRY #${retryCount}`
            : `RETRYABLE: ${errorMessage} | RETRY #${retryCount}`;

          await prisma.signals.update({
            where: { id: signalId },
            data: {
              executor_agreement_error: retryError,
            },
          });

          console.log(
            `[TradeExecutor]       ⚠️  Trade failed (retryable, attempt ${retryCount}/${MAX_RETRIES}): ${errorMessage}`
          );
          console.log(`[TradeExecutor]       Will retry in next cycle`);
        }
      } else {
        await prisma.signals.update({
          where: { id: signalId },
          data: {
            trade_executed: "FAILED",
            execution_result: errorMessage,
            executor_agreement_error: null, // Clear retry flag
          },
        });

        console.log(
          `[TradeExecutor]       ❌ Trade failed (permanent): ${errorMessage}`
        );
      }
    }
  } catch (error: any) {
    console.error(`[TradeExecutor] ❌ Error executing signal:`, error.message);

    // Check if error is retryable
    const isRetryable = isRetryableError(error.message);

    try {
      if (isRetryable) {
        // Store error for retry
        await prisma.signals.update({
          where: { id: signalId },
          data: {
            executor_agreement_error: `RETRYABLE: ${error.message}`,
          },
        });
        console.log(
          `[TradeExecutor]       ⚠️  Execution error (retryable): ${error.message}`
        );
        console.log(`[TradeExecutor]       Will retry in next cycle`);
      } else {
        await prisma.signals.update({
          where: { id: signalId },
          data: {
            trade_executed: "FAILED",
            execution_result: `Execution error: ${error.message}`,
            executor_agreement_error: null,
          },
        });
        console.log(
          `[TradeExecutor]       ❌ Execution error (permanent): ${error.message}`
        );
      }
    } catch (updateError) {
      console.error(`[TradeExecutor] ❌ Failed to update signal:`, updateError);
    }
  }
}

/**
 * Check if an error is retryable (backend/service errors)
 */
function isRetryableError(errorMessage: string): boolean {
  if (!errorMessage) return false;

  const lowerError = errorMessage.toLowerCase();

  // Retryable errors: backend/service errors
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
  ];

  return retryablePatterns.some((pattern) => lowerError.includes(pattern));
}

/**
 * Main worker loop
 */
async function runWorker() {
  try {
    console.log("🚀 Trade Executor Worker starting...");
    console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000}s)`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Test database connection first
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error(
        "Database connection failed. Check DATABASE_URL environment variable."
      );
    }
    console.log("✅ Database connection: OK");

    // Run immediately on startup
    await executeAllPendingSignals();

    // Then run on interval
    workerInterval = setInterval(async () => {
      await executeAllPendingSignals();
    }, INTERVAL);

    console.log("✅ Trade Executor Worker started successfully");
  } catch (error: any) {
    console.error("[TradeExecutor] ❌ Failed to start worker:", error.message);
    console.error("[TradeExecutor] Stack:", error.stack);
    throw error; // Re-throw to be caught by caller
  }
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping Trade Executor Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown("Trade Executor Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[TradeExecutor] ❌ Worker failed to start:", error);
    console.error("[TradeExecutor] Stack:", error.stack);
    // Don't exit immediately - let Railway health checks handle it
    // This allows the service to stay up and show errors in logs
    setTimeout(() => {
      console.error("[TradeExecutor] Exiting after error...");
      process.exit(1);
    }, 5000);
  });
}

export { executeAllPendingSignals, executeSignal };
