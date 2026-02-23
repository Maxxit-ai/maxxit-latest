import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../../lib/lazy-trading-api";
import { verifyUsdcTransfer } from "../../../../../../lib/usdc-transfer";

const prismaClient = prisma as any;

const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
const ARBITRUM_MAINNET_CHAIN_ID = 42161;
// const USDC_CONTRACT_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
const USDC_CONTRACT_SEPOLIA = "0xe73B11Fb1e3eeEe8AF2a23079A4410Fe1B370548";
const USDC_CONTRACT_MAINNET = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

/**
 * GET /api/lazy-trading/programmatic/alpha/purchase/:listingId
 *
 * x402 payment flow for purchasing alpha content:
 *
 * Phase 1 — No X-Payment header:
 *   Returns 402 with paymentDetails (payTo, price, asset, network).
 *   Consumer sends USDC on-chain to the payTo address.
 *
 * Phase 2 — X-Payment header present (tx hash):
 *   Verifies the USDC transfer on-chain:
 *   - Transaction confirmed?
 *   - Correct recipient (producer's profit_receiver_address)?
 *   - Correct amount (listing price_usdc)?
 *   - Not already claimed (replay protection via alpha_purchases.tx_hash)?
 *   On success → returns full alpha content + payment receipt.
 *
 * Idempotent: If the consumer already purchased this listing, returns alpha
 * content without requiring another payment.
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

    // ── Fetch listing + producer's payment address ────────────────────────
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

    // ── Determine network ─────────────────────────────────────────────────
    const isTestnet = process.env.ALPHA_TESTNET_MODE !== "false";
    const chainId = isTestnet ? ARBITRUM_SEPOLIA_CHAIN_ID : ARBITRUM_MAINNET_CHAIN_ID;
    const usdcContract = isTestnet ? USDC_CONTRACT_SEPOLIA : USDC_CONTRACT_MAINNET;
    const networkName = isTestnet ? "Arbitrum Sepolia" : "Arbitrum One";
    const networkSlug = isTestnet ? "arbitrum-sepolia" : "arbitrum-one";

    // ── Idempotent re-purchase check ──────────────────────────────────────
    // If this consumer already purchased this listing, return alpha directly
    const existingPurchase = await prismaClient.alpha_purchases.findFirst({
      where: {
        listing_id: listingId,
        buyer_wallet: apiKeyRecord.user_wallet.toLowerCase(),
      },
    });

    if (existingPurchase) {
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
        payment: {
          txHash: existingPurchase.tx_hash,
          amount: existingPurchase.amount_usdc.toString(),
          asset: "USDC",
          from: existingPurchase.buyer_agent_addr,
          to: existingPurchase.seller_agent_addr,
          network: networkSlug,
          alreadyPurchased: true,
        },
        network: networkSlug,
      });
    }

    // ── Read the X-Payment header ─────────────────────────────────────────
    const paymentTxHash = req.headers["x-payment"] as string | undefined;

    // ── Phase 1: No payment → return 402 with payment details ─────────────
    if (!paymentTxHash) {
      const payTo = listing.agents?.profit_receiver_address;

      // Guard: reject orphaned listings that have no payable agent address
      if (!payTo) {
        return res.status(404).json({
          success: false,
          error: "Listing agent not found or has no payment address",
        });
      }

      const price = listing.price_usdc.toString();

      res.setHeader("X-Payment-Required", "true");
      res.setHeader("X-Payment-Network", `eip155:${chainId}`);
      res.setHeader("X-Payment-Amount", price);
      res.setHeader("X-Payment-Asset", usdcContract);
      res.setHeader("X-Payment-Receiver", payTo);

      return res.status(402).json({
        success: false,
        error: "Payment required",
        paymentDetails: {
          price,
          asset: "USDC",
          assetContract: usdcContract,
          network: `eip155:${chainId}`,
          networkName,
          payTo,
          listingId: listing.id,
          commitment: listing.commitment,
        },
      });
    }

    // ── Phase 2: X-Payment header present → verify on-chain ───────────────
    const payTo = listing.agents?.profit_receiver_address;
    if (!payTo) {
      return res.status(404).json({
        success: false,
        error: "Listing agent not found or has no payment address",
      });
    }

    // Validate tx hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(paymentTxHash)) {
      return res.status(400).json({
        success: false,
        error: "Invalid X-Payment header: must be a valid transaction hash (0x + 64 hex chars)",
      });
    }

    // Replay protection: check if this tx hash was already used for any purchase
    const existingTxUse = await prismaClient.alpha_purchases.findUnique({
      where: { tx_hash: paymentTxHash.toLowerCase() },
    });
    if (existingTxUse) {
      return res.status(409).json({
        success: false,
        error: "This transaction hash has already been used for a purchase (replay protection)",
        existingListingId: existingTxUse.listing_id,
      });
    }

    // Verify the USDC transfer on-chain
    const verification = await verifyUsdcTransfer(
      paymentTxHash,
      payTo,
      listing.price_usdc.toString(),
      isTestnet
    );

    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        error: "Payment verification failed",
        details: verification.error,
        expectedTo: payTo,
        expectedAmount: listing.price_usdc.toString(),
      });
    }

    // ── Record the purchase ───────────────────────────────────────────────
    try {
      await prismaClient.alpha_purchases.create({
        data: {
          listing_id: listingId,
          buyer_wallet: apiKeyRecord.user_wallet.toLowerCase(),
          buyer_agent_addr: verification.from,
          seller_agent_addr: payTo,
          amount_usdc: parseFloat(listing.price_usdc.toString()),
          tx_hash: paymentTxHash.toLowerCase(),
          network: networkSlug,
        },
      });
    } catch (dbError: any) {
      // Handle race condition: unique constraint violation on tx_hash
      if (dbError.code === "P2002") {
        return res.status(409).json({
          success: false,
          error: "This transaction hash has already been used for a purchase (replay protection)",
        });
      }
      throw dbError;
    }

    // Update API key usage
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    // ── Return alpha content + payment receipt ────────────────────────────
    return res.status(200).json({
      success: true,
      listingId: listing.id,
      commitment: listing.commitment,
      contentHash: listing.content_hash,
      alpha: listing.alpha_content,
      payment: {
        txHash: paymentTxHash,
        amount: listing.price_usdc.toString(),
        asset: "USDC",
        from: verification.from,
        to: payTo,
        network: networkSlug,
      },
      network: networkSlug,
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
