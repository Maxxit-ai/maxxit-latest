import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

const SUBGRAPH_URL =
    "https://api.subgraph.ormilabs.com/api/public/67a599d5-c8d2-4cc4-9c4d-2975a97bc5d8/subgraphs/ost-prod/live/gn";

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

// ============================================================================
// Subgraph Query
// ============================================================================

async function fetchTradesFromSubgraph(
    traderAddress: string,
    sinceTimestamp: number,
    limit: number
): Promise<SubgraphTrade[]> {
    const query = `
    query GetTraderTrades($trader: String!, $since: BigInt!, $first: Int!) {
      trades(
        where: {
          trader: $trader,
          timestamp_gte: $since
        }
        orderBy: timestamp
        orderDirection: desc
        first: $first
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

    const response = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query,
            variables: {
                trader: traderAddress.toLowerCase(),
                since: sinceTimestamp.toString(),
                first: limit,
            },
        }),
    });

    const result = (await response.json()) as {
        data?: { trades: SubgraphTrade[] };
        errors?: any[];
    };

    if (result.errors) {
        console.error(
            "[copy-trader-trades] Subgraph errors:",
            result.errors
        );
        throw new Error("Subgraph query failed");
    }

    return result.data?.trades || [];
}

// ============================================================================
// Symbol Resolution
// ============================================================================

/**
 * Build a lookup map of pair index -> symbol from ostium_available_pairs
 */
async function buildPairSymbolMap(): Promise<Map<string, string>> {
    const pairs = await prisma.ostium_available_pairs.findMany({
        select: { id: true, symbol: true },
    });
    const map = new Map<string, string>();
    for (const pair of pairs) {
        map.set(pair.id.toString(), pair.symbol);
    }
    return map;
}

/**
 * GET /api/lazy-trading/programmatic/copy-trader-trades
 *
 * Fetch recent on-chain trades for a specific trader address from the
 * Ostium subgraph. Returns decoded trade data (side, token, collateral,
 * leverage, entry price, TP/SL, timestamp).
 *
 * Query params:
 *   address  — (required) trader wallet address to fetch trades for
 *   limit    — max trades to return (default: 20, max: 50)
 *   hours    — lookback window in hours (default: 24, max: 168 / 7 days)
 *
 * Dependency: The `address` param should come from the GET /copy-traders
 * endpoint response (either `creatorWallet` from openclawTraders or
 * `walletAddress` from topTraders).
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const apiKeyRecord = await resolveLazyTradingApiKey(req);
        if (!apiKeyRecord) {
            return res.status(401).json({ error: "Invalid API key" });
        }

        // Parse query params
        const address = req.query.address as string;
        if (!address) {
            return res.status(400).json({
                error: "Missing required parameter: address",
                hint: "First call GET /api/lazy-trading/programmatic/copy-traders to discover trader addresses, then use the creatorWallet or walletAddress from the response.",
            });
        }

        // Validate address format (basic check)
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return res.status(400).json({
                error: "Invalid address format. Must be a valid Ethereum address (0x...)",
            });
        }

        const limit = Math.min(
            Math.max(parseInt(req.query.limit as string) || 20, 1),
            50
        );
        const hours = Math.min(
            Math.max(parseInt(req.query.hours as string) || 24, 1),
            168
        );

        // Calculate lookback timestamp
        const sinceTimestamp = Math.floor(Date.now() / 1000) - hours * 3600;

        // Fetch trades from subgraph
        const subgraphTrades = await fetchTradesFromSubgraph(
            address,
            sinceTimestamp,
            limit
        );

        // Build pair symbol map for resolution
        const pairSymbolMap = await buildPairSymbolMap();

        // Decode and format trades
        const trades = subgraphTrades.map((trade) => {
            // Resolve symbol from pair
            const pairFrom = trade.pair?.from || "";
            const normalizedSymbol = pairFrom.replace(/\/$/, "").toUpperCase();
            const pairTo = trade.pair?.to || "USD";
            const pairLabel = `${normalizedSymbol}/${pairTo.toUpperCase()}`;

            // Decode Ostium values (same logic as trader-alpha-worker):
            //   collateral: 6 decimals (USDC)
            //   leverage: integer / 100 (e.g., 1000 = 10x)
            //   openPrice: 18 decimals
            //   takeProfitPrice/stopLossPrice: 18 decimals
            const collateral = Number(trade.collateral) / 1e6;
            const leverage = parseFloat(trade.leverage) / 100;
            const entryPrice = Number(trade.openPrice) / 1e18;
            const takeProfitPrice = trade.takeProfitPrice
                ? Number(trade.takeProfitPrice) / 1e18
                : null;
            const stopLossPrice = trade.stopLossPrice
                ? Number(trade.stopLossPrice) / 1e18
                : null;

            return {
                tradeId: trade.id,
                side: trade.isBuy ? "LONG" : "SHORT",
                tokenSymbol: normalizedSymbol,
                pair: pairLabel,
                collateral: Math.round(collateral * 100) / 100,
                leverage: Math.round(leverage * 10) / 10,
                entryPrice: Math.round(entryPrice * 100) / 100,
                takeProfitPrice: takeProfitPrice
                    ? Math.round(takeProfitPrice * 100) / 100
                    : null,
                stopLossPrice: stopLossPrice
                    ? Math.round(stopLossPrice * 100) / 100
                    : null,
                timestamp: new Date(
                    parseInt(trade.timestamp) * 1000
                ).toISOString(),
            };
        });

        // Track API key usage
        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json({
            success: true,
            traderAddress: address,
            trades,
            count: trades.length,
            lookbackHours: hours,
        });
    } catch (error: any) {
        console.error(
            "[API /lazy-trading/programmatic/copy-trader-trades] Error:",
            error.message
        );
        return res.status(500).json({
            error: "Failed to fetch trader trades",
            message: error.message,
        });
    }
}
