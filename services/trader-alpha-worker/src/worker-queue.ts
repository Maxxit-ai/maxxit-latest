/**
 * Trader Alpha Worker with BullMQ (Event-Driven Parallel Processing)
 *
 * Fetches trades from tracked traders (for copy-trading / Alpha Clubs).
 * Jobs are processed in parallel across multiple workers for faster throughput.
 *
 * Flow:
 * 1. Interval trigger finds copy-trade agents with active tracked traders
 * 2. For each trader, a job is added to queue to fetch recent trades from subgraph
 * 3. Fetched trades are stored in trader_trades table
 * 4. signal-generator-worker processes these trades to create signals
 */

import dotenv from "dotenv";
import express from "express";
import { prisma, checkDatabaseHealth, disconnectPrisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup, createHealthCheckHandler } from "@maxxit/common";
import {
    createWorkerPool,
    createQueue,
    addJob,
    getQueueStats,
    startIntervalTrigger,
    shutdownQueueService,
    isRedisHealthy,
    withLock,
    getTraderTradeLockKey,
    QueueName,
    TraderAlphaJobData,
    FetchTraderTradesJobData,
    ProcessTraderTradeJobData,
    CheckTraderTradeStatusJobData,
    JobResult,
    Job,
} from "@maxxit/queue";

// Bull Board imports
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

dotenv.config();

const PORT = process.env.PORT || 5016;
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || "3");
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5");
const TRIGGER_INTERVAL = parseInt(process.env.TRIGGER_INTERVAL || "60000"); // 1 minute

// Lookback window for fetching trades (in seconds)
const TRADE_LOOKBACK_SECONDS = parseInt(process.env.TRADE_LOOKBACK_SECONDS || "86400"); // 24 hours

const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmgql529ykrlw01v6b9so0woq/subgraphs/ost-prod/v8/gn";

// Health check server
const app = express();
app.get(
    "/health",
    createHealthCheckHandler("trader-alpha-worker", async () => {
        const [dbHealthy, redisHealthy] = await Promise.all([
            checkDatabaseHealth(),
            isRedisHealthy(),
        ]);

        let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
        try {
            queueStats = await getQueueStats(QueueName.TRADER_ALPHA);
        } catch {
            // Queue might not be initialized yet
        }

        return {
            database: dbHealthy ? "connected" : "disconnected",
            redis: redisHealthy ? "connected" : "disconnected",
            workerCount: WORKER_COUNT,
            workerConcurrency: WORKER_CONCURRENCY,
            triggerInterval: TRIGGER_INTERVAL,
            lookbackSeconds: TRADE_LOOKBACK_SECONDS,
            queue: queueStats,
        };
    })
);

const server = app.listen(PORT, () => {
    console.log(`🏥 Trader Alpha Worker health check on port ${PORT}`);
});

/**
 * Setup Bull Board for queue visualization
 */
function setupBullBoard() {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath("/admin/queues");

    const traderAlphaQueue = createQueue(QueueName.TRADER_ALPHA);

    createBullBoard({
        queues: [new BullMQAdapter(traderAlphaQueue)],
        serverAdapter,
    });

    app.use("/admin/queues", serverAdapter.getRouter());
    console.log(`📊 Bull Board available at http://localhost:${PORT}/admin/queues`);
}

// ============================================================================
// Types
// ============================================================================

interface SubgraphTrade {
    id: string;
    trader: string;
    index: string;
    isBuy: boolean;
    collateral: string;
    leverage: string;
    openPrice: string;
    timestamp: string;
    takeProfitPrice?: string;
    stopLossPrice?: string;
    pair: {
        id: string;
        from: string;
        to: string;
    };
}

interface TrackedTrader {
    trader_wallet: string;
    agent_id: string;
    token_filters: string[];
}

// ============================================================================
// Subgraph Queries
// ============================================================================

/**
 * Fetch recent trades for a trader address
 */
async function fetchRecentTrades(
    traderAddress: string,
    sinceTimestamp: number
): Promise<SubgraphTrade[]> {
    const formattedAddress = traderAddress.toLowerCase();

    const query = `
    query GetRecentTrades($trader: String!, $since: BigInt!) {
      trades(
        where: { 
          trader: $trader,
          timestamp_gte: $since
        }
        orderBy: timestamp
        orderDirection: desc
        first: 50
      ) {
        id
        trader
        index
        isBuy
        collateral
        leverage
        openPrice
        timestamp
        pair {
          id
          from
          to
        }
        takeProfitPrice
        stopLossPrice
      }
    }
  `;

    try {
        const response = await fetch(SUBGRAPH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                variables: {
                    trader: formattedAddress,
                    since: sinceTimestamp.toString(),
                },
            }),
        });

        const result = await response.json() as { data?: { trades: SubgraphTrade[] }; errors?: any[] };

        if (result.errors) {
            console.error("  ⚠️ Subgraph errors:", result.errors);
            return [];
        }

        return result.data?.trades || [];
    } catch (error: any) {
        console.error(`  ❌ Error fetching trades from subgraph:`, error.message);
        return [];
    }
}

/**
 * Fetch trade status by trade ID
 * Returns { isOpen: boolean } or null if trade not found
 */
async function fetchTradeStatus(
    tradeId: string
): Promise<{ id: string; isOpen: boolean; trader: string } | null> {
    const query = `
    query GetTradeStatus($id: ID!) {
      trade(id: $id) {
        id
        isOpen
        trader
      }
    }
  `;

    try {
        const response = await fetch(SUBGRAPH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                variables: { id: tradeId },
            }),
        });

        const result = await response.json() as { data?: { trade: { id: string; isOpen: boolean; trader: string } | null }; errors?: any[] };

        if (result.errors) {
            console.error("  ⚠️ Subgraph errors:", result.errors);
            return null;
        }

        return result.data?.trade || null;
    } catch (error: any) {
        console.error(`  ❌ Error fetching trade status from subgraph:`, error.message);
        return null;
    }
}

// ============================================================================
// Job Processors
// ============================================================================

/**
 * Process a single trader alpha job
 */
async function processTraderAlphaJob(
    job: Job<TraderAlphaJobData>
): Promise<JobResult> {
    const { data } = job;

    if (data.type === "FETCH_TRADER_TRADES") {
        return await processFetchTraderTradesJob(data);
    } else if (data.type === "PROCESS_TRADER_TRADE") {
        return await processTraderTradeJob(data);
    } else if (data.type === "CHECK_TRADER_TRADE_STATUS") {
        return await processCheckTraderTradeStatusJob(data);
    }

    return {
        success: false,
        error: `Unknown job type: ${(data as any).type}`,
    };
}

/**
 * Fetch trades for a specific trader from subgraph
 */
async function processFetchTraderTradesJob(
    jobData: FetchTraderTradesJobData
): Promise<JobResult> {
    const { traderWallet, agentId, tokenFilters, sinceTimestamp } = jobData;

    try {
        console.log(`[TraderAlpha] 📡 Fetching trades for ${traderWallet.slice(0, 10)}...`);

        const trades = await fetchRecentTrades(traderWallet, sinceTimestamp);

        if (trades.length === 0) {
            return { success: true, message: "No new trades found" };
        }

        console.log(`[TraderAlpha] ✅ Found ${trades.length} trades for ${traderWallet.slice(0, 10)}...`);

        let tradesQueued = 0;
        let filteredOut = 0;

        for (const trade of trades) {
            // Get symbol from pair
            const symbol = trade.pair?.from;
            if (!symbol) continue;

            // Normalize symbol (remove any trailing "/" like "BTC/" -> "BTC")
            const normalizedSymbol = symbol.replace(/\/$/, "").toUpperCase();

            // Check token filters
            if (tokenFilters.length > 0) {
                const matchesFilter = tokenFilters.some(
                    filter => normalizedSymbol.startsWith(filter.toUpperCase())
                );
                if (!matchesFilter) {
                    filteredOut++;
                    continue;
                }
            }

            // Parse trade data
            const takeProfitPrice = trade.takeProfitPrice
                ? Number(trade.takeProfitPrice) / 1e18
                : undefined;
            const stopLossPrice = trade.stopLossPrice
                ? Number(trade.stopLossPrice) / 1e18
                : undefined;

            // Queue a job to process this trade
            await addJob(
                QueueName.TRADER_ALPHA,
                "process-trader-trade",
                {
                    type: "PROCESS_TRADER_TRADE" as const,
                    tradeId: trade.id,
                    agentId: agentId,
                    traderWallet: trade.trader,
                    tokenSymbol: normalizedSymbol,
                    side: trade.isBuy ? "LONG" : "SHORT",
                    collateral: Number(trade.collateral) / 1e6, // Ostium uses 6 decimals for USDC
                    leverage: parseFloat(trade.leverage) / 100, // Ostium stores leverage as integer
                    entryPrice: Number(trade.openPrice) / 1e18, // Ostium uses 18 decimals for price
                    tradeTimestamp: parseInt(trade.timestamp),
                    takeProfitPrice,
                    stopLossPrice,
                    timestamp: Date.now(),
                },
                {
                    jobId: `trade-${trade.id}-${agentId}`,
                }
            );
            tradesQueued++;
        }

        return {
            success: true,
            message: `Queued ${tradesQueued} trades (${filteredOut} filtered out)`,
            data: { tradesQueued, filteredOut },
        };
    } catch (error: any) {
        console.error(`[TraderAlpha] ❌ Error fetching trades:`, error.message);
        throw error;
    }
}

/**
 * Process a single trader trade and store it
 */
async function processTraderTradeJob(
    jobData: ProcessTraderTradeJobData
): Promise<JobResult> {
    const { tradeId, agentId, traderWallet, tokenSymbol, side, collateral, leverage, entryPrice, tradeTimestamp, takeProfitPrice, stopLossPrice } = jobData;

    const sourceTradeId = `${tradeId}-${agentId}`;
    const lockKey = getTraderTradeLockKey(tradeId, agentId);

    // Use distributed lock to prevent duplicate processing
    const result = await withLock(lockKey, async () => {
        // Check if already stored
        const existing = await prisma.trader_trades.findUnique({
            where: { source_trade_id: sourceTradeId },
        });

        if (existing) {
            return { success: true, message: "Trade already stored" };
        }

        // Store the trade with correct trader wallet and timestamp from subgraph
        await prisma.trader_trades.create({
            data: {
                source_trade_id: sourceTradeId,
                trader_wallet: traderWallet,
                agent_id: agentId,
                token_symbol: tokenSymbol,
                side: side,
                collateral: collateral.toString(),
                leverage: leverage,
                entry_price: entryPrice.toString(),
                take_profit_price: takeProfitPrice?.toString() || null,
                stop_loss_price: stopLossPrice?.toString() || null,
                is_open: true,
                processed_for_signals: false,
                trade_timestamp: new Date(tradeTimestamp * 1000), // Convert unix seconds to Date
            },
        });

        console.log(`[TraderAlpha] ✅ Stored: ${side} ${tokenSymbol} from ${traderWallet.slice(0, 10)}... (TP: ${takeProfitPrice?.toFixed(2) || 'N/A'}, SL: ${stopLossPrice?.toFixed(2) || 'N/A'})`);

        return {
            success: true,
            message: `Stored trade: ${side} ${tokenSymbol}`,
            data: { tradeId: sourceTradeId },
        };
    });

    if (result === undefined) {
        return { success: true, message: "Trade already being processed by another worker" };
    }

    return result;
}

/**
 * Check if a trader's trade has been closed on the subgraph
 * If closed, mark it as closed in trader_trades table
 */
async function processCheckTraderTradeStatusJob(
    jobData: CheckTraderTradeStatusJobData
): Promise<JobResult> {
    const { tradeId, sourceTradeId, agentId, traderTradeDbId } = jobData;

    try {
        // Fetch trade status from subgraph
        const tradeStatus = await fetchTradeStatus(tradeId);

        if (!tradeStatus) {
            // Trade not found - might have been deleted or invalid ID
            console.log(`[TraderAlpha] ⚠️ Trade ${tradeId} not found on subgraph`);
            return { success: true, message: "Trade not found on subgraph" };
        }

        if (tradeStatus.isOpen) {
            // Trade is still open, nothing to do
            return { success: true, message: "Trade still open" };
        }

        // Trade is closed on subgraph - mark as closed in our DB
        console.log(`[TraderAlpha] 🔴 Trade ${tradeId} closed on subgraph - updating trader_trades`);

        await prisma.trader_trades.update({
            where: { id: traderTradeDbId },
            data: { is_open: false },
        });

        console.log(`[TraderAlpha] ✅ Marked trade ${sourceTradeId} as closed`);

        return {
            success: true,
            message: `Trade ${tradeId} marked as closed`,
            data: { tradeId, sourceTradeId, wasClosed: true },
        };
    } catch (error: any) {
        console.error(`[TraderAlpha] ❌ Error checking trade status:`, error.message);
        throw error;
    }
}

// ============================================================================
// Interval Trigger
// ============================================================================

/**
 * Check for tracked traders and queue fetch jobs
 */
async function checkAndQueueTraderJobs(): Promise<void> {
    try {
        // Get all copy-trade agents with active tracked traders
        const copyTradeAgents = await prisma.agents.findMany({
            where: {
                is_copy_trade_club: true,
                status: { in: ["PUBLIC", "PRIVATE"] },
                agent_top_traders: {
                    some: {
                        is_active: true,
                    },
                },
            },
            include: {
                agent_top_traders: {
                    where: { is_active: true },
                    include: {
                        top_traders: {
                            select: { wallet_address: true },
                        },
                    },
                },
            },
        });

        if (copyTradeAgents.length === 0) {
            return;
        }

        console.log(`[Trigger] Found ${copyTradeAgents.length} copy-trade agent(s)`);

        const sinceTimestamp = Math.floor(Date.now() / 1000) - TRADE_LOOKBACK_SECONDS;
        let jobsQueued = 0;

        // Build a map to avoid duplicate fetches for same trader across agents
        const traderAgentMap = new Map<string, TrackedTrader[]>();

        for (const agent of copyTradeAgents) {
            for (const tt of agent.agent_top_traders) {
                const walletLower = tt.top_traders.wallet_address.toLowerCase();
                if (!traderAgentMap.has(walletLower)) {
                    traderAgentMap.set(walletLower, []);
                }
                traderAgentMap.get(walletLower)!.push({
                    trader_wallet: tt.top_traders.wallet_address,
                    agent_id: agent.id,
                    token_filters: agent.token_filters || [],
                });
            }
        }

        // Queue a fetch job for each unique trader-agent combination
        for (const [traderWallet, trackers] of traderAgentMap) {
            for (const tracker of trackers) {
                await addJob(
                    QueueName.TRADER_ALPHA,
                    "fetch-trader-trades",
                    {
                        type: "FETCH_TRADER_TRADES" as const,
                        traderWallet: tracker.trader_wallet,
                        agentId: tracker.agent_id,
                        tokenFilters: tracker.token_filters,
                        sinceTimestamp: sinceTimestamp,
                        timestamp: Date.now(),
                    },
                    {
                        jobId: `fetch-${traderWallet}-${tracker.agent_id}-${Math.floor(Date.now() / 60000)}`,
                    }
                );
                jobsQueued++;
            }
        }

        if (jobsQueued > 0) {
            console.log(`[Trigger] Queued ${jobsQueued} trader fetch jobs`);
        }
    } catch (error: any) {
        console.error("[Trigger] Error checking traders:", error.message);
    }
}

/**
 * Queue status check jobs for all open trader trades
 * This detects when source traders close their positions
 */
async function checkAndQueueTradeStatusJobs(): Promise<void> {
    try {
        // Get all open trader trades
        const openTrades = await prisma.trader_trades.findMany({
            where: { is_open: true },
            select: {
                id: true,
                source_trade_id: true,
                agent_id: true,
            },
        });

        if (openTrades.length === 0) {
            return;
        }

        console.log(`[StatusCheck] Checking ${openTrades.length} open trader trades`);

        let jobsQueued = 0;

        for (const trade of openTrades) {
            // Extract the original trade ID (before the hyphen-uuid suffix)
            // source_trade_id format: "1145147-uuid" -> tradeId is "1145147"
            const tradeId = trade.source_trade_id.split("-")[0];

            await addJob(
                QueueName.TRADER_ALPHA,
                "check-trade-status",
                {
                    type: "CHECK_TRADER_TRADE_STATUS" as const,
                    tradeId: tradeId,
                    sourceTradeId: trade.source_trade_id,
                    agentId: trade.agent_id,
                    traderTradeDbId: trade.id,
                    timestamp: Date.now(),
                },
                {
                    // Use jobId to dedupe within same minute
                    jobId: `status-${trade.source_trade_id}-${Math.floor(Date.now() / 60000)}`,
                }
            );
            jobsQueued++;
        }

        if (jobsQueued > 0) {
            console.log(`[StatusCheck] Queued ${jobsQueued} status check jobs`);
        }
    } catch (error: any) {
        console.error("[StatusCheck] Error queuing status checks:", error.message);
    }
}

// ============================================================================
// Main Worker Startup
// ============================================================================

async function runWorker() {
    try {
        console.log("🚀 Trader Alpha Worker (Event-Driven) starting...");
        console.log(`👷 Worker count: ${WORKER_COUNT}`);
        console.log(`🔄 Concurrency per worker: ${WORKER_CONCURRENCY}`);
        console.log(`⏱️  Trigger interval: ${TRIGGER_INTERVAL}ms`);
        console.log(`⏪ Lookback: ${TRADE_LOOKBACK_SECONDS}s`);
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
        createWorkerPool<TraderAlphaJobData>(
            QueueName.TRADER_ALPHA,
            processTraderAlphaJob,
            WORKER_COUNT,
            {
                concurrency: WORKER_CONCURRENCY,
                lockDuration: 60000, // 1 minute for subgraph fetches
            }
        );

        // Start interval trigger for fetching new trades
        startIntervalTrigger(TRIGGER_INTERVAL, checkAndQueueTraderJobs, {
            runImmediately: true,
            name: "trader-alpha-trigger",
        });

        // Start interval trigger for checking trade status (every 1 minute)
        startIntervalTrigger(60000, checkAndQueueTradeStatusJobs, {
            runImmediately: false, // Let trades be fetched first
            name: "trade-status-check-trigger",
        });

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("✅ Trader Alpha Worker started successfully");
        console.log(`📊 Effective parallel capacity: ${WORKER_COUNT * WORKER_CONCURRENCY} concurrent jobs`);
    } catch (error: any) {
        console.error("[TraderAlpha] ❌ Failed to start worker:", error.message);
        throw error;
    }
}

// Cleanup handlers
registerCleanup(async () => {
    console.log("🛑 Stopping Trader Alpha Worker...");
    await shutdownQueueService();
    await disconnectPrisma();
    console.log("✅ Cleanup complete");
});

setupGracefulShutdown("Trader Alpha Worker", server);

// Start worker
if (require.main === module) {
    runWorker().catch((error) => {
        console.error("[TraderAlpha] ❌ Worker failed to start:", error);
        setTimeout(() => process.exit(1), 5000);
    });
}

export { processTraderAlphaJob, checkAndQueueTraderJobs };
