import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface PositionsResponse {
  success: boolean;
  positions?: any[];
  totalPositions?: number;
  error?: string;
}

/**
 * Get Portfolio Positions
 * Get all open positions for user's Ostium trading account
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PositionsResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { address } = req.body || {};

    if (!address) {
      return res.status(400).json({ success: false, error: "address is required" });
    }

    // Call Ostium service to get positions
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const positionsResponse = await fetch(`${ostiumServiceUrl}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!positionsResponse.ok) {
      const errorText = await positionsResponse.text();
      console.error("[Ostium] Positions fetch error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch positions from Ostium service",
      });
    }

    const positionsData = await positionsResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      positions: positionsData.positions || [],
      totalPositions: positionsData.positions?.length || 0,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading positions error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch positions",
    });
  }
}
