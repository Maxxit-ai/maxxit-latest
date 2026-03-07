import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

const SURF_API_BASE = "https://api.asksurf.ai/muninn/v4/chat/sessions";
const SURF_SESSION_ID = "b0ea3fe6-70af-477d-ac15-49dac1eb55c6";
const SURF_AUTH_TOKEN = process.env.SURF_API_TOKEN;
console.log(SURF_AUTH_TOKEN)

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
      return res.status(400).json({ success: false, error: "Missing or invalid 'content' field" });
    }

    if (!SURF_AUTH_TOKEN) {
      return res.status(500).json({ success: false, error: "SURF_API_TOKEN not configured" });
    }

    const url = `${SURF_API_BASE}/${SURF_SESSION_ID}/sse?session_type=V2&platform=WEB&lang=en`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${SURF_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        request_id: crypto.randomUUID().replace(/-/g, "").slice(0, 20),
        type: "chat_request",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: content }],
          },
        ],
      }),
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Surf API error: ${response.statusText}`,
      });
    }

    const body = response.body;
    if (!body) {
      return res.status(500).json({ error: "No response body from Surf API" });
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let aiText: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          if (
            parsed?.type === "stream_event" &&
            parsed?.event_type === "custom" &&
            parsed?.data?.event_data?.type === "FINAL"
          ) {
            aiText = parsed.data.event_data.ai_text;
          }
        } catch {
          // skip non-JSON lines
        }
      }
    }

    if (!aiText) {
      return res.status(502).json({ success: false, error: "No FINAL response received from the API" });
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
