import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/aster/market-data
 * Get 24hr ticker data from Aster DEX (BNB Chain)
 * Optional query param: ?symbol=BTC
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    try {
        const apiKeyRecord = await resolveLazyTradingApiKey(req);
        if (!apiKeyRecord) {
            return res.status(401).json({ success: false, error: "Invalid API key" });
        }

        const asterServiceUrl = process.env.ASTER_SERVICE_URL || "http://localhost:5003";
        const symbol = req.query.symbol as string | undefined;

        const url = new URL(`${asterServiceUrl}/market-data`);
        if (symbol) {
            url.searchParams.set("symbol", symbol);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Aster] Market data fetch error:", errorText);
            return res.status(500).json({
                success: false,
                error: "Failed to fetch market data from Aster service",
            });
        }

        const data = await response.json();

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Aster market-data error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch market data",
        });
    }
}
