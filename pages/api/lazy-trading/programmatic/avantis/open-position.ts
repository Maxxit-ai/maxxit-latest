import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/avantis/open-position
 * Open a perpetual position on Avantis DEX (Base chain)
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
            market,
            side,
            collateral,
            leverage,
            takeProfitPercent,
            stopLossPercent,
            isTestnet,
        } = req.body || {};

        if (!agentAddress || !userAddress || !market || !side || !collateral) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: agentAddress, userAddress, market, side, collateral",
            });
        }

        const avantisServiceUrl = process.env.AVANTIS_SERVICE_URL || "http://localhost:5004";

        const response = await fetch(`${avantisServiceUrl}/open-position`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                agentAddress,
                userAddress,
                market,
                side,
                collateral,
                leverage: leverage || 10,
                takeProfitPercent,
                stopLossPercent,
                isTestnet: isTestnet || false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Avantis] Open position error:", errorText);
            let serviceError = "Failed to open position on Avantis";
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
        console.error("[API] Avantis open-position error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to open position",
        });
    }
}
