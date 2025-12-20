import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
/**
 * Admin endpoint to update APR and Sharpe metrics for an agent
 * 
 * Calculates:
 * - APR 30d, 90d, Since Inception
 * - Sharpe 30d (simplified)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agentId } = req.query;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'agentId query param required' });
    }

    console.log(`[ADMIN] Updating metrics for agent ${agentId}`);

    // Get all closed positions for this agent
    const deployments = await prisma.agentDeployment.findMany({
      where: { agentId },
      select: { id: true },
    });

    const deploymentIds = deployments.map(d => d.id);

    const positions = await prisma.position.findMany({
      where: {
        deploymentId: { in: deploymentIds },
        closedAt: { not: null },
      },
      orderBy: { closedAt: 'desc' },
    });

    if (positions.length === 0) {
      return res.status(200).json({
        message: 'No closed positions found',
        metrics: null,
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Filter positions
    const positions30d = positions.filter(p => p.closedAt && p.closedAt >= thirtyDaysAgo);
    const positions90d = positions.filter(p => p.closedAt && p.closedAt >= ninetyDaysAgo);

    // Calculate total PnL
    const totalPnl30d = positions30d.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
    const totalPnl90d = positions90d.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
    const totalPnlSi = positions.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);

    // Simplified APR calculation (assuming $1000 initial capital)
    const initialCapital = 1000;
    const apr30d = (totalPnl30d / initialCapital) * (365 / 30) * 100;
    const apr90d = (totalPnl90d / initialCapital) * (365 / 90) * 100;
    
    // Calculate SI APR based on first position date
    const firstPosition = positions[positions.length - 1];
    const daysSinceInception = firstPosition.closedAt 
      ? Math.max(1, (now.getTime() - firstPosition.closedAt.getTime()) / (24 * 60 * 60 * 1000))
      : 1;
    const aprSi = (totalPnlSi / initialCapital) * (365 / daysSinceInception) * 100;

    // Simplified Sharpe ratio (std dev approximation)
    const avgReturn = totalPnl30d / Math.max(1, positions30d.length);
    const variance = positions30d.reduce((sum, p) => {
      const pnl = parseFloat(p.pnl?.toString() || '0');
      return sum + Math.pow(pnl - avgReturn, 2);
    }, 0) / Math.max(1, positions30d.length);
    const stdDev = Math.sqrt(variance);
    const sharpe30d = stdDev > 0 ? (avgReturn / stdDev) : 0;

    // Update agent
    const agent = await prisma.agent.update({
      where: { id: agentId },
      data: {
        apr30d,
        apr90d,
        aprSi,
        sharpe30d,
      },
    });

    return res.status(200).json({
      message: 'Metrics updated successfully',
      metrics: {
        apr30d,
        apr90d,
        aprSi,
        sharpe30d,
        positionsAnalyzed: {
          total: positions.length,
          last30d: positions30d.length,
          last90d: positions90d.length,
        },
      },
      agent,
    });
  } catch (error: any) {
    console.error('[ADMIN] Update metrics error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
