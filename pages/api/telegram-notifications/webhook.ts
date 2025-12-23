import type { NextApiRequest, NextApiResponse } from "next";

/**
 * DEPRECATED: Webhook endpoint for Telegram Notification Bot
 * 
 * This webhook is no longer used. All Telegram interactions now go through
 * the main webhook at /api/telegram/webhook which handles both:
 * - Lazy Trading (LT prefix codes)
 * - Trade Notifications (NTF_ prefix codes)
 * 
 * The reason for this consolidation is to use a single bot for all features.
 * 
 * If you're receiving messages here, you need to update the bot webhook to:
 * /api/telegram/webhook
 * 
 * POST /api/telegram-notifications/webhook
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Log that this deprecated endpoint was called (for debugging)
  console.warn(
    "[Telegram Notifications] ⚠️ DEPRECATED: Received request to /api/telegram-notifications/webhook",
    "Please update the bot webhook to /api/telegram/webhook"
  );

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Return 200 to prevent Telegram from retrying, but log the issue
  return res.status(200).json({
    ok: true,
    deprecated: true,
    message: "This webhook is deprecated. Please update to /api/telegram/webhook",
    info: {
      mainWebhook: "/api/telegram/webhook",
      reason: "All Telegram features now use a single bot and webhook",
    }
  });
}
