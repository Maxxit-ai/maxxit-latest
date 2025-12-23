import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Admin endpoint - DEPRECATED
 * 
 * Notifications now use the same bot as lazy trading (TELEGRAM_BOT_TOKEN).
 * The webhook is set on /api/telegram/webhook for all Telegram features.
 * 
 * GET /api/admin/set-notification-webhook
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    success: true,
    deprecated: true,
    message: "This endpoint is deprecated. Notifications now use the same bot as lazy trading.",
    info: {
      explanation: "Both lazy trading and trade notifications now use TELEGRAM_BOT_TOKEN",
      webhookEndpoint: "/api/telegram/webhook",
      setupInstructions: [
        "1. Set TELEGRAM_BOT_TOKEN environment variable",
        "2. Set the webhook to /api/telegram/webhook using scripts/set-telegram-webhook.ts",
        "3. Both features will work through the same bot automatically"
      ],
      linkCodePrefixes: {
        lazyTrading: "LT (e.g., LT123ABC)",
        notifications: "NTF_ (e.g., NTF_ABC12345)"
      }
    }
  });
}
