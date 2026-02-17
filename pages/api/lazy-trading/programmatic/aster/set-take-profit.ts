import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/aster/set-take-profit
 * Set take profit on an existing Aster DEX position
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

        const {
            userAddress,
            symbol,
            market,
            stopPrice,
            takeProfitPercent,
            entryPrice,
            side,
        } = req.body || {};

        const token = symbol || market;

        if (!userAddress || !token) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: userAddress, symbol",
            });
        }

        if (!stopPrice && !takeProfitPercent) {
            return res.status(400).json({
                success: false,
                error: "stopPrice or takeProfitPercent is required",
            });
        }

        const asterServiceUrl = process.env.ASTER_SERVICE_URL || "http://localhost:5003";

        const response = await fetch(`${asterServiceUrl}/set-take-profit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userAddress,
                symbol: token,
                stopPrice,
                takeProfitPercent,
                entryPrice,
                side,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Aster] Set take profit error:", errorText);
            return res.status(response.status).json({
                success: false,
                error: "Failed to set take profit on Aster",
            });
        }

        const data = await response.json();

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Aster set-take-profit error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to set take profit",
        });
    }
}
