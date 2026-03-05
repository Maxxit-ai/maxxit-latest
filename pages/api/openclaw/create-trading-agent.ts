/**
 * Create a trading agent for OpenClaw (no Telegram required)
 * POST /api/openclaw/create-trading-agent
 * Body: {
 *   userWallet: string,
 *   venue?: "OSTIUM" | "AVANTIS",
 *   enabledVenues?: string[],
 *   checkOnly?: boolean
 * }
 *
 * Creates an agent and generates a shared trading agent address.
 * If checkOnly=true, only checks for an existing OpenClaw trading agent
 * and returns current state without creating anything.
 * Does NOT create a deployment — that happens after delegation + approval.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { getOrCreateOstiumAgentAddress } from "../../../lib/deployment-agent-address";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { userWallet, venue, enabledVenues, checkOnly } = req.body || {};

        if (!userWallet || typeof userWallet !== "string") {
            return res.status(400).json({ error: "userWallet is required" });
        }

        const normalizedWallet = userWallet.toLowerCase();
        const requestedVenueList = Array.from(
            new Set(
                [
                    ...(Array.isArray(enabledVenues) ? enabledVenues : []),
                    ...(typeof venue === "string" ? [venue] : []),
                ]
                    .map((v) => String(v || "").trim().toUpperCase())
                    .filter((v) => v === "OSTIUM" || v === "AVANTIS")
            )
        );
        const requestedVenues =
            requestedVenueList.length > 0 ? requestedVenueList : ["OSTIUM"];

        // Check if user already has a trading agent created from OpenClaw
        const existingAgent = await prisma.agents.findFirst({
            where: {
                creator_wallet: normalizedWallet,
                name: { startsWith: "OpenClaw Trader" },
            },
            include: {
                agent_deployments: {
                    where: { status: "ACTIVE" },
                    select: {
                        id: true,
                        status: true,
                        enabled_venues: true,
                    },
                },
            },
        });

        const existingAddresses = await prisma.user_agent_addresses.findUnique({
            where: { user_wallet: normalizedWallet },
            select: {
                ostium_agent_address: true,
            },
        });

        if (existingAgent) {
            console.log(
                `[OpenClaw] Existing agent found for ${normalizedWallet}: ${existingAgent.id}`
            );
            let sharedAgentAddress = existingAddresses?.ostium_agent_address || null;
            if (!sharedAgentAddress && !checkOnly) {
                const agentAddressResult = await getOrCreateOstiumAgentAddress({
                    userWallet: normalizedWallet,
                });
                sharedAgentAddress = agentAddressResult.address;
            }
            const matchingDeployment = existingAgent.agent_deployments.find((d) =>
                requestedVenues.every((v) => d.enabled_venues?.includes(v))
            );
            return res.status(200).json({
                success: true,
                alreadyExists: true,
                agent: {
                    id: existingAgent.id,
                    name: existingAgent.name,
                    venue: existingAgent.venue,
                    status: existingAgent.status,
                },
                ostiumAgentAddress: sharedAgentAddress,
                avantisAgentAddress: sharedAgentAddress,
                deployment: matchingDeployment || existingAgent.agent_deployments[0] || null,
                hasDeployment: !!matchingDeployment,
                requestedVenues,
            });
        }

        if (checkOnly) {
            return res.status(200).json({
                success: true,
                alreadyExists: false,
                agent: null,
                ostiumAgentAddress: existingAddresses?.ostium_agent_address || null,
                avantisAgentAddress: existingAddresses?.ostium_agent_address || null,
                deployment: null,
                hasDeployment: false,
                requestedVenues,
            });
        }

        // Get or create shared Ostium/Avantis agent address
        const agentAddressResult = await getOrCreateOstiumAgentAddress({
            userWallet: normalizedWallet,
        });

        // Generate agent name with timestamp
        const timestamp = new Date();
        const formattedTimestamp = `${String(timestamp.getDate()).padStart(
            2,
            "0"
        )}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(
            timestamp.getFullYear()
        ).slice(2)}${String(timestamp.getHours()).padStart(2, "0")}${String(
            timestamp.getMinutes()
        ).padStart(2, "0")}${String(timestamp.getSeconds()).padStart(2, "0")}`;

        const agentName = `OpenClaw Trader - ${formattedTimestamp}`;

        // Create the agent
        const agent = await prisma.agents.create({
            data: {
                creator_wallet: normalizedWallet,
                profit_receiver_address: normalizedWallet,
                name: agentName,
                venue: "OSTIUM",
                weights: [50, 50, 50, 50, 50, 50, 50, 50],
                status: "PRIVATE",
                proof_of_intent_message: null,
                proof_of_intent_signature: null,
                proof_of_intent_timestamp: null,
            },
        });

        console.log(
            `[OpenClaw] Created trading agent ${agent.id} for wallet ${normalizedWallet}`
        );
        console.log(
            `[OpenClaw] Ostium agent address: ${agentAddressResult.address}`
        );

        return res.status(201).json({
            success: true,
            alreadyExists: false,
            agent: {
                id: agent.id,
                name: agent.name,
                venue: agent.venue,
                status: agent.status,
            },
            ostiumAgentAddress: agentAddressResult.address,
            avantisAgentAddress: agentAddressResult.address,
            deployment: null,
            hasDeployment: false,
            requestedVenues,
        });
    } catch (error: any) {
        console.error("[OpenClaw] Create trading agent error:", error);
        return res.status(500).json({
            error: "Failed to create trading agent",
            message: error.message,
        });
    }
}
