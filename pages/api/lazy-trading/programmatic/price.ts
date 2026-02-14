import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

interface PriceResponse {
  success: boolean;
  token?: string;
  price?: number;
  isMarketOpen?: boolean;
  isDayTradingClosed?: boolean;
  error?: string;
}

/**
 * Fetch Token Price
 * Get current market price for a token from Ostium price feed
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PriceResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { token, isTestnet } = req.query || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: "token query parameter is required"
      });
    }

    // Call Ostium service to get price
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    // Build query string
    const queryParams = new URLSearchParams();
    if (isTestnet !== undefined) {
      queryParams.append('isTestnet', String(isTestnet));
    }

    const priceResponse = await fetch(`${ostiumServiceUrl}/price/${token.toUpperCase()}?${queryParams.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    console.log(priceResponse)

    if (!priceResponse.ok) {
      const errorText = await priceResponse.text();
      console.error("[Ostium] Price fetch error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch price from Ostium service",
      });
    }

    const priceData = await priceResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      token: priceData.token,
      price: priceData.price,
      isMarketOpen: priceData.isMarketOpen,
      isDayTradingClosed: priceData.isDayTradingClosed,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading price error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch price",
    });
  }
}
