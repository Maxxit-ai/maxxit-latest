/**
 * Top Traders Worker
 * 
 * Fetches top traders from Ostium subgraph, calculates impact factors,
 * and stores results in the database.
 * 
 * Interval: 6 hours
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import {
    setupGracefulShutdown,
    registerCleanup,
    createHealthCheckHandler,
} from "@maxxit/common";

dotenv.config();

const PORT = process.env.PORT || 5015;
const INTERVAL = parseInt(process.env.TOP_TRADERS_INTERVAL || "21600000"); // 6 hours default
const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmgql529ykrlw01v6b9so0woq/subgraphs/ost-prod/v8/gn";

const WEIGHT_EDGE = 0.55;
const WEIGHT_CONSISTENCY = 0.20;
const WEIGHT_STAKE = 0.15;
const WEIGHT_FRESHNESS = 0.10;

const BAYESIAN_ALPHA = 3;
const BAYESIAN_BETA = 3;

const FRESHNESS_HALF_LIFE = 14;

const EPSILON = 1e-6;

let workerInterval: NodeJS.Timeout | null = null;

const app = express();
app.get(
    "/health",
    createHealthCheckHandler("top-traders-worker", async () => {
        return {
            interval: INTERVAL,
            isRunning: workerInterval !== null,
            subgraphUrl: SUBGRAPH_URL,
        };
    })
);

const server = app.listen(PORT, () => {
    console.log(`🏥 Top Traders Worker health check on port ${PORT}`);
});

interface SubgraphUser {
    id: string;
    totalVolume: string;
    totalOpenVolume: string;
    totalClosedVolume: string;
    totalPnL: string;
    totalProfitTrades: string;
    totalLossTrades: string;
}

interface SubgraphTrade {
    timestamp: string;
}

interface TraderStats {
    walletAddress: string;
    totalVolume: bigint;
    totalClosedVolume: bigint;
    totalPnL: bigint;
    totalProfitTrades: number;
    totalLossTrades: number;
    totalTrades: number;
    lastActiveAt: Date;
}

interface PercentileStats {
    roiP50: number;
    roiP90: number;
    wrP50: number;
    wrP90: number;
    volumeP95: number;
    tradesP95: number;
}

// ============================================================================
// Subgraph Queries
// ============================================================================

/**
 * Fetch top users from subgraph ordered by PnL
 */
async function fetchTopUsers(limit: number = 1000): Promise<SubgraphUser[]> {
    const query = `
    query GetTopUsers($first: Int!) {
      users(orderBy: totalPnL, orderDirection: desc, first: $first) {
        id
        totalVolume
        totalOpenVolume
        totalClosedVolume
        totalPnL
        totalProfitTrades
        totalLossTrades
      }
    }
  `;

    const response = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { first: limit } }),
    });

    const result = await response.json() as { data: { users: SubgraphUser[] } };
    return result.data?.users || [];
}

/**
 * Fetch last trade timestamp for a user
 */
async function fetchLastTradeTimestamp(traderId: string): Promise<Date | null> {
    const query = `
    query GetLastTrade($trader: String!) {
      trades(
        where: { trader: $trader }
        orderBy: timestamp
        orderDirection: desc
        first: 1
      ) {
        timestamp
      }
    }
  `;

    const response = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { trader: traderId } }),
    });

    const result = await response.json() as { data: { trades: SubgraphTrade[] } };
    const trades = result.data?.trades || [];

    if (trades.length > 0) {
        return new Date(parseInt(trades[0].timestamp) * 1000);
    }
    return null;
}

// ============================================================================
// Impact Factor Calculations
// ============================================================================

/**
 * Calculate percentiles from array of numbers
 */
function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

/**
 * Clip value to [min, max] range
 */
function clip(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Calculate population percentile stats for normalization
 */
function calculatePercentileStats(traders: TraderStats[]): PercentileStats {
    const rois: number[] = [];
    const winRates: number[] = [];
    const volumes: number[] = [];
    const tradeCounts: number[] = [];

    for (const trader of traders) {
        const closedVolume = Number(trader.totalClosedVolume) / 1e6;
        const pnl = Number(trader.totalPnL) / 1e6;
        const N = trader.totalTrades;

        if (closedVolume > 0) {
            rois.push(pnl / closedVolume);
        }

        if (N > 0) {
            winRates.push(trader.totalProfitTrades / N);
        }

        volumes.push(Number(trader.totalVolume) / 1e6);
        tradeCounts.push(N);
    }

    return {
        roiP50: percentile(rois, 50),
        roiP90: percentile(rois, 90),
        wrP50: percentile(winRates, 50),
        wrP90: percentile(winRates, 90),
        volumeP95: percentile(volumes, 95),
        tradesP95: percentile(tradeCounts, 95),
    };
}

/**
 * Calculate Edge Score (E) - Profitability based on ROI
 */
function calculateEdgeScore(pnl: number, closedVolume: number, stats: PercentileStats): number {
    if (closedVolume <= 0) return 0;

    const roi = pnl / closedVolume;
    const denominator = stats.roiP90 - stats.roiP50;

    if (denominator <= 0) return roi > stats.roiP50 ? 1 : 0;

    return clip((roi - stats.roiP50) / denominator, 0, 1);
}

/**
 * Calculate Consistency Score (K) - Bayesian win-rate
 */
function calculateConsistencyScore(wins: number, total: number, stats: PercentileStats): number {
    // Posterior win-rate mean with Beta prior
    const posteriorWinRate = (wins + BAYESIAN_ALPHA) / (total + BAYESIAN_ALPHA + BAYESIAN_BETA);

    // Use 0.5 and 0.9 as anchor points (or use population percentiles)
    const wrP50 = stats.wrP50 || 0.5;
    const wrP90 = stats.wrP90 || 0.9;
    const denominator = wrP90 - wrP50;

    if (denominator <= 0) return posteriorWinRate > wrP50 ? 1 : 0;

    return clip((posteriorWinRate - wrP50) / denominator, 0, 1);
}

/**
 * Calculate Stake Score (S) - Volume + sample size seriousness
 */
function calculateStakeScore(volume: number, trades: number, stats: PercentileStats): number {
    // Log-scale both metrics
    const sV = stats.volumeP95 > 0
        ? clip(Math.log(1 + volume) / Math.log(1 + stats.volumeP95), 0, 1)
        : 0;

    const sN = stats.tradesP95 > 0
        ? clip(Math.log(1 + trades) / Math.log(1 + stats.tradesP95), 0, 1)
        : 0;

    // Geometric mean
    return Math.sqrt(sV * sN);
}

/**
 * Calculate Freshness Score (F) - Recency decay
 */
function calculateFreshnessScore(lastActiveAt: Date): number {
    const now = new Date();
    const deltaMs = now.getTime() - lastActiveAt.getTime();
    const deltaDays = deltaMs / (1000 * 60 * 60 * 24);

    // Exponential decay with half-life
    return Math.pow(2, -deltaDays / FRESHNESS_HALF_LIFE);
}

/**
 * Calculate final Impact Factor (0-100) using weighted geometric mean
 */
function calculateImpactFactor(
    edgeScore: number,
    consistencyScore: number,
    stakeScore: number,
    freshnessScore: number
): number {
    const logSum =
        WEIGHT_EDGE * Math.log(edgeScore + EPSILON) +
        WEIGHT_CONSISTENCY * Math.log(consistencyScore + EPSILON) +
        WEIGHT_STAKE * Math.log(stakeScore + EPSILON) +
        WEIGHT_FRESHNESS * Math.log(freshnessScore + EPSILON);

    return 100 * Math.exp(logSum);
}

// ============================================================================
// Main Processing
// ============================================================================

/**
 * Process all top traders - fetch, calculate, and store
 */
async function processTopTraders() {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  📊 TOP TRADERS WORKER");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Started at: ${new Date().toISOString()}\n`);

    try {
        // Step 1: Fetch top users from subgraph
        console.log("📡 Fetching top users from Ostium subgraph...");
        const users = await fetchTopUsers(1000);
        console.log(`✅ Found ${users.length} users\n`);

        if (users.length === 0) {
            console.log("⚠️ No users found, exiting\n");
            return;
        }

        // Step 2: Fetch last trade timestamps and build trader stats
        console.log("⏰ Fetching activity timestamps for each trader...");
        const traderStats: TraderStats[] = [];
        let timestampErrors = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];

            try {
                const lastActiveAt = await fetchLastTradeTimestamp(user.id);

                if (!lastActiveAt) {
                    timestampErrors++;
                    continue;
                }

                traderStats.push({
                    walletAddress: user.id,
                    totalVolume: BigInt(user.totalVolume),
                    totalClosedVolume: BigInt(user.totalClosedVolume || user.totalVolume),
                    totalPnL: BigInt(user.totalPnL),
                    totalProfitTrades: parseInt(user.totalProfitTrades),
                    totalLossTrades: parseInt(user.totalLossTrades),
                    totalTrades: parseInt(user.totalProfitTrades) + parseInt(user.totalLossTrades),
                    lastActiveAt,
                });

                if ((i + 1) % 100 === 0) {
                    console.log(`  Processed ${i + 1}/${users.length} users...`);
                }

                await new Promise((resolve) => setTimeout(resolve, 50));
            } catch (error: any) {
                timestampErrors++;
                console.error(`  ⚠️ Error fetching timestamp for ${user.id.slice(0, 10)}...:`, error.message);
            }
        }

        console.log(`✅ Retrieved timestamps for ${traderStats.length} traders (${timestampErrors} errors)\n`);

        if (traderStats.length === 0) {
            console.log("⚠️ No valid trader data, exiting\n");
            return;
        }

        // Step 3: Calculate population percentiles for normalization
        console.log("📈 Calculating population percentiles...");
        const percentileStats = calculatePercentileStats(traderStats);
        console.log(`  ROI p50: ${percentileStats.roiP50.toFixed(4)}, p90: ${percentileStats.roiP90.toFixed(4)}`);
        console.log(`  WinRate p50: ${percentileStats.wrP50.toFixed(4)}, p90: ${percentileStats.wrP90.toFixed(4)}`);
        console.log(`  Volume p95: ${percentileStats.volumeP95.toFixed(2)}, Trades p95: ${percentileStats.tradesP95.toFixed(0)}\n`);

        // Step 4: Calculate impact factors and upsert to database
        console.log("💾 Calculating impact factors and saving to database...");
        let successCount = 0;
        let errorCount = 0;

        for (const trader of traderStats) {
            try {
                const pnl = Number(trader.totalPnL) / 1e6;
                const closedVolume = Number(trader.totalClosedVolume) / 1e6;
                const volume = Number(trader.totalVolume) / 1e6;

                // Calculate component scores
                const edgeScore = calculateEdgeScore(pnl, closedVolume, percentileStats);
                const consistencyScore = calculateConsistencyScore(
                    trader.totalProfitTrades,
                    trader.totalTrades,
                    percentileStats
                );
                const stakeScore = calculateStakeScore(volume, trader.totalTrades, percentileStats);
                const freshnessScore = calculateFreshnessScore(trader.lastActiveAt);

                // Calculate final impact factor
                const impactFactor = calculateImpactFactor(
                    edgeScore,
                    consistencyScore,
                    stakeScore,
                    freshnessScore
                );

                // Upsert to database
                await prisma.top_traders.upsert({
                    where: { wallet_address: trader.walletAddress },
                    update: {
                        total_volume: trader.totalVolume.toString(),
                        total_closed_volume: trader.totalClosedVolume.toString(),
                        total_pnl: trader.totalPnL.toString(),
                        total_profit_trades: trader.totalProfitTrades,
                        total_loss_trades: trader.totalLossTrades,
                        total_trades: trader.totalTrades,
                        last_active_at: trader.lastActiveAt,
                        edge_score: edgeScore,
                        consistency_score: consistencyScore,
                        stake_score: stakeScore,
                        freshness_score: freshnessScore,
                        impact_factor: impactFactor,
                    },
                    create: {
                        wallet_address: trader.walletAddress,
                        total_volume: trader.totalVolume.toString(),
                        total_closed_volume: trader.totalClosedVolume.toString(),
                        total_pnl: trader.totalPnL.toString(),
                        total_profit_trades: trader.totalProfitTrades,
                        total_loss_trades: trader.totalLossTrades,
                        total_trades: trader.totalTrades,
                        last_active_at: trader.lastActiveAt,
                        edge_score: edgeScore,
                        consistency_score: consistencyScore,
                        stake_score: stakeScore,
                        freshness_score: freshnessScore,
                        impact_factor: impactFactor,
                    },
                });

                successCount++;
            } catch (error: any) {
                errorCount++;
                console.error(`  ❌ Error saving trader ${trader.walletAddress.slice(0, 10)}...:`, error.message);
            }
        }

        // Step 5: Print top traders summary
        const topTraders = await prisma.top_traders.findMany({
            orderBy: { impact_factor: "desc" },
            take: 10,
        });

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🏆 TOP 10 TRADERS BY IMPACT FACTOR");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        topTraders.forEach((trader: { total_pnl: any; wallet_address: string | any[]; impact_factor: number; total_trades: any; }, idx: number) => {
            const pnl = Number(trader.total_pnl) / 1e6;
            console.log(
                `  ${idx + 1}. ${trader.wallet_address.slice(0, 10)}... | ` +
                `IF: ${trader.impact_factor.toFixed(2)} | ` +
                `PnL: $${pnl.toFixed(2)} | ` +
                `Trades: ${trader.total_trades}`
            );
        });

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📊 PROCESSING SUMMARY");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`  Total Users Fetched: ${users.length}`);
        console.log(`  Traders Processed: ${traderStats.length}`);
        console.log(`  Saved Successfully: ${successCount}`);
        console.log(`  Errors: ${errorCount + timestampErrors}`);
        console.log(`  Completed at: ${new Date().toISOString()}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } catch (error: any) {
        console.error("[TopTradersWorker] ❌ Fatal error:", error.message);
        console.error(error.stack);
    }
}

/**
 * Main worker loop
 */
async function runWorker() {
    console.log("🚀 Top Traders Worker starting...");
    console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60 / 60}h)`);
    console.log(`🌐 Subgraph URL: ${SUBGRAPH_URL}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    await processTopTraders();

    workerInterval = setInterval(async () => {
        await processTopTraders();
    }, INTERVAL);
}

registerCleanup(async () => {
    console.log("🛑 Stopping Top Traders Worker interval...");
    if (workerInterval) {
        clearInterval(workerInterval);
        workerInterval = null;
    }
});

setupGracefulShutdown("Top Traders Worker", server);
if (require.main === module) {
    runWorker().catch((error) => {
        console.error("[TopTradersWorker] ❌ Worker failed to start:", error);
        process.exit(1);
    });
}

export { processTopTraders };
