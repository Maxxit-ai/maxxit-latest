import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
}

/**
 * Webhook endpoint for Telegram Notification Bot
 * Handles /start command with deep link parameter
 * POST /api/telegram-notifications/webhook
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update: TelegramUpdate = req.body;
    console.log(
      "[Telegram Notifications] Received update:",
      JSON.stringify(update, null, 2)
    );

    // Handle text message
    if (update.message?.text) {
      await handleTextMessage(update);
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("[Telegram Notifications] Webhook error:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleTextMessage(update: TelegramUpdate) {
  const message = update.message!;
  const chatId = message.chat.id;
  const telegramUserId = message.from.id.toString();
  const text = message.text!;

  console.log(
    "[Telegram Notifications] Processing message from",
    telegramUserId,
    ":",
    text
  );

  const botToken = process.env.TELEGRAM_NOTIFICATION_BOT_TOKEN;
  if (!botToken) {
    console.error("[Telegram Notifications] Bot token not configured");
    return;
  }

  // Handle /start command with deep link parameter
  if (text.startsWith("/start ")) {
    const linkCode = text.split(" ")[1]?.toUpperCase();

    if (!linkCode) {
      await sendMessage(
        chatId,
        "❌ Invalid link. Please use the link from the Maxxit platform.",
        botToken
      );
      return;
    }

    // Find user by link code
    const pendingLink = await prisma.user_telegram_notifications.findFirst({
      where: {
        link_code: linkCode,
        is_active: false,
      },
    });

    if (!pendingLink) {
      await sendMessage(
        chatId,
        "❌ Invalid or expired link code. Please generate a new link from the Maxxit platform.",
        botToken
      );
      return;
    }

    // Check if this Telegram account is already linked to another wallet
    const existingLink = await prisma.user_telegram_notifications.findUnique({
      where: { telegram_chat_id: chatId.toString() },
    });

    if (existingLink && existingLink.user_wallet !== pendingLink.user_wallet) {
      await sendMessage(
        chatId,
        "⚠️ This Telegram account is already linked to another wallet. Please disconnect first or use a different Telegram account.",
        botToken
      );
      return;
    }

    // Update the pending link with actual Telegram details
    await prisma.user_telegram_notifications.update({
      where: { id: pendingLink.id },
      data: {
        telegram_chat_id: chatId.toString(),
        telegram_user_id: telegramUserId,
        telegram_username: message.from.username || null,
        is_active: true,
        linked_at: new Date(),
        link_code: null, // Clear link code after successful link
      },
    });

    console.log(
      `[Telegram Notifications] ✅ Linked user ${
        pendingLink.user_wallet
      } to Telegram @${message.from.username || telegramUserId}`
    );

    await sendMessage(
      chatId,
      `✅ *Successfully Connected!*\n\n` +
        `Your Telegram account is now linked to your Maxxit wallet.\n\n` +
        `You will receive notifications for:\n` +
        `• New positions opened\n` +
        `• Updates on your trades\n\n`,
      botToken,
      { parse_mode: "Markdown" }
    );

    return;
  }

  // Handle /start without parameter
  if (text === "/start") {
    await sendMessage(
      chatId,
      "👋 *Welcome to Maxxit Notifications!*\n\n" +
        "To receive trade notifications:\n\n" +
        "1. Go to Maxxit platform (my-trades page)\n" +
        '2. Click "Connect Telegram" button\n' +
        "3. Follow the instructions\n\n" +
        "This bot will keep you updated on all your trades in real-time!",
      botToken,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Handle /status command
  if (text === "/status") {
    const userLink = await prisma.user_telegram_notifications.findUnique({
      where: { telegram_chat_id: chatId.toString() },
    });

    if (!userLink || !userLink.is_active) {
      await sendMessage(
        chatId,
        "❌ Not connected. Use /start with a link from the Maxxit platform.",
        botToken
      );
      return;
    }

    await sendMessage(
      chatId,
      `✅ *Connected and Active*\n\n` +
        `Wallet: \`${userLink.user_wallet.slice(
          0,
          6
        )}...${userLink.user_wallet.slice(-4)}\`\n` +
        `Connected: ${userLink.linked_at.toLocaleDateString()}\n` +
        `Last notification: ${
          userLink.last_notified_at
            ? userLink.last_notified_at.toLocaleString()
            : "Never"
        }`,
      botToken,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Unknown command
  await sendMessage(
    chatId,
    "❓ Unknown command. Use /start to connect or /status to check connection.",
    botToken
  );
}

async function sendMessage(
  chatId: number,
  text: string,
  botToken: string,
  options?: { parse_mode?: "Markdown" | "HTML" }
): Promise<void> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...options,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[Telegram Notifications] Send message error:", error);
    }
  } catch (error: any) {
    console.error(
      "[Telegram Notifications] Send message exception:",
      error.message
    );
  }
}
