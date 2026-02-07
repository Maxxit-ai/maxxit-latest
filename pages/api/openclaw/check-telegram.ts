/**
 * Check Telegram Link Status
 * Poll to check if Telegram has been linked to the OpenClaw instance
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet } = req.query;

    // Validate required fields
    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({
        error: "Missing or invalid userWallet query parameter",
      });
    }

    // Get instance from database
    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (!instance) {
      return res.status(404).json({
        error: "Instance not found",
      });
    }

    // Check if Telegram is linked
    const isLinked = !!instance.telegram_user_id;

    return res.status(200).json({
      success: true,
      linked: isLinked,
      telegram: isLinked
        ? {
            userId: instance.telegram_user_id,
            username: instance.telegram_username,
            chatId: instance.telegram_chat_id,
            linkedAt: instance.telegram_linked_at,
          }
        : null,
    });
  } catch (error: any) {
    console.error("[OpenClaw Check Telegram] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to check Telegram status",
    });
  }
}
