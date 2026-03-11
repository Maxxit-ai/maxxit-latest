import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../lib/lazy-trading-api";

const prismaClient = prisma as any;
const RESEARCH_API_URL = "https://research.maxxit.ai/asksurf/ask";
const RESEARCH_API_KEY = process.env.RESEARCH_API_KEY;

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

    const { content, deepResearch = false } = req.body || {};

    if (!content || typeof content !== "string") {
      return res.status(400).json({ success: false, error: "Missing or invalid 'content' field" });
    }

    if (typeof deepResearch !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "Invalid 'deepResearch' field; expected boolean",
      });
    }

    if (!RESEARCH_API_KEY) {
      return res.status(500).json({ success: false, error: "RESEARCH_API_KEY not configured" });
    }

    const response = await fetch(RESEARCH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": RESEARCH_API_KEY,
      },
      body: JSON.stringify({ question: content, deepResearch }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: errorText || `Research API error: ${response.statusText}`,
      });
    }

    const { answer: aiText } = await response.json();

    if (!aiText || typeof aiText !== "string") {
      return res.status(502).json({
        success: false,
        error: "Research API returned no research text",
      });
    }

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({ success: true, ai_text: aiText });
  } catch (error: any) {
    console.error("[API] Lazy trading research error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch research",
    });
  }
}
