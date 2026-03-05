import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/avantis/symbols
 * Returns available trading pairs from Avantis DEX (Base chain)
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

        const avantisServiceUrl = process.env.AVANTIS_SERVICE_URL || "http://localhost:5004";

        const response = await fetch(`${avantisServiceUrl}/markets`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Avantis] Markets fetch error:", errorText);
            return res.status(500).json({
                success: false,
                error: "Failed to fetch markets from Avantis service",
            });
        }

        const data = await response.json();

        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error("[API] Avantis symbols error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch symbols",
        });
    }
}
