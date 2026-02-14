/**
 * OpenClaw Telegram Webhook
 * Handle incoming Telegram messages for OpenClaw instances
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    username?: string;
    first_name?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update: TelegramUpdate = req.body;

    // Validate update has a message
    if (!update.message) {
      return res.status(200).json({ success: true, message: "No message" });
    }

    const message = update.message;
    const telegramUserId = message.from.id.toString();
    const telegramUsername = message.from.username;
    const telegramChatId = message.chat.id.toString();
    const text = message.text || "";

    // Check if this is a /start command with a link code
    if (text.startsWith("/start openclaw_")) {
      const code = text.replace("/start openclaw_", "").trim();
      await handleLinkCommand(code, telegramUserId, telegramUsername, telegramChatId);
      return res.status(200).json({ success: true, message: "Link processed" });
    }

    // Get wallet from query parameter (set when webhook was registered)
    const walletFromUrl = req.query.wallet as string | undefined;
    console.log(`[Telegram Webhook] walletFromUrl: ${walletFromUrl}, telegramUserId: ${telegramUserId}, chatId: ${telegramChatId}`);

    // Find instance - prioritize wallet from URL, fallback to telegram_user_id lookup
    let instance = walletFromUrl
      ? await prisma.openclaw_instances.findUnique({
        where: { user_wallet: walletFromUrl },
      })
      : await prisma.openclaw_instances.findFirst({
        where: { telegram_user_id: telegramUserId },
      });

    console.log(`[Telegram Webhook] Instance found: ${!!instance}, id: ${instance?.id}, telegram_user_id: ${instance?.telegram_user_id}, telegram_chat_id: ${instance?.telegram_chat_id}`);

    if (!instance) {
      // User not linked yet
      await sendTelegramMessage(
        telegramChatId,
        "👋 Welcome! Please link your OpenClaw account first by visiting the Maxxit platform."
      );
      return res.status(200).json({ success: true, message: "User not linked" });
    }

    // Auto-link telegram_user_id and telegram_chat_id if not already set
    if (!instance.telegram_user_id || !instance.telegram_chat_id) {
      console.log(`[Telegram Webhook] Auto-linking telegram user. Updating instance ${instance.id}...`);
      await prisma.openclaw_instances.update({
        where: { id: instance.id },
        data: {
          telegram_user_id: telegramUserId,
          telegram_chat_id: telegramChatId,
          telegram_username: telegramUsername || instance.telegram_username,
          telegram_linked_at: new Date(),
          updated_at: new Date(),
        },
      });

      // Send verification confirmation using user's bot token
      const { getUserBotToken } = await import("../../../lib/ssm");
      const botToken = await getUserBotToken(instance.user_wallet);
      console.log(`[Telegram Webhook] Bot token from SSM: ${botToken ? 'found' : 'NOT FOUND'} for wallet ${instance.user_wallet}`);
      if (botToken) {
        await sendTelegramMessageWithToken(
          botToken,
          telegramChatId,
          "✅ <b>Verification successful!</b>\n\n" +
          "Your Telegram account has been linked to OpenClaw.\n\n" +
          "You can now activate your instance on the Maxxit platform."
        );
        console.log(`[Telegram Webhook] Verification message sent successfully`);
      } else {
        console.error(`[Telegram Webhook] No bot token found in SSM for wallet ${instance.user_wallet}`);
      }

      // Refresh instance data
      instance = { ...instance, telegram_user_id: telegramUserId, telegram_chat_id: telegramChatId };

      return res.status(200).json({ success: true, message: "Telegram verified" });
    }

    // Check if instance is active
    if (instance.status !== "active") {
      await sendTelegramMessage(
        telegramChatId,
        "⚠️ Your OpenClaw instance is not active. Please activate it on the Maxxit platform."
      );
      return res.status(200).json({
        success: true,
        message: "Instance not active",
      });
    }

    // Check budget
    const remainingBudget =
      instance.monthly_llm_budget_cents - instance.llm_spent_this_month_cents;
    if (remainingBudget <= 0) {
      await sendTelegramMessage(
        telegramChatId,
        "⚠️ You've reached your monthly LLM budget. Please upgrade your plan or wait until next month."
      );
      return res.status(200).json({
        success: true,
        message: "Budget exceeded",
      });
    }

    // TODO: Forward message to OpenClaw container via LLM proxy
    // For now, just acknowledge receipt
    await sendTelegramMessage(
      telegramChatId,
      "✅ Message received! (OpenClaw processing will be implemented soon)"
    );

    // Update last active timestamp
    await prisma.openclaw_instances.update({
      where: { id: instance.id },
      data: { last_active_at: new Date() },
    });

    return res.status(200).json({ success: true, message: "Message processed" });
  } catch (error: any) {
    console.error("[OpenClaw Telegram Webhook] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to process webhook",
    });
  }
}

async function handleLinkCommand(
  code: string,
  telegramUserId: string,
  telegramUsername: string | undefined,
  telegramChatId: string
) {
  try {
    // Find link code in database
    const linkRecord = await prisma.openclaw_telegram_links.findUnique({
      where: { code },
    });

    if (!linkRecord) {
      // No link record — we don't know which bot token to use, try global fallback
      await sendTelegramMessage(
        telegramChatId,
        "❌ Invalid link code. Please generate a new link on the Maxxit platform."
      );
      return;
    }

    // Check if already used
    if (linkRecord.used_at) {
      await sendTelegramMessage(
        telegramChatId,
        "❌ This link has already been used. Please generate a new link."
      );
      return;
    }

    // Check if expired
    if (new Date() > linkRecord.expires_at) {
      await sendTelegramMessage(
        telegramChatId,
        "❌ This link has expired. Please generate a new link."
      );
      return;
    }

    // Link Telegram to instance
    await prisma.openclaw_instances.update({
      where: { user_wallet: linkRecord.user_wallet },
      data: {
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
        telegram_chat_id: telegramChatId,
        telegram_linked_at: new Date(),
        status: "pending_activation",
        updated_at: new Date(),
      },
    });

    // Mark link as used
    await prisma.openclaw_telegram_links.update({
      where: { code },
      data: { used_at: new Date() },
    });

    await sendTelegramMessage(
      telegramChatId,
      "✅ Success! Your Telegram account has been linked to OpenClaw.\n\n" +
      "Return to the Maxxit platform to complete setup and activate your assistant."
    );
  } catch (error) {
    console.error("[OpenClaw] Error handling link command:", error);
    await sendTelegramMessage(
      telegramChatId,
      "❌ An error occurred while linking your account. Please try again."
    );
  }
}

async function sendTelegramMessage(chatId: string, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[OpenClaw] TELEGRAM_BOT_TOKEN not set");
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("[OpenClaw] Telegram API error:", error);
    }
  } catch (error) {
    console.error("[OpenClaw] Error sending Telegram message:", error);
  }
}

async function sendTelegramMessageWithToken(botToken: string, chatId: string, text: string) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("[OpenClaw] Telegram API error:", error);
    }
  } catch (error) {
    console.error("[OpenClaw] Error sending Telegram message:", error);
  }
}
