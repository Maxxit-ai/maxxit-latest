import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

/**
 * Check if user has Telegram notifications connected
 * GET /api/telegram-notifications/status?userWallet=0x...
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

    const notificationLink =
      await prisma.user_telegram_notifications.findUnique({
        where: { user_wallet: userWallet.toLowerCase() },
      });

    if (!notificationLink) {
      return res.status(200).json({
        connected: false,
        telegram_username: null,
      });
    }

    return res.status(200).json({
      connected: notificationLink.is_active,
      telegram_username: notificationLink.telegram_username,
      linked_at: notificationLink.linked_at,
      last_notified_at: notificationLink.last_notified_at,
    });
  } catch (error: any) {
    console.error("[API] Check notification status error:", error);
    return res.status(500).json({
      error: "Failed to check status",
      message: error.message,
    });
  }
}
