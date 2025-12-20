import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { createTelegramBot } from "../../../lib/telegram-bot";

const bot = createTelegramBot();

/**
 * Generate a Telegram link code for lazy trading
 * Uses the main TELEGRAM_BOT_TOKEN
 * POST /api/lazy-trading/generate-telegram-link
 * Body: { userWallet: string }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet } = req.body;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({ error: "userWallet is required" });
    }

    const normalizedWallet = userWallet.toLowerCase();

    // Check if user already has a lazy trader telegram linked via agent_telegram_users
    // Find agents created by this wallet that are lazy traders
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
        alreadyLinked: true,
        telegramUser: {
          id: telegramUser.id,
          telegram_user_id: telegramUser.telegram_user_id,
          telegram_username: telegramUser.telegram_username,
          first_name: telegramUser.first_name,
        },
        agentId: existingLazyAgent.id,
      });
    }

    // Generate a unique link code with LT prefix for lazy trading
    const linkCode = `LT${bot.generateLinkCode()}`;

    // Get bot info
    const botInfo = await bot.getMe();
    console.log("[LazyTrading] Bot info:", JSON.stringify(botInfo, null, 2));
    console.log(
      "[LazyTrading] TELEGRAM_BOT_TOKEN set:",
      !!process.env.TELEGRAM_BOT_TOKEN
    );
    console.log(
      "[LazyTrading] TELEGRAM_BOT_USERNAME env:",
      process.env.TELEGRAM_BOT_USERNAME
    );

    const botUsername = botInfo?.username || "Prime_Alpha_bot"; // Use the correct default for the main trading bot

    // If botInfo doesn't have a username, there's likely an issue with the bot token
    if (!botInfo?.username) {
      console.warn(
        "[LazyTrading] Bot getMe() returned no username. Bot token might be incorrect."
      );
      console.warn(
        "[LazyTrading] Please check that TELEGRAM_BOT_TOKEN is set to the correct Prime_Alpha_bot token."
      );
    }

    console.log("[LazyTrading] Using bot username:", botUsername);

    // Create deep link URL - user clicks start with the code
    const deepLink = `https://t.me/${botUsername}?start=${linkCode}`;

    return res.status(200).json({
      success: true,
      alreadyLinked: false,
      linkCode,
      botUsername,
      deepLink,
      instructions: `Click the link to connect your Telegram as a signal source for Lazy Trading.`,
      expiresIn: 600, // 10 minutes
    });
  } catch (error: any) {
    console.error("[API] Generate lazy trading telegram link error:", error);
    return res.status(500).json({
      error: "Failed to generate link",
      message: error.message,
    });
  }
}
