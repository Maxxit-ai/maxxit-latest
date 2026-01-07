import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

/**
 * API to list top traders ordered by impact_factor
 * GET /api/top-traders?limit=10
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const topTraders = await prisma.top_traders.findMany({
      take: limit,
      orderBy: {
        impact_factor: "desc",
      },
    });

    // Get agent counts using raw query (works before Prisma client regeneration)
    const traderIds = topTraders.map((t) => t.id);
    const countResults = await prisma.$queryRaw<
      Array<{ top_trader_id: string; count: bigint }>
    >`
      SELECT top_trader_id, COUNT(*)::bigint as count
      FROM agent_top_traders
      WHERE top_trader_id = ANY(${traderIds}::uuid[])
      GROUP BY top_trader_id
    `;

    const countMap = new Map(
      countResults.map((r) => [r.top_trader_id, Number(r.count)])
    );

    // Convert to camelCase for frontend
    const formatted = topTraders.map((trader: any) => ({
      id: trader.id,
      walletAddress: trader.wallet_address,
      totalVolume: trader.total_volume.toString(),
      totalClosedVolume: trader.total_closed_volume.toString(),
      totalPnl: trader.total_pnl.toString(),
      totalProfitTrades: trader.total_profit_trades,
      totalLossTrades: trader.total_loss_trades,
      totalTrades: trader.total_trades,
      lastActiveAt: trader.last_active_at,
      edgeScore: trader.edge_score,
      consistencyScore: trader.consistency_score,
      stakeScore: trader.stake_score,
      freshnessScore: trader.freshness_score,
      impactFactor: trader.impact_factor,
      createdAt: trader.created_at,
      updatedAt: trader.updated_at,
      _count: {
        agents: countMap.get(trader.id) || 0,
      },
    }));

    return res.status(200).json({
      success: true,
      topTraders: formatted,
    });
  } catch (error: any) {
    console.error("[API] Error fetching top traders:", error);
    return res.status(500).json({ error: error.message });
  }
}
