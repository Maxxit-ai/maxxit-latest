import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
const USDC_CONTRACT_SEPOLIA = "0xe73B11Fb1e3eeEe8AF2a23079A4410Fe1B370548";

/**
 * GET /api/lazy-trading/programmatic/alpha/purchase/:listingId
 *
 * Purchase full alpha content for a listing via x402 payment.
 * If no x-payment header → return 402 with payment details.
 * Testnet: pass header "X-Payment-Verified: true" to skip payment.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { listingId } = req.query;
    if (!listingId || typeof listingId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: listingId",
      });
    }

    const listing = await prismaClient.alpha_listings.findUnique({
      where: { id: listingId },
      include: {
        agents: {
          select: {
            profit_receiver_address: true,
          },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Alpha listing not found",
      });
    }

    if (!listing.active) {
      return res.status(410).json({
        success: false,
        error: "Alpha listing is no longer active",
      });
    }

    const paymentHeader = req.headers["x-payment"] as string | undefined;
    const testnetPaymentVerified =
      req.headers["x-payment-verified"] === "true";

    if (!paymentHeader && !testnetPaymentVerified) {
      const payTo = listing.agents?.profit_receiver_address;
      const price = listing.price_usdc.toString();

      res.setHeader("X-Payment-Required", "true");
      res.setHeader("X-Payment-Network", `eip155:${ARBITRUM_SEPOLIA_CHAIN_ID}`);
      res.setHeader("X-Payment-Amount", price);
      res.setHeader("X-Payment-Asset", USDC_CONTRACT_SEPOLIA);
      res.setHeader("X-Payment-Receiver", payTo || "");

      return res.status(402).json({
        success: false,
        error: "Payment required",
        paymentDetails: {
          price,
          asset: "USDC",
          assetContract: USDC_CONTRACT_SEPOLIA,
          network: `eip155:${ARBITRUM_SEPOLIA_CHAIN_ID}`,
          networkName: "Arbitrum Sepolia",
          payTo,
          listingId: listing.id,
          commitment: listing.commitment,
        },
      });
    }

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      listingId: listing.id,
      commitment: listing.commitment,
      contentHash: listing.content_hash,
      alpha: listing.alpha_content,
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/purchase] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to process alpha purchase",
      message: error.message,
    });
  }
}
