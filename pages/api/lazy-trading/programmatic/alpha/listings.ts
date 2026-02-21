import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/alpha/listings
 *
 * Browse active alpha listings (metadata only -- trade content is paid).
 * Returns listing ID, price, timestamp, and agent's verified metrics.
 *
 * Query params:
 *   commitment — filter by agent commitment
 *   maxPrice   — max price in USDC (e.g. 1.00)
 *   limit      — max results (default: 20, max: 100)
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

    const limit = Math.min(
      Math.max(parseInt(req.query.limit as string) || 20, 1),
      100
    );
    const commitment = req.query.commitment as string | undefined;
    const maxPrice = req.query.maxPrice
      ? parseFloat(req.query.maxPrice as string)
      : undefined;

    const whereClause: any = { active: true };
    if (commitment) {
      whereClause.commitment = commitment;
    }
    if (maxPrice !== undefined) {
      whereClause.price_usdc = { lte: maxPrice };
    }

    const listings = await prismaClient.alpha_listings.findMany({
      where: whereClause,
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        commitment: true,
        on_chain_listing_id: true,
        price_usdc: true,
        active: true,
        created_at: true,
      },
    });

    const commitments = [...new Set(listings.map((l: any) => l.commitment))];
    const latestProofs = await prismaClient.proof_records.findMany({
      where: {
        commitment: { in: commitments },
        status: "VERIFIED",
      },
      orderBy: { verified_at: "desc" },
      distinct: ["commitment"],
      select: {
        commitment: true,
        total_pnl: true,
        trade_count: true,
        win_count: true,
        total_collateral: true,
        proof_timestamp: true,
      },
    });

    const proofMap: Record<string, any> = {};
    for (const proof of latestProofs) {
      const winRate =
        proof.trade_count > 0
          ? Math.round((proof.win_count / proof.trade_count) * 10000) / 100
          : 0;
      proofMap[proof.commitment] = {
        totalPnl: proof.total_pnl?.toString() || "0",
        tradeCount: proof.trade_count || 0,
        winRate,
        totalCollateral: proof.total_collateral?.toString() || "0",
        proofTimestamp: proof.proof_timestamp?.toISOString() || null,
      };
    }

    const result = listings.map((listing: any) => ({
      listingId: listing.id,
      onChainListingId: listing.on_chain_listing_id,
      commitment: listing.commitment,
      priceUsdc: listing.price_usdc.toString(),
      createdAt: listing.created_at.toISOString(),
      agentMetrics: proofMap[listing.commitment] || null,
    }));

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      listings: result,
      count: result.length,
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/listings] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch alpha listings",
      message: error.message,
    });
  }
}
