import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/market-data
 * Returns complete market snapshot from ostium_available_pairs table
 * Includes symbols, leverage, and all cached LunarCrush metrics
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

        const pairs = await prisma.ostium_available_pairs.findMany({
            orderBy: [
                { group: "asc" },
                { symbol: "asc" },
            ],
        });

        const marketData = pairs.map((pair) => {
            return {
                id: pair.id,
                symbol: pair.symbol,
                group: pair.group || "Other",
                maxLeverage: pair.max_leverage,
                metrics: {
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
                },
                updated_at: pair.updated_at,
            };
        });

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json({
            success: true,
            data: marketData,
            count: marketData.length,
        });
    } catch (error: any) {
        console.error("[API /lazy-trading/programmatic/market-data] Error:", error.message);
        return res.status(500).json({
            error: "Failed to fetch market data",
            message: error.message,
        });
    }
}
