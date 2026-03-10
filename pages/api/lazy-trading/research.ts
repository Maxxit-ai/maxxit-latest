import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

// Surf session service running on the VPS (Playwright-based persistent session)
const SURF_SERVICE_URL =
  process.env.SURF_SESSION_SERVICE_URL || "http://localhost:5010";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid API key" });
    }

    const { content } = req.body || {};

    if (!content || typeof content !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Missing or invalid 'content' field" });
    }

    // Call the local surf session service which maintains a persistent
    // browser profile and handles token capture / SSE parsing internally
    const response = await fetch(`${SURF_SERVICE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return res.status(response.status).json({
        success: false,
        error: data.error || "Surf session service error",
      });
    }

    if (!data.ai_text) {
      return res.status(502).json({
        success: false,
        error: "No response received from research service",
      });
    }

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({ success: true, ai_text: data.ai_text });
  } catch (error: any) {
    console.error("[API] Lazy trading research error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch research",
    });
  }
}
