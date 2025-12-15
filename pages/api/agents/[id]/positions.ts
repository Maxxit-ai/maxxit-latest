import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const toNumber = (value: any) => {
  if (value === null || value === undefined) return 0;
  const asNumber = Number.parseFloat(value?.toString?.() ?? value);
  return Number.isFinite(asNumber) ? asNumber : 0;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id: agentId } = req.query;

    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({ error: "Invalid agent ID" });
    }

    const {
      status,
      side,
      venue,
      symbol,
      source,
      from,
      to,
      page = "1",
      pageSize = `${DEFAULT_PAGE_SIZE}`,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSizeParsed = Math.max(
      1,
      Math.min(
        parseInt(pageSize as string, 10) || DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE
      )
    );
    const skip = (pageNum - 1) * pageSizeParsed;

    const where: any = {
      agent_deployments: {
        agent_id: agentId,
      },
    };

    if (status && status !== "ALL") where.status = status;
    if (side && side !== "ALL") where.side = side;
    if (venue && venue !== "ALL") where.venue = venue;
    if (source && source !== "ALL") where.source = source;
    if (symbol) {
      where.token_symbol = {
        contains: symbol as string,
        mode: "insensitive",
      };
    }
    if (from || to) {
      where.opened_at = {};
      if (from) where.opened_at.gte = new Date(from as string);
      if (to) where.opened_at.lte = new Date(to as string);
    }

    const [total, openCount, closedCount, pnlAgg, positions, notionalParts] =
      await Promise.all([
        prisma.positions.count({ where }),
        prisma.positions.count({ where: { ...where, status: "OPEN" } }),
        prisma.positions.count({ where: { ...where, status: "CLOSED" } }),
        prisma.positions.aggregate({
          _sum: { pnl: true },
          where,
        }),
        prisma.positions.findMany({
          where,
          orderBy: {
            opened_at: "desc",
          },
          skip,
          take: pageSizeParsed,
        }),
        prisma.positions.findMany({
          where,
          select: {
            qty: true,
            entry_price: true,
          },
        }),
      ]);

    const totalNotional = notionalParts.reduce((sum, part) => {
      return sum + toNumber(part.qty) * toNumber(part.entry_price);
    }, 0);
    const totalPnl = toNumber(pnlAgg._sum.pnl);

    // Transform positions to include calculated fields
    const transformedPositions = positions.map((position) => {
      const entryPrice = toNumber(position.entry_price);
      const currentPrice = toNumber(position.current_price) || entryPrice || 0;
      const size = toNumber(position.qty);
      const pnl = toNumber(position.pnl);
      const pnlPercentage =
        entryPrice > 0 && size > 0 ? (pnl / (size * entryPrice)) * 100 : 0;

      return {
        id: position.id,
        deploymentId: position.deployment_id,
        signalId: position.signal_id,
        tokenSymbol: position.token_symbol,
        venue: position.venue,
        side: position.side,
        entryPrice,
        currentPrice,
        exitPrice: position.exit_price ? toNumber(position.exit_price) : null,
        stopLoss: position.stop_loss ? toNumber(position.stop_loss) : null,
        takeProfit: position.take_profit
          ? toNumber(position.take_profit)
          : null,
        size,
        pnl,
        pnlPercentage,
        status: position.status,
        source: position.source,
        exitReason: position.exit_reason,
        openedAt: position.opened_at,
        closedAt: position.closed_at,
      };
    });

    return res.status(200).json({
      data: transformedPositions,
      page: pageNum,
      pageSize: pageSizeParsed,
      total,
      summary: {
        openCount,
        closedCount,
        totalPnl,
        totalNotional,
      },
    });
  } catch (error: any) {
    console.error("[AgentPositions] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to fetch positions",
    });
  }
  // Note: Don't disconnect - using singleton
}
