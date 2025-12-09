import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id: agentId } = req.query;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Fetch all positions for this agent
    const positions = await prisma.position.findMany({
      where: {
        agentId,
      },
      orderBy: {
        opened_at: 'desc',
      },
      include: {
        signal: {
          select: {
            symbol: true,
            side: true,
          },
        },
      },
    });

    // Transform positions to include calculated fields
    const transformedPositions = positions.map((position) => {
      const entryPrice = parseFloat(position.entryPrice?.toString() || '0');
      const currentPrice = parseFloat(position.currentPrice?.toString() || entryPrice.toString());
      const size = parseFloat(position.size?.toString() || '0');
      const realizedPnl = parseFloat(position.realizedPnl?.toString() || '0');
      const unrealizedPnl = parseFloat(position.unrealizedPnl?.toString() || '0');
      
      const totalPnl = realizedPnl + unrealizedPnl;
      const pnlPercentage = entryPrice > 0 ? (totalPnl / (size * entryPrice)) * 100 : 0;

      return {
        id: position.id,
        agentId: position.agentId,
        symbol: position.signal?.symbol || 'UNKNOWN',
        side: position.signal?.side || 'LONG',
        entryPrice,
        currentPrice,
        size,
        pnl: totalPnl,
        pnlPercentage,
        status: position.status,
        openedAt: position.openedAt,
        closedAt: position.closedAt,
      };
    });

    return res.status(200).json(transformedPositions);
  } catch (error: any) {
    console.error('[AgentPositions] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to fetch positions',
    });
  }
  // Note: Don't disconnect - using singleton
}

