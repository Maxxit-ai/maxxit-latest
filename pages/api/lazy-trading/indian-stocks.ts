import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

const INDIAN_STOCKS_API_URL =
  process.env.INDIAN_STOCKS_API_URL || "https://indian.maxxit.ai/research/ask";
const INDIAN_STOCKS_API_KEY =
  process.env.INDIAN_STOCKS_API_KEY;
const INDIAN_STOCKS_TIMEOUT_MS = 4 * 60 * 1000;

const ALLOWED_CHAT_MODELS = ["analytical", "strategic"] as const;
const ALLOWED_RESPONSE_LENGTHS = ["short", "medium", "long"] as const;
const ALLOWED_THINKING_LEVELS = ["low", "balanced", "deep"] as const;

type ChatModel = (typeof ALLOWED_CHAT_MODELS)[number];
type ResponseLength = (typeof ALLOWED_RESPONSE_LENGTHS)[number];
type ThinkingLevel = (typeof ALLOWED_THINKING_LEVELS)[number];

const isAllowedValue = <T extends readonly string[]>(
  value: unknown,
  allowedValues: T
): value is T[number] =>
  typeof value === "string" && (allowedValues as readonly string[]).includes(value);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const {
      question,
      content,
      chat_model,
      chatModel,
      response_length,
      responseLength,
      thinking_level,
      thinkingLevel,
    } = req.body || {};
    const normalizedQuestion =
      typeof question === "string" && question.trim()
        ? question.trim()
        : typeof content === "string" && content.trim()
          ? content.trim()
          : null;
    const normalizedChatModel = (chat_model ?? chatModel ?? "analytical") as unknown;
    const normalizedResponseLength =
      (response_length ?? responseLength ?? "medium") as unknown;
    const normalizedThinkingLevel = (thinking_level ?? thinkingLevel) as unknown;

    if (!normalizedQuestion) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'question' field",
      });
    }

    if (!isAllowedValue(normalizedChatModel, ALLOWED_CHAT_MODELS)) {
      return res.status(400).json({
        success: false,
        error: "Invalid 'chat_model'; expected one of: analytical, strategic",
      });
    }

    if (!isAllowedValue(normalizedResponseLength, ALLOWED_RESPONSE_LENGTHS)) {
      return res.status(400).json({
        success: false,
        error: "Invalid 'response_length'; expected one of: short, medium, long",
      });
    }

    if (normalizedThinkingLevel !== undefined) {
      if (normalizedChatModel !== "strategic") {
        return res.status(400).json({
          success: false,
          error: "'thinking_level' can only be used when 'chat_model' is 'strategic'",
        });
      }

      if (!isAllowedValue(normalizedThinkingLevel, ALLOWED_THINKING_LEVELS)) {
        return res.status(400).json({
          success: false,
          error: "Invalid 'thinking_level'; expected one of: low, balanced, deep",
        });
      }
    }

    if (!INDIAN_STOCKS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "INDIAN_STOCKS_API_KEY not configured",
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INDIAN_STOCKS_TIMEOUT_MS);

    const requestBody: {
      question: string;
      chat_model: ChatModel;
      response_length: ResponseLength;
      thinking_level?: ThinkingLevel;
    } = {
      question: normalizedQuestion,
      chat_model: normalizedChatModel,
      response_length: normalizedResponseLength,
    };

    if (
      normalizedChatModel === "strategic" &&
      isAllowedValue(normalizedThinkingLevel, ALLOWED_THINKING_LEVELS)
    ) {
      requestBody.thinking_level = normalizedThinkingLevel;
    }

    let response: Response;
    try {
      response = await fetch(INDIAN_STOCKS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": INDIAN_STOCKS_API_KEY,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        return res.status(408).json({
          success: false,
          error: `Indian stocks research timed out after ${INDIAN_STOCKS_TIMEOUT_MS / 1000}s.`,
        });
      }

      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    const responseText = await response.text();

    let responseBody: { answer?: string; error?: string } | null = null;
    try {
      responseBody = JSON.parse(responseText) as { answer?: string; error?: string };
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          responseBody?.error ||
          responseText ||
          `Indian stocks API error: ${response.statusText}`,
      });
    }

    const aiText = responseBody?.answer?.trim();
    if (!aiText) {
      return res.status(502).json({
        success: false,
        error: "Indian stocks API returned no research text",
      });
    }

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      ai_text: aiText,
      answer: aiText,
    });
  } catch (error: any) {
    console.error("[API] Indian stocks research error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch Indian stocks research",
    });
  }
}
