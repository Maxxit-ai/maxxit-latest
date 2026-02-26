import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/flag
 *
 * Flag a verified trade as alpha and list it for sale.
 *
 * Body:
 *   proofId:   string  — UUID of a VERIFIED proof record (from /alpha/generate-proof)
 *   priceUsdc: number  — listing price in USDC
 *   token:     string  — token symbol (e.g. "ETH", "BTC")
 *   side:      string  — "long" or "short"
 *   leverage:  number  — (optional) leverage multiplier, default 10
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

    const { proofId, priceUsdc, token, side, leverage } = req.body || {};

    if (!proofId || priceUsdc === undefined || !token || !side) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: proofId, priceUsdc, token, side",
      });
    }

    if (!priceUsdc || Number(priceUsdc) <= 0) {
      return res.status(400).json({
        success: false,
        error: "priceUsdc must be greater than 0",
      });
    }

    const validSides = ["long", "short"];
    if (!validSides.includes(side.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'side must be "long" or "short"',
      });
    }

    const userWallet = apiKeyRecord.user_wallet;
    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: "No wallet associated with this API key",
      });
    }

    // ── 1. Look up the proof record ──────────────────────────────────
    const proofRecord = await prismaClient.proof_records.findUnique({
      where: { id: proofId },
      include: {
        agents: {
          select: { id: true, creator_wallet: true, commitment: true },
        },
      },
    });

    if (!proofRecord) {
      return res.status(404).json({
        success: false,
        error: "Proof record not found",
      });
    }

    if (proofRecord.status !== "VERIFIED") {
      return res.status(400).json({
        success: false,
        error: `Proof is not verified yet. Current status: ${proofRecord.status}`,
      });
    }

    // Verify ownership
    if (proofRecord.agents?.creator_wallet !== userWallet) {
      return res.status(403).json({
        success: false,
        error: "This proof does not belong to your account",
      });
    }

    const agent = proofRecord.agents;
    if (!agent.commitment) {
      return res.status(400).json({
        success: false,
        error: "Agent has no commitment. This shouldn't happen for a verified proof.",
      });
    }

    const tradeId = proofRecord.trade_id;
    if (!tradeId) {
      return res.status(400).json({
        success: false,
        error: "Proof has no trade_id. Re-generate the proof with a tradeId.",
      });
    }

    // ── 2. Prevent duplicate listing for same trade ──────────────────
    const existingListing = await prismaClient.alpha_listings.findFirst({
      where: { trade_id: tradeId, active: true },
    });
    if (existingListing) {
      return res.status(409).json({
        success: false,
        error: "This trade already has an active listing",
        existingListingId: existingListing.id,
      });
    }

    // ── 3. Build listing content ─────────────────────────────────────
    const actualLeverage = leverage || 10;
    const winRate =
      proofRecord.trade_count > 0
        ? Math.round((proofRecord.win_count / proofRecord.trade_count) * 10000) / 100
        : 0;

    // alpha_content: revealed to buyers after purchase
    // Does NOT include tradeId — that remains private
    const alphaContent = {
      token: token.toUpperCase(),
      side: side.toLowerCase(),
      leverage: actualLeverage,
      venue: "OSTIUM",
      proofTxHash: proofRecord.tx_hash || null,
      metrics: {
        tradeCount: proofRecord.trade_count,
        winCount: proofRecord.win_count,
        winRate,
        totalPnl: proofRecord.total_pnl ? Number(proofRecord.total_pnl) : 0,
        totalCollateral: proofRecord.total_collateral
          ? Number(proofRecord.total_collateral)
          : 0,
      },
      timestamp: new Date().toISOString(),
    };

    // Deterministic hash for content verification
    const sortKeys = (obj: any): any => {
      if (typeof obj !== "object" || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(sortKeys);
      return Object.keys(obj)
        .sort()
        .reduce((acc: any, key: string) => {
          acc[key] = sortKeys(obj[key]);
          return acc;
        }, {});
    };

    const contentHash = createHash("sha256")
      .update(JSON.stringify(sortKeys(alphaContent)))
      .digest("hex");

    // ── 4. Create the listing ────────────────────────────────────────
    const listing = await prismaClient.alpha_listings.create({
      data: {
        agent_id: agent.id,
        commitment: agent.commitment,
        trade_id: tradeId,
        token: token.toUpperCase(),
        side: side.toLowerCase(),
        leverage: actualLeverage,
        position_pct: 10000,
        price_usdc: priceUsdc,
        content_hash: contentHash,
        alpha_content: alphaContent,
        active: true,
      },
    });

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Alpha listed successfully",
      listingId: listing.id,
      tradeId,
      commitment: agent.commitment,
      priceUsdc: priceUsdc.toString(),
      contentHash,
      listing: {
        token: token.toUpperCase(),
        side: side.toLowerCase(),
        leverage: actualLeverage,
      },
      proofMetrics: {
        tradeCount: proofRecord.trade_count,
        winCount: proofRecord.win_count,
        winRate,
        totalPnl: proofRecord.total_pnl?.toString() || "0",
        proofTxHash: proofRecord.tx_hash,
      },
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/flag] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to flag position as alpha",
      message: error.message,
    });
  }
}
