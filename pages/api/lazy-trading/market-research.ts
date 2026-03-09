import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

const CHAINGPT_API_URL = "https://api.chaingpt.org/chat/stream";
const CHAINGPT_API_KEY = process.env.CHAINGPT_API_KEY;
const CHAINGPT_MODEL = process.env.CHAINGPT_MODEL || "general_assistant";
const CHAINGPT_CHAT_HISTORY = process.env.CHAINGPT_CHAT_HISTORY === "on" ? "on" : "off";

type ChainGptResponse = {
  status?: boolean;
  message?: string;
  data?: {
    bot?: string;
  };
};

const extractAiText = (rawBody: string) => {
  const trimmedBody = rawBody.trim();
  if (!trimmedBody) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedBody) as ChainGptResponse;
    return parsed.data?.bot?.trim() || null;
  } catch {
    return trimmedBody;
  }
};

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

    const { content } = req.body || {};

    if (!content || typeof content !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'content' field",
      });
    }

    if (!CHAINGPT_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "CHAINGPT_API_KEY not configured",
      });
    }

    const response = await fetch(CHAINGPT_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CHAINGPT_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
      },
      body: JSON.stringify({
        model: CHAINGPT_MODEL,
        question: content,
        chatHistory: CHAINGPT_CHAT_HISTORY,
        sdkUniqueId:
          CHAINGPT_CHAT_HISTORY === "on" ? `lazy-trading:${apiKeyRecord.id}` : undefined,
      }),
    });

    const rawBody = await response.text();

    let responseBody: ChainGptResponse | null = null;
    try {
      responseBody = JSON.parse(rawBody) as ChainGptResponse;
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          responseBody?.message ||
          responseBody?.data?.bot ||
          `ChainGPT API error: ${response.statusText}`,
      });
    }

    const aiText = extractAiText(rawBody);
    if (!aiText) {
      console.error("[API] ChainGPT empty response body:", {
        status: response.status,
        contentType: response.headers.get("content-type"),
        bodyPreview: rawBody.slice(0, 500),
      });

      return res.status(502).json({
        success: false,
        error: "No response text received from ChainGPT",
      });
    }

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({ success: true, ai_text: aiText });
  } catch (error: any) {
    console.error("[API] Lazy trading ChainGPT research error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch research from ChainGPT",
    });
  }
}
