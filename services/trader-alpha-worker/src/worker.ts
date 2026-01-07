/**
 * Trader Alpha Worker
 * 
 * Fetches trades from tracked traders (for copy-trading / Alpha Clubs).
 * Polls the Ostium subgraph for new trades from traders linked to agents,
 * filters by the agent's token_filters, and stores them in trader_trades.
 * 
 * The signal-generator-worker then processes these trades to create signals
 * for all deployments of the agent (club members).
 * 
 * Interval: 1 minute (configurable via WORKER_INTERVAL)
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

const PORT = process.env.PORT || 5016;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "60000"); // 1 minute default
const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmgql529ykrlw01v6b9so0woq/subgraphs/ost-prod/v8/gn";

// Lookback window for fetching trades (in seconds)
const TRADE_LOOKBACK_SECONDS = parseInt(process.env.TRADE_LOOKBACK_SECONDS || "300"); // 5 minutes

let workerInterval: NodeJS.Timeout | null = null;

const app = express();
app.get(
    "/health",
    createHealthCheckHandler("trader-alpha-worker", async () => {
        return {
            interval: INTERVAL,
            isRunning: workerInterval !== null,
            subgraphUrl: SUBGRAPH_URL,
            lookbackSeconds: TRADE_LOOKBACK_SECONDS,
        };
    })
);

const server = app.listen(PORT, () => {
    console.log(`🏥 Trader Alpha Worker health check on port ${PORT}`);
});

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
 * Fetch recent trades for a list of trader addresses
 */
async function fetchRecentTrades(
    traderAddresses: string[],
    sinceTimestamp: number
): Promise<SubgraphTrade[]> {
    if (traderAddresses.length === 0) return [];

    // Format addresses as lowercase for subgraph query
    const formattedAddresses = traderAddresses.map(addr => addr.toLowerCase());

    const query = `
    query GetRecentTrades($traders: [String!]!, $since: BigInt!) {
      trades(
        where: { 
          trader_in: $traders,
          timestamp_gte: $since
        }
        orderBy: timestamp
        orderDirection: desc
        first: 100
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
                    traders: formattedAddresses,
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
        console.error("  ❌ Error fetching trades from subgraph:", error.message);
        return [];
    }
}

/**
 * Get symbol from pair index using the ostium_available_pairs table
 */
async function getSymbolFromPairIndex(pairIndex: number): Promise<string | null> {
    const pair = await prisma.ostium_available_pairs.findUnique({
        where: { id: pairIndex },
        select: { symbol: true },
    });
    return pair?.symbol || null;
}

// ============================================================================
// Main Processing
// ============================================================================

/**
 * Process all copy-trade agents and fetch trades from their tracked traders
 */
async function processTrackedTraders() {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  📊 TRADER ALPHA WORKER");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Started at: ${new Date().toISOString()}\n`);

    try {
        // Step 1: Get all agents that are copy-trade clubs with active tracked traders
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

        console.log(`📡 Found ${copyTradeAgents.length} copy-trade agent(s)\n`);

        if (copyTradeAgents.length === 0) {
            console.log("✅ No copy-trade agents to process\n");
            return;
        }

        // Step 2: Build a map of trader -> agents tracking them
        const traderToAgents = new Map<string, TrackedTrader[]>();

        for (const agent of copyTradeAgents) {
            for (const tt of agent.agent_top_traders) {
                const walletLower = tt.top_traders.wallet_address.toLowerCase();
                if (!traderToAgents.has(walletLower)) {
                    traderToAgents.set(walletLower, []);
                }
                traderToAgents.get(walletLower)!.push({
                    trader_wallet: tt.top_traders.wallet_address,
                    agent_id: agent.id,
                    token_filters: agent.token_filters || [],
                });
            }
        }

        const uniqueTraders = Array.from(traderToAgents.keys());
        console.log(`👥 Tracking ${uniqueTraders.length} unique trader(s)\n`);

        // Step 3: Fetch recent trades from subgraph
        const sinceTimestamp = Math.floor(Date.now() / 1000) - TRADE_LOOKBACK_SECONDS;
        console.log(`⏰ Fetching trades since ${new Date(sinceTimestamp * 1000).toISOString()}`);

        const trades = await fetchRecentTrades(uniqueTraders, sinceTimestamp);
        console.log(`✅ Found ${trades.length} recent trade(s)\n`);

        if (trades.length === 0) {
            console.log("✅ No new trades to process\n");
            return;
        }

        // Step 4: Process each trade
        let newTradesStored = 0;
        let duplicatesSkipped = 0;
        let filteredOut = 0;

        for (const trade of trades) {
            const traderLower = trade.trader.toLowerCase();
            const trackingAgents = traderToAgents.get(traderLower) || [];

            if (trackingAgents.length === 0) {
                continue; // Not tracked (shouldn't happen)
            }

            // Get symbol from pair
            const symbol = trade.pair?.from;

            if (!symbol) {
                console.log(`  ⚠️ Could not determine symbol for trade ${trade.id}`);
                continue;
            }

            // Normalize symbol (remove any trailing "/" like "BTC/" -> "BTC")
            const normalizedSymbol = symbol.replace(/\/$/, "").toUpperCase();

            // For each agent tracking this trader
            for (const tracker of trackingAgents) {
                // Check token filters
                if (tracker.token_filters.length > 0) {
                    const matchesFilter = tracker.token_filters.some(
                        filter => normalizedSymbol.startsWith(filter.toUpperCase())
                    );
                    if (!matchesFilter) {
                        filteredOut++;
                        continue; // Token doesn't match agent's filters
                    }
                }

                // Check if already stored
                const sourceTradeId = `${trade.id}-${tracker.agent_id}`;
                const existing = await prisma.trader_trades.findUnique({
                    where: { source_trade_id: sourceTradeId },
                });

                if (existing) {
                    duplicatesSkipped++;
                    continue;
                }

                // Store the trade
                try {
                    const takeProfitPrice = (trade as any).takeProfitPrice
                        ? Number((trade as any).takeProfitPrice) / 1e18
                        : null;
                    const stopLossPrice = (trade as any).stopLossPrice
                        ? Number((trade as any).stopLossPrice) / 1e18
                        : null;

                    await prisma.trader_trades.create({
                        data: {
                            source_trade_id: sourceTradeId,
                            trader_wallet: trade.trader,
                            agent_id: tracker.agent_id,
                            token_symbol: normalizedSymbol,
                            side: trade.isBuy ? "LONG" : "SHORT",
                            collateral: (Number(trade.collateral) / 1e6).toString(), // Ostium uses 6 decimals for USDC
                            leverage: parseFloat(trade.leverage) / 100, // Ostium stores leverage as integer (e.g., 1000 = 10x)
                            entry_price: (Number(trade.openPrice) / 1e18).toString(), // Ostium uses 18 decimals for price
                            take_profit_price: takeProfitPrice?.toString() || null,
                            stop_loss_price: stopLossPrice?.toString() || null,
                            is_open: true,
                            processed_for_signals: false,
                            trade_timestamp: new Date(parseInt(trade.timestamp) * 1000),
                        },
                    });
                    newTradesStored++;
                    console.log(`  ✅ Stored trade: ${trade.isBuy ? "LONG" : "SHORT"} ${normalizedSymbol} from ${trade.trader.slice(0, 10)}... (TP: ${takeProfitPrice?.toFixed(2) || 'N/A'}, SL: ${stopLossPrice?.toFixed(2) || 'N/A'})`);
                } catch (err: any) {
                    if (err.code === "P2002") {
                        duplicatesSkipped++;
                    } else {
                        console.error(`  ❌ Error storing trade:`, err.message);
                    }
                }
            }
        }

        // Step 5: Summary
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📊 PROCESSING SUMMARY");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`  Copy-Trade Agents: ${copyTradeAgents.length}`);
        console.log(`  Unique Traders: ${uniqueTraders.length}`);
        console.log(`  Trades Found: ${trades.length}`);
        console.log(`  New Trades Stored: ${newTradesStored}`);
        console.log(`  Duplicates Skipped: ${duplicatesSkipped}`);
        console.log(`  Filtered Out: ${filteredOut}`);
        console.log(`  Completed at: ${new Date().toISOString()}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } catch (error: any) {
        console.error("[TraderAlphaWorker] ❌ Fatal error:", error.message);
        console.error(error.stack);
    }
}

/**
 * Main worker loop
 */
async function runWorker() {
    console.log("🚀 Trader Alpha Worker starting...");
    console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000}s)`);
    console.log(`🌐 Subgraph URL: ${SUBGRAPH_URL}`);
    console.log(`⏪ Lookback: ${TRADE_LOOKBACK_SECONDS}s`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Run immediately on startup
    await processTrackedTraders();

    // Then run on interval
    workerInterval = setInterval(async () => {
        await processTrackedTraders();
    }, INTERVAL);
}

registerCleanup(async () => {
    console.log("🛑 Stopping Trader Alpha Worker interval...");
    if (workerInterval) {
        clearInterval(workerInterval);
        workerInterval = null;
    }
});

setupGracefulShutdown("Trader Alpha Worker", server);

if (require.main === module) {
    runWorker().catch((error) => {
        console.error("[TraderAlphaWorker] ❌ Worker failed to start:", error);
        process.exit(1);
    });
}

export { processTrackedTraders };
