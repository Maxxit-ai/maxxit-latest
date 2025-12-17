import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import crypto from "crypto";

/**
 * Generate a Telegram notification link code for a user
 * POST /api/telegram-notifications/generate-link
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

    // Check if user already has a linked Telegram
    const existingLink = await prisma.user_telegram_notifications.findUnique({
      where: { user_wallet: userWallet.toLowerCase() },
    });

    if (existingLink && existingLink.is_active) {
      return res.status(400).json({
        error: "Telegram already linked",
        telegram_username: existingLink.telegram_username,
      });
    }

    // Generate a unique link code (6 characters, alphanumeric)
    const linkCode = crypto.randomBytes(4).toString("hex").toUpperCase();

    // Create or update user telegram notification entry
    if (existingLink) {
      // Update existing entry with new link code
      await prisma.user_telegram_notifications.update({
        where: { user_wallet: userWallet.toLowerCase() },
        data: {
          link_code: linkCode,
          is_active: false, // Will be activated when user clicks start
        },
      });
    } else {
      // Create new entry with pending status
      await prisma.user_telegram_notifications.create({
        data: {
          user_wallet: userWallet.toLowerCase(),
          telegram_chat_id: `pending_${Date.now()}`, // Temporary, will be updated
          link_code: linkCode,
          is_active: false,
        },
      });
    }

    // Get bot username from env or use default
    const botUsername =
      process.env.TELEGRAM_NOTIFICATION_BOT_USERNAME || "MaxxitNotifyBot";

    // Create deep link URL
    const deepLink = `https://t.me/${botUsername}?start=${linkCode}`;

    return res.status(200).json({
      success: true,
      linkCode,
      botUsername,
      deepLink,
      instructions: `Click the link to connect your Telegram account and receive trade notifications.`,
      expiresIn: 600, // 10 minutes
    });
  } catch (error: any) {
    console.error("[API] Generate notification link error:", error);
    return res.status(500).json({
      error: "Failed to generate link",
      message: error.message,
    });
  }
}
