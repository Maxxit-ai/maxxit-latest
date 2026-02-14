import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/symbols
 * Returns all available trading symbols from ostium_available_pairs table
 * Authenticated endpoint for AI agents to discover tradable symbols
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
            select: {
                id: true,
                symbol: true,
                group: true,
                max_leverage: true,
            },
            orderBy: [
                { group: "asc" },
                { symbol: "asc" },
            ],
        });

        const symbols = pairs.map((pair) => {
            return {
                id: pair.id,
                symbol: pair.symbol,
                group: pair.group || "Other",
                maxLeverage: pair.max_leverage,
            };
        });

        // Group symbols by category for easier AI parsing
        const groupedSymbols: Record<string, typeof symbols> = {};
        for (const symbol of symbols) {
            if (!groupedSymbols[symbol.group]) {
                groupedSymbols[symbol.group] = [];
            }
            groupedSymbols[symbol.group].push(symbol);
        }

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json({
            success: true,
            symbols,
            groupedSymbols,
            count: symbols.length,
        });
    } catch (error: any) {
        console.error("[API /lazy-trading/programmatic/symbols] Error:", error.message);
        return res.status(500).json({
            error: "Failed to fetch available symbols",
            message: error.message,
        });
    }
}
