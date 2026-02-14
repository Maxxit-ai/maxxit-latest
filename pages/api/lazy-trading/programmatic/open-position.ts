import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface OpenPositionResponse {
  success: boolean;
  orderId?: string;
  tradeId?: string;
  transactionHash?: string;
  txHash?: string;
  status?: string;
  message?: string;
  actualTradeIndex?: number;
  entryPrice?: number;
  slSet?: boolean;
  slError?: string | null;
  result?: any;
  error?: string;
}

/**
 * Open Position
 * Open a new trading position on Ostium
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OpenPositionResponse>
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
      side,
      collateral,
      leverage,
      stopLossPercent,
      deploymentId,
      signalId,
      isTestnet
    } = req.body || {};

    // Validate required fields
    if (!agentAddress || !userAddress || !market || !side || collateral === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: agentAddress, userAddress, market, side, collateral"
      });
    }

    // Call Ostium service to open position
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const openPositionResponse = await fetch(`${ostiumServiceUrl}/open-position`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentAddress,
        userAddress,
        market,
        side,
        collateral,
        leverage: leverage || 10,
        stopLossPercent: stopLossPercent || 0.10,
        deploymentId,
        signalId,
        isTestnet
      }),
    });

    if (!openPositionResponse.ok) {
      const errorText = await openPositionResponse.text();
      console.error("[Ostium] Open position error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to open position from Ostium service",
      });
    }

    const positionData = await openPositionResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      orderId: positionData.orderId,
      tradeId: positionData.tradeId,
      transactionHash: positionData.transactionHash,
      txHash: positionData.txHash,
      status: positionData.status,
      message: positionData.message,
      actualTradeIndex: positionData.actualTradeIndex,
      entryPrice: positionData.entryPrice,
      slSet: positionData.slSet,
      slError: positionData.slError,
      result: positionData.result,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading open position error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to open position",
    });
  }
}
