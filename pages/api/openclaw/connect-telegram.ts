/**
 * Connect Telegram Bot
 * Accept a user-provided bot token and validate it against Telegram API
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { storeUserBotToken } from "../../../lib/ssm";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, botToken } = req.body;

    if (!userWallet || !botToken) {
      return res.status(400).json({
        error: "Missing required fields: userWallet and botToken are required",
      });
    }

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (!instance) {
      return res.status(404).json({
        error: "Instance not found",
      });
    }

    const getMeRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`
    );
    const getMeData = await getMeRes.json();

    if (!getMeData.ok) {
      return res.status(400).json({
        error: "Invalid bot token",
        message:
          "The provided Telegram bot token is not valid. Please check your token from @BotFather and try again.",
      });
    }

    const result = getMeData.result;

    await storeUserBotToken(userWallet, botToken);

    await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL;
    if (baseUrl) {
      const webhookUrl = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/openclaw/telegram-webhook?wallet=${encodeURIComponent(userWallet)}`;
      const setWebhookRes = await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: webhookUrl }),
        }
      );
      const webhookResult = await setWebhookRes.json();
      if (!webhookResult.ok) {
        console.warn("[OpenClaw] Failed to set webhook:", webhookResult);
      }
    }

    await prisma.openclaw_instances.update({
      where: { user_wallet: userWallet },
      data: {
        telegram_bot_username: result.username,
        telegram_linked_at: new Date(),
        telegram_username: result.username,
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      bot: {
        username: result.username,
        firstName: result.first_name,
      },
    });
  } catch (error: any) {
    console.error("[OpenClaw Connect Telegram] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to connect Telegram bot",
    });
  }
}
