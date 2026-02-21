import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/alpha/agents
 *
 * Discover agents with ZK-verified performance metrics.
 * Returns commitments (pseudonymous) + latest proof metrics.
 * Does NOT reveal wallet addresses.
 *
 * Query params:
 *   minWinRate  — minimum win rate (0-100, e.g. 60 = 60%)
 *   minTrades   — minimum total trade count
 *   limit       — max results (default: 20, max: 100)
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
    const minWinRate = req.query.minWinRate
      ? parseFloat(req.query.minWinRate as string)
      : undefined;
    const minTrades = req.query.minTrades
      ? parseInt(req.query.minTrades as string)
      : undefined;

    const proofRecords = await prismaClient.proof_records.findMany({
      where: {
        status: "VERIFIED",
        ...(minTrades !== undefined && { trade_count: { gte: minTrades } }),
      },
      orderBy: { verified_at: "desc" },
      distinct: ["commitment"],
      take: limit * 2,
      include: {
        agents: {
          select: {
            id: true,
            alpha_default_price: true,
          },
        },
      },
    });

    let agents = proofRecords.map((proof: any) => {
      const winRate =
        proof.trade_count > 0
          ? Math.round((proof.win_count / proof.trade_count) * 10000) / 100
          : 0;

      return {
        commitment: proof.commitment,
        totalPnl: proof.total_pnl?.toString() || "0",
        tradeCount: proof.trade_count || 0,
        winCount: proof.win_count || 0,
        winRate,
        totalCollateral: proof.total_collateral?.toString() || "0",
        proofTimestamp: proof.proof_timestamp?.toISOString() || null,
        verifiedAt: proof.verified_at?.toISOString() || null,
        defaultAlphaPrice: proof.agents?.alpha_default_price?.toString() || null,
      };
    });

    if (minWinRate !== undefined) {
      agents = agents.filter((a: any) => a.winRate >= minWinRate);
    }

    agents = agents.slice(0, limit);

    const alphaCountMap: Record<string, number> = {};
    if (agents.length > 0) {
      const commitments = agents.map((a: any) => a.commitment);
      const counts = await prismaClient.alpha_listings.groupBy({
        by: ["commitment"],
        where: {
          commitment: { in: commitments },
          active: true,
        },
        _count: { id: true },
      });
      for (const c of counts) {
        alphaCountMap[c.commitment] = c._count.id;
      }
    }

    const result = agents.map((a: any) => ({
      ...a,
      activeAlphaCount: alphaCountMap[a.commitment] || 0,
    }));

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      agents: result,
      count: result.length,
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/agents] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch verified agents",
      message: error.message,
    });
  }
}
