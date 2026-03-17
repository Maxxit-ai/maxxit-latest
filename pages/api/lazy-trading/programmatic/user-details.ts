import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

function omitEmptyFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => omitEmptyFields(item))
      .filter(
        (item) =>
          item !== null &&
          item !== undefined &&
          item !== false &&
          item !== ""
      ) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, omitEmptyFields(entryValue)])
        .filter(
          ([, entryValue]) =>
            entryValue !== null &&
            entryValue !== undefined &&
            entryValue !== false &&
            entryValue !== "" &&
            (!Array.isArray(entryValue) || entryValue.length > 0) &&
            (typeof entryValue !== "object" ||
              Array.isArray(entryValue) ||
              Object.keys(entryValue).length > 0)
        )
    ) as T;
  }

  return value;
}

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

    const deployment = lazyTraderAgent
      ? await prisma.agent_deployments.findFirst({
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
        })
      : null;

    const userAgentAddress = await prismaClient.user_agent_addresses.findUnique({
      where: { user_wallet: userWallet },
      select: {
        ostium_agent_address: true,
        hyperliquid_agent_address: true,
        aster_enabled: true,
      },
    });

    const telegramUser =
      lazyTraderAgent && lazyTraderAgent.agent_telegram_users.length > 0
        ? lazyTraderAgent.agent_telegram_users[0].telegram_alpha_users
        : null;

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json(
      omitEmptyFields({
        success: true,
        user_wallet: userWallet,
        lazy_trading_ready: !!lazyTraderAgent,
        agent: lazyTraderAgent
          ? {
              id: lazyTraderAgent.id,
              name: lazyTraderAgent.name,
              venue: lazyTraderAgent.venue,
              status: lazyTraderAgent.status,
            }
          : null,
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
        aster_configured: !!userAgentAddress?.aster_enabled,
      })
    );
  } catch (error: any) {
    console.error("[API] Lazy trading user details error:", error);
    return res.status(500).json({
      error: "Failed to fetch user details",
      message: error.message,
    });
  }
}
