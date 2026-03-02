import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/avantis/positions
 * Get open positions on Avantis DEX (Base chain)
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

        const { userAddress, address, agentAddress } = req.body || {};
        const wallet = userAddress || address;

        if (!wallet) {
            return res.status(400).json({ success: false, error: "userAddress is required" });
        }

        const avantisServiceUrl = process.env.AVANTIS_SERVICE_URL || "http://localhost:5004";

        const response = await fetch(`${avantisServiceUrl}/positions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: wallet, agentAddress }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Avantis] Positions fetch error:", errorText);
            let serviceError = "Failed to fetch positions from Avantis service";
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

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Avantis positions error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch positions",
        });
    }
}
