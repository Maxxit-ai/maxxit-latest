import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/verify
 *
 * Verify that purchased alpha content matches the stored content hash.
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

    const { listingId, content } = req.body || {};

    if (!listingId || !content) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: listingId, content",
      });
    }

    const listing = await prismaClient.alpha_listings.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        content_hash: true,
        commitment: true,
        on_chain_listing_id: true,
      },
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Alpha listing not found",
      });
    }

    const contentString =
      typeof content === "string" ? content : JSON.stringify(content);
    const computedHash = createHash("sha256")
      .update(contentString)
      .digest("hex");

    const verified = computedHash === listing.content_hash;

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      verified,
      listingId: listing.id,
      commitment: listing.commitment,
      onChainListingId: listing.on_chain_listing_id,
      storedHash: listing.content_hash,
      computedHash,
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/verify] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to verify alpha content",
      message: error.message,
    });
  }
}
