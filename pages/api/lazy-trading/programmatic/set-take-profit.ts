import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface SetTakeProfitResponse {
  success: boolean;
  message?: string;
  tpPrice?: number;
  error?: string;
}

/**
 * Set Take Profit
 * Set or update take-profit for an existing position
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetTakeProfitResponse>
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
      takeProfitPercent,
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

    // Call Ostium service to set take profit
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const setTpResponse = await fetch(`${ostiumServiceUrl}/set-take-profit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentAddress,
        userAddress,
        market,
        tradeIndex,
        takeProfitPercent: takeProfitPercent || 0.30,
        entryPrice,
        pairIndex,
        side: side || 'long',
        useDelegation: true,
        isTestnet
      }),
    });

    if (!setTpResponse.ok) {
      const errorText = await setTpResponse.text();
      console.error("[Ostium] Set take profit error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to set take profit from Ostium service",
      });
    }

    const tpData = await setTpResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: tpData.message,
      tpPrice: tpData.tpPrice,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading set take profit error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to set take profit",
    });
  }
}
