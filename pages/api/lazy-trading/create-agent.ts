import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

interface TradingPreferences {
  risk_tolerance: number;
  trade_frequency: number;
  social_sentiment_weight: number;
  price_momentum_focus: number;
  market_rank_priority: number;
}

/**
 * Create a lazy trading agent using the standard agent/deployment flow
 * POST /api/lazy-trading/create-agent
 * Body: {
 *   userWallet: string,
 *   telegramAlphaUserId: string,
 *   tradingPreferences?: TradingPreferences
 * }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, telegramAlphaUserId, tradingPreferences } = req.body;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({ error: "userWallet is required" });
    }

    if (!telegramAlphaUserId || typeof telegramAlphaUserId !== "string") {
      return res.status(400).json({ error: "telegramAlphaUserId is required" });
    }

    const normalizedWallet = userWallet.toLowerCase();

    // Get the telegram alpha user info
    const telegramUser = await prisma.telegram_alpha_users.findUnique({
      where: { id: telegramAlphaUserId },
    });

    if (!telegramUser) {
      return res.status(404).json({ error: "Telegram user not found" });
    }

    // Check if user already has a lazy trading agent
    const existingAgent = await prisma.agents.findFirst({
      where: {
        creator_wallet: normalizedWallet,
        name: { startsWith: "Lazy Trader -" },
      },
      include: {
        agent_deployments: {
          where: { status: "ACTIVE" },
        },
      },
    });

    if (existingAgent) {
      // Check if telegram is already linked
      const existingLink = await prisma.agent_telegram_users.findFirst({
        where: {
          agent_id: existingAgent.id,
          telegram_alpha_user_id: telegramAlphaUserId,
        },
      });

      if (!existingLink) {
        // Link the telegram user to existing agent
        await prisma.agent_telegram_users.create({
          data: {
            agent_id: existingAgent.id,
            telegram_alpha_user_id: telegramAlphaUserId,
          },
        });
      }

      // Return existing agent info
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        agent: {
          id: existingAgent.id,
          name: existingAgent.name,
          venue: existingAgent.venue,
          status: existingAgent.status,
        },
        deployment: existingAgent.agent_deployments[0] || null,
        needsDeployment: existingAgent.agent_deployments.length === 0,
      });
    }

    // Generate agent name with telegram username and timestamp
    const timestamp = new Date();
    const formattedTimestamp = `${String(timestamp.getDate()).padStart(
      2,
      "0"
    )}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(
      timestamp.getFullYear()
    ).slice(2)}${String(timestamp.getHours()).padStart(2, "0")}${String(
      timestamp.getMinutes()
    ).padStart(2, "0")}${String(timestamp.getSeconds()).padStart(2, "0")}`;

    const displayName = telegramUser.telegram_username
      ? `@${telegramUser.telegram_username}`
      : telegramUser.first_name || "User";

    const agentName = `Lazy Trader - ${displayName} - ${formattedTimestamp}`;

    // Create the agent (same structure as regular agent creation)
    const agent = await prisma.agents.create({
      data: {
        creator_wallet: normalizedWallet,
        profit_receiver_address: normalizedWallet,
        name: agentName,
        venue: "OSTIUM", // Ostium only for now
        weights: [50, 50, 50, 50, 50, 50, 50, 50],
        status: "PRIVATE",
        // Proof of intent is NULL for lazy traders
        proof_of_intent_message: null,
        proof_of_intent_signature: null,
        proof_of_intent_timestamp: null,
      },
    });

    // Link the telegram alpha user to this agent
    await prisma.agent_telegram_users.create({
      data: {
        agent_id: agent.id,
        telegram_alpha_user_id: telegramAlphaUserId,
      },
    });

    // Mark the telegram user as lazy trader
    await prisma.telegram_alpha_users.update({
      where: { id: telegramAlphaUserId },
      data: { lazy_trader: true },
    });

    console.log(
      `[LazyTrading] Created agent ${agent.id} for wallet ${normalizedWallet}`
    );

    // Now generate agent address using the standard flow
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;

    const addressResponse = await fetch(
      `${baseUrl}/api/agents/${agent.id}/generate-deployment-address`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: normalizedWallet,
          venue: "OSTIUM",
        }),
      }
    );

    let ostiumAgentAddress: string | null = null;
    if (addressResponse.ok) {
      const addressData = await addressResponse.json();
      ostiumAgentAddress =
        addressData.addresses?.ostium?.address || addressData.address;
    }

    // Create deployment using the standard flow
    const deploymentResponse = await fetch(
      `${baseUrl}/api/ostium/create-deployment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          userWallet: normalizedWallet,
          tradingPreferences: tradingPreferences || {
            risk_tolerance: 50,
            trade_frequency: 50,
            social_sentiment_weight: 50,
            price_momentum_focus: 50,
            market_rank_priority: 50,
          },
        }),
      }
    );

    let deployment = null;
    if (deploymentResponse.ok) {
      const deploymentData = await deploymentResponse.json();
      deployment = deploymentData.deployment;
    }

    return res.status(201).json({
      success: true,
      alreadyExists: false,
      agent: {
        id: agent.id,
        name: agent.name,
        venue: agent.venue,
        status: agent.status,
      },
      deployment,
      ostiumAgentAddress,
      needsDeployment: !deployment,
    });
  } catch (error: any) {
    console.error("[API] Create lazy trading agent error:", error);
    return res.status(500).json({
      error: "Failed to create agent",
      message: error.message,
    });
  }
}
