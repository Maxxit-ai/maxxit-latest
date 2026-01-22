import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

const createMessageId = (userWallet: string) =>
  `api_${userWallet}_${Date.now()}_${randomBytes(4).toString("hex")}`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const { message } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const userWallet = apiKeyRecord.user_wallet;

    const lazyTraderUser = await prisma.telegram_alpha_users.findFirst({
      where: {
        user_wallet: userWallet,
        lazy_trader: true,
      },
      orderBy: { created_at: "desc" },
    });

    if (!lazyTraderUser) {
      return res
        .status(404)
        .json({ error: "Lazy trader Telegram user not found" });
    }

    const messageId = createMessageId(userWallet);

    const existingPost = await prisma.telegram_posts.findUnique({
      where: { message_id: messageId },
      select: { id: true },
    });

    if (existingPost) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message_id: messageId,
        post_id: existingPost.id,
      });
    }

    const createdPost = await prisma.telegram_posts.create({
      data: {
        alpha_user_id: lazyTraderUser.id,
        source_id: null,
        message_id: messageId,
        message_text: message.trim(),
        message_created_at: new Date(),
        sender_id: "api",
        sender_username: "api",
        is_signal_candidate: null,
        extracted_tokens: [],
        confidence_score: null,
        signal_type: null,
        processed_for_signals: false,
        impact_factor_flag: false,
        impact_factor: 0,
      },
    });

    await prisma.telegram_alpha_users.update({
      where: { id: lazyTraderUser.id },
      data: { last_message_at: new Date() },
    });

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(201).json({
      success: true,
      message_id: messageId,
      post_id: createdPost.id,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading send message error:", error);
    return res.status(500).json({
      error: "Failed to send message",
      message: error.message,
    });
  }
}
