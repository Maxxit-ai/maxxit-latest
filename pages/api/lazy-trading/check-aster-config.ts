import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/check-aster-config?userWallet=0x123
 * Check if user has agent wallet configured (reuses Ostium agent).
 * The user must also authorize the agent address on Aster's API wallet page.
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    try {
        const { userWallet } = req.query;

        if (!userWallet || typeof userWallet !== "string") {
            return res.status(400).json({
                success: false,
                error: "Missing userWallet parameter",
            });
        }

        const userAgentAddress = await prismaClient.user_agent_addresses.findUnique({
            where: { user_wallet: (userWallet as string).toLowerCase() },
            select: {
                ostium_agent_address: true,
                ostium_agent_key_encrypted: true,
                aster_enabled: true,
            },
        });

        // Agent wallet exists and has a private key
        const hasAgent = !!(userAgentAddress?.ostium_agent_address && userAgentAddress?.ostium_agent_key_encrypted);
        // Aster specifically enabled by user
        const asterEnabled = !!(hasAgent && userAgentAddress?.aster_enabled);

        return res.status(200).json({
            success: true,
            configured: hasAgent,
            asterEnabled,
            agentAddress: hasAgent ? userAgentAddress?.ostium_agent_address : null,
        });
    } catch (error: any) {
        console.error("[API] Check Aster config error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to check Aster configuration",
        });
    }
}
