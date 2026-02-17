import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/aster/change-leverage
 * Change leverage for a symbol on Aster DEX
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    try {
        const apiKeyRecord = await resolveLazyTradingApiKey(req);
        if (!apiKeyRecord) {
            return res.status(401).json({ success: false, error: "Invalid API key" });
        }

        const { userAddress, symbol, market, leverage } = req.body || {};
        const token = symbol || market;

        if (!userAddress || !token || !leverage) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: userAddress, symbol, leverage",
            });
        }

        const asterServiceUrl = process.env.ASTER_SERVICE_URL || "http://localhost:5003";

        const response = await fetch(`${asterServiceUrl}/change-leverage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userAddress,
                symbol: token,
                leverage,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Aster] Change leverage error:", errorText);
            return res.status(response.status).json({
                success: false,
                error: "Failed to change leverage on Aster",
            });
        }

        const data = await response.json();

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Aster change-leverage error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to change leverage",
        });
    }
}
