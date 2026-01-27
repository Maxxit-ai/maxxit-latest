import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

/**
 * Check if a user has completed lazy trading setup
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { userWallet } = req.query;

        if (!userWallet || typeof userWallet !== "string") {
            return res.status(400).json({ error: "userWallet is required" });
        }

        const normalizedWallet = userWallet.toLowerCase();

        // Find existing lazy trading agent for this wallet
        const existingAgent = await prisma.agents.findFirst({
            where: {
                creator_wallet: normalizedWallet,
                name: { startsWith: "Lazy Trader -" },
            },
            select: {
                id: true,
                name: true,
                venue: true,
                status: true,
                agent_telegram_users: {
                    select: {
                        telegram_alpha_users: {
                            select: {
                                id: true,
                                telegram_user_id: true,
                                telegram_username: true,
                                first_name: true,
                                last_name: true,
                            },
                        },
                    },
                },
            },
        });

        // If no agent exists, setup is not complete
        if (!existingAgent) {
            return res.status(200).json({
                success: true,
                isSetupComplete: false,
            });
        }

        // Check if telegram user is linked
        const telegramUser =
            existingAgent.agent_telegram_users.length > 0
                ? existingAgent.agent_telegram_users[0].telegram_alpha_users
                : null;

        if (!telegramUser) {
            return res.status(200).json({
                success: true,
                isSetupComplete: false,
            });
        }

        // Get deployment
        const deployment = await prisma.agent_deployments.findFirst({
            where: {
                agent_id: existingAgent.id,
                user_wallet: normalizedWallet,
            },
            select: {
                id: true,
                status: true,
                is_testnet: true,
                risk_tolerance: true,
                trade_frequency: true,
                social_sentiment_weight: true,
                price_momentum_focus: true,
                market_rank_priority: true,
            },
            orderBy: {
                sub_started_at: "desc",
            },
        });

        if (!deployment) {
            return res.status(200).json({
                success: true,
                isSetupComplete: false,
            });
        }

        // Get agent address
        const userAgentAddress = await prisma.user_agent_addresses.findUnique({
            where: { user_wallet: normalizedWallet },
            select: {
                ostium_agent_address: true,
                hyperliquid_agent_address: true,
            },
        });

        // Setup is complete - return full details
        return res.status(200).json({
            success: true,
            isSetupComplete: true,
            agent: {
                id: existingAgent.id,
                name: existingAgent.name,
                venue: existingAgent.venue,
            },
            deployment: {
                id: deployment.id,
                status: deployment.status,
                isTestnet: deployment.is_testnet,  // Include testnet flag in response
            },
            telegramUser: {
                id: telegramUser.id,
                telegram_user_id: telegramUser.telegram_user_id,
                telegram_username: telegramUser.telegram_username,
            },
            ostiumAgentAddress: userAgentAddress?.ostium_agent_address || null,
            tradingPreferences: {
                risk_tolerance: deployment.risk_tolerance,
                trade_frequency: deployment.trade_frequency,
                social_sentiment_weight: deployment.social_sentiment_weight,
                price_momentum_focus: deployment.price_momentum_focus,
                market_rank_priority: deployment.market_rank_priority,
            },
        });
    } catch (error: any) {
        console.error("[API] Check lazy trading setup error:", error);
        return res.status(500).json({
            error: "Failed to check setup status",
            message: error.message,
        });
    }
}
