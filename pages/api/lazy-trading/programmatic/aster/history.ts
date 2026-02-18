import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/aster/history
 * Get full order history on Aster DEX (BNB Chain)
 * Proxies to Aster service /all-orders.
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

        const { userAddress, address, symbol, market, limit } = req.body || {};
        const wallet = userAddress || address;
        const token = symbol || market;

        if (!wallet || !token) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: userAddress, symbol",
            });
        }

        const asterServiceUrl = process.env.ASTER_SERVICE_URL || "http://localhost:5003";

        const response = await fetch(`${asterServiceUrl}/all-orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userAddress: wallet,
                symbol: token,
                limit,
                orderId: req.body?.orderId,
                startTime: req.body?.startTime,
                endTime: req.body?.endTime,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Aster] History (all-orders) fetch error:", errorText);
            return res.status(response.status).json({
                success: false,
                error: "Failed to fetch order history from Aster service",
            });
        }

        const data = await response.json();

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Aster history (all-orders) error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch order history",
        });
    }
}
