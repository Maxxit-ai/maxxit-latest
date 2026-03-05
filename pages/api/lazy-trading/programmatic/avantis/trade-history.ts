import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/avantis/trade-history
 * Get trade history for an Avantis user via on-chain event logs
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
            agentAddress,
            userAddress,
            limit,
            isTestnet,
        } = req.body || {};

        if (!userAddress && !agentAddress) {
            return res.status(400).json({
                success: false,
                error: "Must provide userAddress or agentAddress",
            });
        }

        const avantisServiceUrl = process.env.AVANTIS_SERVICE_URL || "http://localhost:5004";

        const response = await fetch(`${avantisServiceUrl}/trade-history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                agentAddress,
                userAddress,
                limit: limit || 50,
                isTestnet: isTestnet || false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Avantis] Trade history error:", errorText);
            let serviceError = "Failed to fetch trade history from Avantis";
            try {
                const errData = JSON.parse(errorText);
                if (errData.error) serviceError = errData.error;
            } catch { /* use default */ }
            return res.status(response.status).json({
                success: false,
                error: serviceError,
            });
        }

        const data = await response.json();

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Avantis trade-history error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch trade history",
        });
    }
}
