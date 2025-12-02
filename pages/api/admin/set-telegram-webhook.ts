/**
 * Admin API: Set Telegram Webhook
 * 
 * This endpoint can be called from Vercel/Railway to set the webhook automatically
 * 
 * Usage:
 *   POST /api/admin/set-telegram-webhook
 *   Body: { webhookUrl?: string } (optional - uses current deployment URL if not provided)
 * 
 * Or call directly:
 *   curl -X POST https://your-app.vercel.app/api/admin/set-telegram-webhook
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface SetWebhookResponse {
  ok: boolean;
  result: boolean;
  description?: string;
}

interface WebhookInfo {
  ok: boolean;
  result?: {
    url: string;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow both GET and POST for easy browser access
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
  }

  try {
    // Get webhook URL from request body or use current deployment URL
    let webhookUrl = req.body?.webhookUrl;
    
    if (!webhookUrl) {
      // Try to get from environment variable
      webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
      
      // If still not set, construct from request headers
      if (!webhookUrl && req.headers.host) {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        webhookUrl = `${protocol}://${req.headers.host}/api/telegram/webhook`;
      }
    }

    if (!webhookUrl) {
      return res.status(400).json({ 
        error: 'Webhook URL not provided. Set TELEGRAM_WEBHOOK_URL or provide in request body.' 
      });
    }

    // Validate URL
    if (!webhookUrl.startsWith('https://')) {
      return res.status(400).json({ 
        error: 'Webhook URL must use HTTPS' 
      });
    }

    console.log('[SetWebhook] Setting webhook to:', webhookUrl);

    // Check current webhook status
    const currentWebhookResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    const currentWebhook: WebhookInfo = await currentWebhookResponse.json();

    let currentUrl = null;
    if (currentWebhook.ok && currentWebhook.result?.url) {
      currentUrl = currentWebhook.result.url;
      if (currentUrl === webhookUrl) {
        return res.status(200).json({
          success: true,
          message: 'Webhook is already set to this URL',
          webhookUrl,
          pendingUpdates: currentWebhook.result.pending_update_count,
        });
      }
    }

    // Set new webhook
    const setWebhookResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query'],
        }),
      }
    );

    const result: SetWebhookResponse = await setWebhookResponse.json();

    if (!result.ok) {
      return res.status(500).json({
        error: 'Failed to set webhook',
        description: result.description,
      });
    }

    // Verify webhook
    const verifyResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    const verifyInfo: WebhookInfo = await verifyResponse.json();

    return res.status(200).json({
      success: true,
      message: 'Webhook set successfully',
      webhookUrl,
      previousUrl: currentUrl,
      pendingUpdates: verifyInfo.result?.pending_update_count || 0,
      lastError: verifyInfo.result?.last_error_message || null,
    });
  } catch (error: any) {
    console.error('[SetWebhook] Error:', error);
    return res.status(500).json({
      error: 'Failed to set webhook',
      message: error.message,
    });
  }
}

