import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

const INDIAN_STOCKS_API_URL =
  process.env.INDIAN_STOCKS_API_URL || "https://indian.maxxit.ai/research/ask";
const INDIAN_STOCKS_API_KEY =
  process.env.RESEARCH_API_KEY;
const INDIAN_STOCKS_TIMEOUT_MS = 4 * 60 * 1000;

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

    const { question, content } = req.body || {};
    const normalizedQuestion =
      typeof question === "string" && question.trim()
        ? question.trim()
        : typeof content === "string" && content.trim()
          ? content.trim()
          : null;

    if (!normalizedQuestion) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'question' field",
      });
    }

    if (!INDIAN_STOCKS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "INDIAN_STOCKS_API_KEY not configured",
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INDIAN_STOCKS_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(INDIAN_STOCKS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": INDIAN_STOCKS_API_KEY,
        },
        body: JSON.stringify({ question: normalizedQuestion }),
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
