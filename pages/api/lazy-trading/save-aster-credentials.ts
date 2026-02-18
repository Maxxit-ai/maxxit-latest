import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/save-aster-credentials
 * Toggle aster_enabled flag for a user's agent wallet.
 * Aster v3 reuses the Ostium agent — no separate credentials needed.
 * The user just needs to authorize their agent address on Aster's API wallet page.
 * 
 * Body: { userWallet: string, enabled: boolean }
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    try {
        const { userWallet, enabled } = req.body;

        if (!userWallet || typeof enabled !== "boolean") {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: userWallet, enabled (boolean)",
            });
        }

        const wallet = userWallet.toLowerCase();

        // Verify the user has an agent address first
        const existing = await prismaClient.user_agent_addresses.findUnique({
            where: { user_wallet: wallet },
            select: { ostium_agent_address: true },
        });

        if (!existing?.ostium_agent_address) {
            return res.status(400).json({
                success: false,
                error: "No agent wallet found. Please complete the Ostium setup first to create an agent wallet.",
            });
        }

        if (enabled) {
            const asterServiceUrl = process.env.ASTER_SERVICE_URL || "http://localhost:5003";
            const verifyResponse = await fetch(`${asterServiceUrl}/balance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress: wallet }),
            });

            if (!verifyResponse.ok) {
                let verifyError = "Aster verification failed";
                try {
                    const verifyData = await verifyResponse.json();
                    verifyError = verifyData?.error || verifyData?.msg || verifyError;
                } catch {
                    const verifyText = await verifyResponse.text();
                    if (verifyText) verifyError = verifyText;
                }

                return res.status(400).json({
                    success: false,
                    error: `Unable to verify your agent wallet on Aster. Please authorize your agent address on Aster API Wallet first. (${verifyError})`,
                });
            }
        }

        // Update the aster_enabled flag
        await prismaClient.user_agent_addresses.update({
            where: { user_wallet: wallet },
            data: { aster_enabled: enabled },
        });

        return res.status(200).json({
            success: true,
            message: enabled
                ? "Aster DEX enabled for your agent wallet"
                : "Aster DEX disabled for your agent wallet",
            agentAddress: existing.ostium_agent_address,
        });
    } catch (error: any) {
        console.error("[API] Toggle Aster enabled error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to update Aster configuration",
        });
    }
}
