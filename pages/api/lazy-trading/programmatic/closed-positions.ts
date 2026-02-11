import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface ClosedPositionsResponse {
  success: boolean;
  positions?: any[];
  count?: number;
  totalOrders?: number;
  error?: string;
}

/**
 * Get Position History
 * Get closed positions with PnL information
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClosedPositionsResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { address, count = 50 } = req.body || {};

    if (!address) {
      return res.status(400).json({ success: false, error: "address is required" });
    }

    // Call Ostium service to get closed positions
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const closedPositionsResponse = await fetch(`${ostiumServiceUrl}/closed-positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, count }),
    });

    if (!closedPositionsResponse.ok) {
      const errorText = await closedPositionsResponse.text();
      console.error("[Ostium] Closed positions fetch error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch closed positions from Ostium service",
      });
    }

    const closedPositionsData = await closedPositionsResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      positions: closedPositionsData.positions || [],
      count: closedPositionsData.count || 0,
      totalOrders: closedPositionsData.totalOrders || 0,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading closed positions error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch closed positions",
    });
  }
}
