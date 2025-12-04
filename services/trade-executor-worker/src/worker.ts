/**
 * Trade Execution Worker (Microservice)
 * Runs automatically to execute pending signals
 * Interval: 30 seconds (configurable via WORKER_INTERVAL)
 */

import dotenv from 'dotenv';
import express from 'express';
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const PORT = process.env.PORT || 5001;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || '30000'); // 30 seconds default

let workerInterval: NodeJS.Timeout | null = null;

// Health check server
const app = express();
app.get('/health', async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'trade-executor-worker',
    interval: INTERVAL,
    database: dbHealthy ? 'connected' : 'disconnected',
    isRunning: workerInterval !== null,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Trade Executor Worker health check on port ${PORT}`);
});

/**
 * Execute all pending signals
 * Finds signals without positions and tries to execute them
 */
async function executeAllPendingSignals() {
  console.log('[TradeExecutor] ⏰ Running trade execution cycle...');
  
  try {
    // Fetch pending signals (signals without positions, not skipped)
    // Also include signals that failed due to backend errors (retryable)
    const pendingSignals = await prisma.signals.findMany({
      where: {
        positions: {
          none: {}, // No positions created yet
        },
        // Include signals that are not skipped, OR signals that failed due to retryable errors
        // But limit retries: only retry if created within last 24 hours (prevents infinite retries)
        OR: [
          { skipped_reason: null }, // Not skipped
          { 
            // Retryable errors: backend/service errors that should be retried
            // Only retry signals created in last 24 hours
            AND: [
              {
                executor_agreement_error: {
                  contains: 'RETRYABLE',
                  mode: 'insensitive',
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
        agents: {
          status: 'PUBLIC', // Only execute for public agents
          agent_deployments: {
            some: {
              status: 'ACTIVE'
            },
          },
        },
      },
      include: {
        agents: {
          include: {
            agent_deployments: {
              where: { 
                status: 'ACTIVE'
              }
            },
          },
        },
      },
      orderBy: {
        created_at: 'asc',
      },
      take: 20, // Process 20 signals per run
    });

    console.log(`[TradeExecutor] 📊 Found ${pendingSignals.length} pending signals`);

    if (pendingSignals.length === 0) {
      console.log('[TradeExecutor] ✅ No pending signals to process');
      return;
    }

    // Process each signal
    for (const signal of pendingSignals) {
      try {
        const deployments = (signal as any).agents?.agent_deployments || [];
        
        if (deployments.length === 0) {
          console.log(`[TradeExecutor] ⚠️  Signal ${signal.id}: No active deployments found`);
          continue;
        }

        console.log(`[TradeExecutor] 🔄 Processing signal ${signal.id.substring(0, 8)}...`);
        console.log(`[TradeExecutor]    Agent: ${(signal as any).agents?.name}`);
        console.log(`[TradeExecutor]    Token: ${signal.token_symbol}`);
        console.log(`[TradeExecutor]    Side: ${signal.side}`);
        console.log(`[TradeExecutor]    Venue: ${signal.venue}`);
        console.log(`[TradeExecutor]    Deployments: ${deployments.length} active`);

        // Execute the signal for ALL active deployments
        for (const deployment of deployments) {
          try {
            console.log(`[TradeExecutor]       → Deployment ${deployment.id.substring(0, 8)}...`);
            await executeSignal(signal.id, deployment.id);
            
            // Small delay between executions
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error: any) {
            console.error(`[TradeExecutor]       ❌ Error executing for deployment ${deployment.id.substring(0, 8)}: ${error.message}`);
            // Continue with next deployment even if one fails
          }
        }
      } catch (error: any) {
        console.error(`[TradeExecutor] ❌ Error processing signal ${signal.id}:`, error.message);
      }
    }

    console.log('[TradeExecutor] ✅ Trade execution cycle complete');
  } catch (error: any) {
    console.error('[TradeExecutor] ❌ Fatal error in execution cycle:', error);
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
      console.log(`[TradeExecutor]       ⏭️  Position already exists for this deployment`);
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

    // Execute trade via external service
    const { executeTrade } = await import('./lib/trade-executor');
    const result = await executeTrade(signal, deployment);

    if (result.success) {
      // Create position record with actual values from execution
      const sizeModel = typeof signal.size_model === 'string' 
        ? JSON.parse(signal.size_model) 
        : signal.size_model;
      
      const riskModel = typeof signal.risk_model === 'string'
        ? JSON.parse(signal.risk_model)
        : signal.risk_model;

      // Use actual values from execution result
      const entryPrice = result.entryPrice || 0;
      const collateral = result.collateral || 0;
      const ostiumTradeIndex = result.ostiumTradeIndex;

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
            status: 'OPEN',
            ostium_trade_index: ostiumTradeIndex, // Store Ostium trade index for closing
          },
          update: {
            // If position already exists, update with new data (shouldn't happen normally)
            entry_tx_hash: result.txHash,
            entry_price: entryPrice,
            qty: collateral,
            ostium_trade_index: ostiumTradeIndex,
          },
        });

        console.log(`[TradeExecutor]       ✅ Trade executed successfully`);
        console.log(`[TradeExecutor]       TX Hash: ${result.txHash || 'N/A'}`);
        console.log(`[TradeExecutor]       Entry Price: $${entryPrice || 'pending'}`);
        console.log(`[TradeExecutor]       Collateral: $${collateral || 'N/A'}`);
        if (ostiumTradeIndex !== undefined) {
          console.log(`[TradeExecutor]       Ostium Trade Index: ${ostiumTradeIndex}`);
        }
      } catch (dbError: any) {
        // Handle any database errors gracefully
        if (dbError.code === 'P2002') {
          // Unique constraint violation - position already exists
          console.log(`[TradeExecutor]       ⚠️  Position already exists for this deployment-signal pair`);
          console.log(`[TradeExecutor]       Trade was executed but position record already created`);
        } else {
          throw dbError; // Re-throw other errors
        }
      }
    } else {
      // Check if error is retryable (backend/service errors)
      const errorMessage = result.error || result.reason || 'Execution failed';
      const isRetryable = isRetryableError(errorMessage);
      
      if (isRetryable) {
        // Check signal age - only retry signals created within last 24 hours
        const signal = await prisma.signals.findUnique({
          where: { id: signalId },
          select: { created_at: true, executor_agreement_error: true },
        });
        
        const signalAge = Date.now() - (signal?.created_at?.getTime() || 0);
        const MAX_RETRY_AGE = 24 * 60 * 60 * 1000; // 24 hours
        const MAX_RETRIES = 10; // Maximum 10 retries
        
        // Count retries by checking how many times RETRY # appears
        const retryCount = (signal?.executor_agreement_error?.match(/RETRY #/g)?.length || 0) + 1;
        
        if (signalAge > MAX_RETRY_AGE) {
          // Signal too old - mark as permanently failed
          await prisma.signals.update({
            where: { id: signalId },
            data: {
              skipped_reason: `Retry timeout (signal older than 24h): ${errorMessage}`,
              executor_agreement_error: null,
            },
          });
          console.log(`[TradeExecutor]       ❌ Trade failed - signal too old for retry: ${errorMessage}`);
        } else if (retryCount > MAX_RETRIES) {
          // Max retries reached - mark as permanently failed
          await prisma.signals.update({
            where: { id: signalId },
            data: {
              skipped_reason: `Max retries (${MAX_RETRIES}) exceeded: ${errorMessage}`,
              executor_agreement_error: null,
            },
          });
          console.log(`[TradeExecutor]       ❌ Trade failed after ${MAX_RETRIES} retries: ${errorMessage}`);
        } else {
          // Store error in executor_agreement_error for retry tracking
          // Don't mark as skipped - allow retry
          const existingError = signal?.executor_agreement_error || '';
          const retryError = existingError.includes('RETRYABLE') 
            ? `${existingError} | RETRY #${retryCount}`
            : `RETRYABLE: ${errorMessage} | RETRY #${retryCount}`;
          
          await prisma.signals.update({
            where: { id: signalId },
            data: {
              executor_agreement_error: retryError,
              skipped_reason: null, // Clear skip flag to allow retry
            },
          });

          console.log(`[TradeExecutor]       ⚠️  Trade failed (retryable, attempt ${retryCount}/${MAX_RETRIES}): ${errorMessage}`);
          console.log(`[TradeExecutor]       Will retry in next cycle`);
        }
      } else {
        // Permanent failure - mark as skipped
        await prisma.signals.update({
          where: { id: signalId },
          data: {
            skipped_reason: errorMessage,
            executor_agreement_error: null, // Clear retry flag
          },
        });

        console.log(`[TradeExecutor]       ❌ Trade failed (permanent): ${errorMessage}`);
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
            skipped_reason: null, // Clear skip flag to allow retry
          },
        });
        console.log(`[TradeExecutor]       ⚠️  Execution error (retryable): ${error.message}`);
        console.log(`[TradeExecutor]       Will retry in next cycle`);
      } else {
        // Permanent failure - mark as skipped
        await prisma.signals.update({
          where: { id: signalId },
          data: {
            skipped_reason: `Execution error: ${error.message}`,
            executor_agreement_error: null,
          },
        });
        console.log(`[TradeExecutor]       ❌ Execution error (permanent): ${error.message}`);
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
    'service error',
    '500',
    '503',
    '502',
    '504',
    'timeout',
    'network',
    'connection',
    'econnrefused',
    'econnreset',
    'etimedout',
    'fetch failed',
    'request failed',
    'ostium service',
    'hyperliquid service',
    'backend error',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
  ];
  
  return retryablePatterns.some(pattern => lowerError.includes(pattern));
}

/**
 * Main worker loop
 */
async function runWorker() {
  try {
    console.log('🚀 Trade Executor Worker starting...');
    console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000}s)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Test database connection first
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error('Database connection failed. Check DATABASE_URL environment variable.');
    }
    console.log('✅ Database connection: OK');
    
    // Run immediately on startup
    await executeAllPendingSignals();
    
    // Then run on interval
    workerInterval = setInterval(async () => {
      await executeAllPendingSignals();
    }, INTERVAL);
    
    console.log('✅ Trade Executor Worker started successfully');
  } catch (error: any) {
    console.error('[TradeExecutor] ❌ Failed to start worker:', error.message);
    console.error('[TradeExecutor] Stack:', error.stack);
    throw error; // Re-throw to be caught by caller
  }
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log('🛑 Stopping Trade Executor Worker interval...');
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown('Trade Executor Worker', server);

// Start worker
if (require.main === module) {
  runWorker().catch(error => {
    console.error('[TradeExecutor] ❌ Worker failed to start:', error);
    console.error('[TradeExecutor] Stack:', error.stack);
    // Don't exit immediately - let Railway health checks handle it
    // This allows the service to stay up and show errors in logs
    setTimeout(() => {
      console.error('[TradeExecutor] Exiting after error...');
      process.exit(1);
    }, 5000);
  });
}

export { executeAllPendingSignals, executeSignal };
