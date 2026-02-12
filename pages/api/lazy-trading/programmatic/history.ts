import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";

import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface HistoryResponse {
  success: boolean;
  history?: any[];
  count?: number;
  error?: string;
  details?: {
    url: string;
    status: number;
    statusText: string;
    errorBody: string;
  };
}

/**
 * Get Position History
 * Get raw trading history (includes open, close, cancelled orders, etc.)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HistoryResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // Verify API key
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { address, count = 50 } = req.body || {};

    if (!address) {
      return res.status(400).json({ success: false, error: "Address is required" });
    }

    // Call Ostium service to get trading history
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";
    const historyUrl = `${ostiumServiceUrl}/history`;

    console.log("[Ostium] Fetching history from:", historyUrl);

    const historyResponse = await fetch(historyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, count }),
    });

    if (!historyResponse.ok) {
      const errorText = await historyResponse.text();
      console.error("[Ostium] History fetch error:", {
        url: historyUrl,
        status: historyResponse.status,
        statusText: historyResponse.statusText,
        errorBody: errorText,
      });
      return res.status(500).json({
        success: false,
        error: "Failed to fetch history from Ostium service",
        details: {
          url: historyUrl,
          status: historyResponse.status,
          statusText: historyResponse.statusText,
          errorBody: errorText,
        },
      });
    }

    const historyData = await historyResponse.json();

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      history: historyData.history || [],
      count: historyData.count || 0,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading history error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch history",
    });
  }
}
