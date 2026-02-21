import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/execute
 *
 * Execute a purchased alpha trade on Ostium using the consumer's own addresses.
 */
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

    const {
      alphaContent,
      agentAddress,
      userAddress,
      collateral,
      leverageOverride,
    } = req.body || {};

    if (!alphaContent || !agentAddress || !userAddress || collateral === undefined) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: alphaContent, agentAddress, userAddress, collateral",
      });
    }

    const { token, side, leverage: alphaLeverage } = alphaContent;
    if (!token || !side) {
      return res.status(400).json({
        success: false,
        error: "alphaContent must include token and side",
      });
    }

    const leverage = leverageOverride || alphaLeverage || 10;

    const ostiumServiceUrl =
      process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const openPositionResponse = await fetch(
      `${ostiumServiceUrl}/open-position`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentAddress,
          userAddress,
          market: token,
          side: side.toLowerCase(),
          collateral,
          leverage,
          isTestnet: true,
        }),
      }
    );

    if (!openPositionResponse.ok) {
      const errorText = await openPositionResponse.text();
      console.error("[Alpha Execute] Ostium open-position error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to execute alpha trade on Ostium",
      });
    }

    const positionData = await openPositionResponse.json();

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: `Alpha trade executed: ${side.toUpperCase()} ${token}`,
      orderId: positionData.orderId,
      tradeId: positionData.tradeId,
      transactionHash: positionData.transactionHash,
      txHash: positionData.txHash,
      status: positionData.status,
      actualTradeIndex: positionData.actualTradeIndex,
      entryPrice: positionData.entryPrice,
      executedAlpha: {
        token,
        side,
        leverage,
        collateral,
      },
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/execute] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to execute alpha trade",
      message: error.message,
    });
  }
}
