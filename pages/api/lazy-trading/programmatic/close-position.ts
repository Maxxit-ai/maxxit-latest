import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface ClosePositionResponse {
  success: boolean;
  result?: {
    txHash?: string;
    market?: string;
    closePnl?: number;
  };
  closePnl?: number;
  message?: string;
  alreadyClosed?: boolean;
  error?: string;
}

/**
 * Close Position
 * Close an existing trading position on Ostium
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClosePositionResponse>
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
      agentAddress,
      userAddress,
      market,
      tradeId,
      actualTradeIndex,
      isTestnet
    } = req.body || {};

    // Validate required fields
    if (!agentAddress || !userAddress || !market) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: agentAddress, userAddress, market"
      });
    }

    // Call Ostium service to close position
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const closePositionResponse = await fetch(`${ostiumServiceUrl}/close-position`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentAddress,
        userAddress,
        market,
        tradeId,
        actualTradeIndex,
        isTestnet
      }),
    });

    if (!closePositionResponse.ok) {
      const errorText = await closePositionResponse.text();
      console.error("[Ostium] Close position error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to close position from Ostium service",
      });
    }

    const positionData = await closePositionResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      result: positionData.result,
      closePnl: positionData.closePnl,
      message: positionData.message,
      alreadyClosed: positionData.alreadyClosed,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading close position error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to close position",
    });
  }
}
