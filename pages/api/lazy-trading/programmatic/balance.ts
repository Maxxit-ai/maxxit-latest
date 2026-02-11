import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface BalanceResponse {
  success: boolean;
  address?: string;
  usdcBalance?: string;
  ethBalance?: string;
  error?: string;
}

/**
 * Get Account Balance
 * Retrieve USDC and ETH balance for user's Ostium agent wallet
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BalanceResponse>
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

    // Call Ostium service to get balance
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const balanceResponse = await fetch(`${ostiumServiceUrl}/balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!balanceResponse.ok) {
      const errorText = await balanceResponse.text();
      console.error("[Ostium] Balance fetch error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch balance from Ostium service",
      });
    }

    const balanceData = await balanceResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      address,
      usdcBalance: balanceData.usdcBalance,
      ethBalance: balanceData.ethBalance,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading balance error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch balance",
    });
  }
}
