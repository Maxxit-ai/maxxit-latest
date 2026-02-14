import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/lunarcrush?symbol=BTC/USD
 * Returns cached LunarCrush market data for a specific symbol
 * Requires exact symbol match from ostium_available_pairs table
 * Dependencies: Must call /symbols endpoint first to get valid symbol strings
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

        const { symbol } = req.query;

        if (!symbol || typeof symbol !== "string") {
            return res.status(400).json({
                error: "symbol query parameter is required",
                example: "/api/lazy-trading/programmatic/lunarcrush?symbol=BTC/USD",
            });
        }

        // Query ostium_available_pairs for exact symbol match
        const pair = await prisma.ostium_available_pairs.findFirst({
            where: {
                symbol: symbol.toUpperCase(),
            },
        });

        if (!pair) {
            return res.status(404).json({
                error: "Symbol not found",
                message: `No data found for symbol: ${symbol}. Use /api/lazy-trading/programmatic/symbols to get available symbols.`,
            });
        }

        // Build LunarCrush data response
        const lunarcrush = {
            galaxy_score: pair.galaxy_score,
            alt_rank: pair.alt_rank,
            social_volume_24h: pair.social_volume_24h,
            sentiment: pair.sentiment,
            percent_change_24h: pair.percent_change_24h,
            volatility: pair.volatility,
            price: pair.price ? pair.price.toString() : null,
            volume_24h: pair.volume_24h ? pair.volume_24h.toString() : null,
            market_cap: pair.market_cap ? pair.market_cap.toString() : null,
            market_cap_rank: pair.market_cap_rank,
            social_dominance: pair.social_dominance,
            market_dominance: pair.market_dominance,
            interactions_24h: pair.interactions_24h,
            galaxy_score_previous: pair.galaxy_score_previous,
            alt_rank_previous: pair.alt_rank_previous,
        };

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json({
            success: true,
            symbol: pair.symbol,
            lunarcrush,
            updated_at: pair.updated_at,
        });
    } catch (error: any) {
        console.error("[API /lazy-trading/programmatic/lunarcrush] Error:", error.message);
        return res.status(500).json({
            error: "Failed to fetch LunarCrush data",
            message: error.message,
        });
    }
}
