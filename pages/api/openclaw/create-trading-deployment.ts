/**
 * Create a default trading deployment for OpenClaw
 * POST /api/openclaw/create-trading-deployment
 * Body: { agentId: string, userWallet: string }
 *
 * Creates a deployment with default trading preferences (all weights at 50).
 * Called after the user has completed delegation and USDC allowance.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { agentId, userWallet } = req.body;

        if (!agentId || !userWallet) {
            return res
                .status(400)
                .json({ error: "Missing required fields: agentId, userWallet" });
        }

        const normalizedWallet = userWallet.toLowerCase();

        // Verify agent exists and belongs to this user
        const agent = await prisma.agents.findFirst({
            where: {
                id: agentId,
                creator_wallet: normalizedWallet,
            },
        });

        if (!agent) {
            return res.status(404).json({ error: "Agent not found or not owned by user" });
        }

        // Verify user has an Ostium agent address
        const userAddress = await prisma.user_agent_addresses.findUnique({
            where: { user_wallet: normalizedWallet },
            select: { ostium_agent_address: true },
        });

        if (!userAddress || !userAddress.ostium_agent_address) {
            return res.status(400).json({
                error: "Ostium agent address not found. Please create agent first.",
            });
        }

        // Check for existing deployment
        const existingDeployment = await prisma.agent_deployments.findFirst({
            where: {
                agent_id: agentId,
                user_wallet: normalizedWallet,
            },
        });

        if (existingDeployment) {
            // Update existing deployment to active
            const updated = await prisma.agent_deployments.update({
                where: { id: existingDeployment.id },
                data: {
                    status: "ACTIVE",
                    sub_active: true,
                    module_enabled: true,
                },
            });

            console.log(
                `[OpenClaw] Updated existing deployment ${updated.id} for agent ${agentId}`
            );

            return res.status(200).json({
                success: true,
                deployment: {
                    id: updated.id,
                    agentId: updated.agent_id,
                    userWallet: updated.user_wallet,
                    agentAddress: userAddress.ostium_agent_address,
                    status: updated.status,
                },
                message: "Deployment updated",
            });
        }

        // Create new deployment with default preferences (all at 50)
        const deployment = await prisma.agent_deployments.create({
            data: {
                agent_id: agentId,
                user_wallet: normalizedWallet,
                safe_wallet: normalizedWallet,
                enabled_venues: ["OSTIUM"],
                status: "ACTIVE",
                sub_active: true,
                module_enabled: true,
                is_testnet: false,
                risk_tolerance: 50,
                trade_frequency: 50,
                social_sentiment_weight: 50,
                price_momentum_focus: 50,
                market_rank_priority: 50,
            },
        });

        console.log(
            `[OpenClaw] ✅ Created deployment ${deployment.id} for agent ${agentId}`
        );

        return res.status(201).json({
            success: true,
            deployment: {
                id: deployment.id,
                agentId: deployment.agent_id,
                userWallet: deployment.user_wallet,
                agentAddress: userAddress.ostium_agent_address,
                status: deployment.status,
            },
            message: "Deployment created with default preferences",
        });
    } catch (error: any) {
        console.error("[OpenClaw] Create trading deployment error:", error);
        return res.status(500).json({
            error: "Failed to create deployment",
            message: error.message,
        });
    }
}
