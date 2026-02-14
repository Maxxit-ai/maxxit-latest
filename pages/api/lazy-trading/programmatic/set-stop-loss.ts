import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface SetStopLossResponse {
  success: boolean;
  message?: string;
  slPrice?: number;
  liquidationPrice?: number;
  adjusted?: boolean;
  error?: string;
}

/**
 * Set Stop Loss
 * Set or update stop-loss for an existing position
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetStopLossResponse>
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
      tradeIndex,
      stopLossPercent,
      entryPrice,
      pairIndex,
      side,
      isTestnet
    } = req.body || {};

    // Validate required fields
    if (!agentAddress || !userAddress || !market || tradeIndex === undefined || !entryPrice || pairIndex === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: agentAddress, userAddress, market, tradeIndex, entryPrice, pairIndex"
      });
    }

    // Call Ostium service to set stop loss
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const setSlResponse = await fetch(`${ostiumServiceUrl}/set-stop-loss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentAddress,
        userAddress,
        market,
        tradeIndex,
        stopLossPercent: stopLossPercent || 0.10,
        entryPrice,
        pairIndex,
        side: side || 'long',
        useDelegation: true,
        isTestnet
      }),
    });

    if (!setSlResponse.ok) {
      const errorText = await setSlResponse.text();
      console.error("[Ostium] Set stop loss error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to set stop loss from Ostium service",
      });
    }

    const slData = await setSlResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: slData.message,
      slPrice: slData.slPrice,
      liquidationPrice: slData.liquidationPrice,
      adjusted: slData.adjusted,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading set stop loss error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to set stop loss",
    });
  }
}
