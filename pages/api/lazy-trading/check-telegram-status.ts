import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

/**
 * Check if user's telegram is connected for lazy trading
 * Checks telegram_alpha_users for a lazy_trader entry linked to user's agent
 * GET /api/lazy-trading/check-telegram-status?userWallet=0x...&linkCode=LTXXXXXX
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, linkCode } = req.query;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({ error: "userWallet is required" });
    }

    const normalizedWallet = userWallet.toLowerCase();

    // First check if user already has a lazy trading agent with telegram linked
    const existingLazyAgent = await prisma.agents.findFirst({
      where: {
        creator_wallet: normalizedWallet,
        name: { startsWith: "Lazy Trader -" },
      },
      include: {
        agent_telegram_users: {
          include: {
            telegram_alpha_users: true,
          },
        },
      },
    });

    if (
      existingLazyAgent &&
      existingLazyAgent.agent_telegram_users.length > 0
    ) {
      const telegramUser =
        existingLazyAgent.agent_telegram_users[0].telegram_alpha_users;
      return res.status(200).json({
        success: true,
        connected: true,
        telegramUser: {
          id: telegramUser.id,
          telegram_user_id: telegramUser.telegram_user_id,
          telegram_username: telegramUser.telegram_username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
        },
        agentId: existingLazyAgent.id,
      });
    }

    // Check for recently created lazy trader alpha users that are NOT yet linked to an agent
    // This catches users who just clicked the telegram link but haven't completed agent creation
    const recentLazyTrader = await prisma.telegram_alpha_users.findFirst({
      where: {
        lazy_trader: true,
        // Not linked to any agent yet
        agent_telegram_users: {
          none: {},
        },
        // Created or updated in the last 10 minutes
        OR: [
          {
            created_at: {
              gte: new Date(Date.now() - 10 * 60 * 1000),
            },
          },
          {
            last_message_at: {
              gte: new Date(Date.now() - 10 * 60 * 1000),
            },
          },
        ],
      },
      orderBy: {
        created_at: "desc",
      },
    });

    if (recentLazyTrader) {
      return res.status(200).json({
        success: true,
        connected: true,
        telegramUser: {
          id: recentLazyTrader.id,
          telegram_user_id: recentLazyTrader.telegram_user_id,
          telegram_username: recentLazyTrader.telegram_username,
          first_name: recentLazyTrader.first_name,
          last_name: recentLazyTrader.last_name,
        },
        agentId: null, // Agent not created yet
      });
    }

    return res.status(200).json({
      success: true,
      connected: false,
      telegramUser: null,
      agentId: null,
    });
  } catch (error: any) {
    console.error("[API] Check lazy trading telegram status error:", error);
    return res.status(500).json({
      error: "Failed to check status",
      message: error.message,
    });
  }
}
