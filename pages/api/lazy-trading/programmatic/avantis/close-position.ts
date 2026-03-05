import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/avantis/close-position
 * Close a position on Avantis DEX (Base chain)
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
            tradeId,
            actualTradeIndex,
            isTestnet,
        } = req.body || {};

        if (!agentAddress || !userAddress || !market) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: agentAddress, userAddress, market",
            });
        }

        const avantisServiceUrl = process.env.AVANTIS_SERVICE_URL || "http://localhost:5004";

        const response = await fetch(`${avantisServiceUrl}/close-position`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                agentAddress,
                userAddress,
                market,
                tradeId,
                actualTradeIndex,
                isTestnet: isTestnet || false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Avantis] Close position error:", errorText);
            let serviceError = "Failed to close position on Avantis";
            try {
                const errData = JSON.parse(errorText);
                if (errData.error) serviceError = errData.error;
            } catch { }
            return res.status(response.status).json({
                success: false,
                error: serviceError,
            });
        }

        const data = await response.json();

        // Deactivate active alpha listings for this closed trade
        if (tradeId) {
            const normalizedTradeId = String(tradeId).trim();
            const tradeRefs = new Set<string>();

            if (normalizedTradeId) {
                tradeRefs.add(normalizedTradeId);
                tradeRefs.add(
                    normalizedTradeId.toUpperCase().startsWith("AVANTIS:")
                        ? normalizedTradeId
                        : `AVANTIS:${normalizedTradeId}`
                );
            }

            if (tradeRefs.size > 0) {
                await prismaClient.alpha_listings.updateMany({
                    where: {
                        trade_id: {
                            in: Array.from(tradeRefs),
                        },
                    },
                    data: { active: false },
                });
            }
        }

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Avantis close-position error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to close position",
        });
    }
}
