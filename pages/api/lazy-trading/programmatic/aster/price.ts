import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/aster/price
 * Get current price for a token on Aster DEX
 * Required query param: ?token=BTC
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

        const token = req.query.token as string;
        if (!token) {
            return res.status(400).json({ success: false, error: "token query param is required" });
        }

        const asterServiceUrl = process.env.ASTER_SERVICE_URL || "http://localhost:5003";

        const response = await fetch(`${asterServiceUrl}/price?token=${encodeURIComponent(token)}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Aster] Price fetch error:", errorText);
            return res.status(500).json({
                success: false,
                error: "Failed to fetch price from Aster service",
            });
        }

        const data = await response.json();

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Aster price error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch price",
        });
    }
}
