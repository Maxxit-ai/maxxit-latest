import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const userWallet = apiKeyRecord.user_wallet;

    const lazyTraderAgent = await prisma.agents.findFirst({
      where: {
        creator_wallet: userWallet,
        OR: [
          { name: { startsWith: "Lazy Trader -" } },
          { name: { startsWith: "OpenClaw Trader -" } },
        ],
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

    if (!lazyTraderAgent) {
      return res.status(404).json({ error: "Lazy trader agent not found" });
    }

    const deployment = await prisma.agent_deployments.findFirst({
      where: {
        agent_id: lazyTraderAgent.id,
        user_wallet: userWallet,
      },
      select: {
        id: true,
        status: true,
        enabled_venues: true,
        risk_tolerance: true,
        trade_frequency: true,
        social_sentiment_weight: true,
        price_momentum_focus: true,
        market_rank_priority: true,
      },
      orderBy: { sub_started_at: "desc" },
    });

    const userAgentAddress = await prisma.user_agent_addresses.findUnique({
      where: { user_wallet: userWallet },
      select: {
        ostium_agent_address: true,
        hyperliquid_agent_address: true,
      },
    });

    const telegramUser =
      lazyTraderAgent.agent_telegram_users.length > 0
        ? lazyTraderAgent.agent_telegram_users[0].telegram_alpha_users
        : null;

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      user_wallet: userWallet,
      agent: {
        id: lazyTraderAgent.id,
        name: lazyTraderAgent.name,
        venue: lazyTraderAgent.venue,
        status: lazyTraderAgent.status,
      },
      telegram_user: telegramUser
        ? {
            id: telegramUser.id,
            telegram_user_id: telegramUser.telegram_user_id,
            telegram_username: telegramUser.telegram_username,
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name,
          }
        : null,
      deployment: deployment
        ? {
            id: deployment.id,
            status: deployment.status,
            enabled_venues: deployment.enabled_venues,
          }
        : null,
      trading_preferences: deployment
        ? {
            risk_tolerance: deployment.risk_tolerance,
            trade_frequency: deployment.trade_frequency,
            social_sentiment_weight: deployment.social_sentiment_weight,
            price_momentum_focus: deployment.price_momentum_focus,
            market_rank_priority: deployment.market_rank_priority,
          }
        : null,
      ostium_agent_address: userAgentAddress?.ostium_agent_address || null,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading club details error:", error);
    return res.status(500).json({
      error: "Failed to fetch lazy trader details",
      message: error.message,
    });
  }
}
