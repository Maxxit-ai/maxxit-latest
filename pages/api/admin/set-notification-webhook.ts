import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Admin endpoint to set the Telegram notification bot webhook
 * GET /api/admin/set-notification-webhook
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const botToken = process.env.TELEGRAM_NOTIFICATION_BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({
        success: false,
        error: "TELEGRAM_NOTIFICATION_BOT_TOKEN not configured",
      });
    }

    // Get the base URL from the request or environment
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const webhookUrl = `${baseUrl}/api/telegram-notifications/webhook`;

    console.log(`[SetWebhook] Setting webhook to: ${webhookUrl}`);

    // Set the webhook
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          drop_pending_updates: false, // Keep pending updates
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("[SetWebhook] Error:", data);
      return res.status(500).json({
        success: false,
        error: "Failed to set webhook",
        details: data,
      });
    }

    console.log("[SetWebhook] Success:", data);

    // Get webhook info to confirm
    const infoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    );
    const webhookInfo = await infoResponse.json();

    return res.status(200).json({
      success: true,
      message: "Webhook set successfully",
      webhookUrl,
      webhookInfo: webhookInfo.result,
    });
  } catch (error: any) {
    console.error("[SetWebhook] Exception:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to set webhook",
      message: error.message,
    });
  }
}
