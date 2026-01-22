import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

interface LazyTradingAprStats {
    avgApr30d: number;
    avgApr90d: number;
    avgAprSi: number;
    avgSharpe30d: number;
    lazyTraderCount: number;
    bestApr30d: number;
}

/**
 * GET /api/lazy-trading/apr-stats
 * Returns aggregated APR statistics from all lazy trading agents
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<LazyTradingAprStats | { error: string }>
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const lazyAgents = await prisma.agents.findMany({
            where: {
                name: { startsWith: 'Lazy Trader -' },
            },
            select: {
                id: true,
                apr_30d: true,
                apr_90d: true,
                apr_si: true,
                sharpe_30d: true,
            },
        });

        if (lazyAgents.length === 0) {
            return res.status(200).json({
                avgApr30d: 0,
                avgApr90d: 0,
                avgAprSi: 0,
                avgSharpe30d: 0,
                lazyTraderCount: 0,
                bestApr30d: 0,
            });
        }

        // Filter out agents with valid APR data (non-null and non-zero)
        const agentsWithApr = lazyAgents.filter(
            (agent) => agent.apr_30d !== null && agent.apr_30d !== 0
        );

        const count = agentsWithApr.length;

        if (count === 0) {
            return res.status(200).json({
                avgApr30d: 0,
                avgApr90d: 0,
                avgAprSi: 0,
                avgSharpe30d: 0,
                lazyTraderCount: lazyAgents.length,
                bestApr30d: 0,
            });
        }

        const sumApr30d = agentsWithApr.reduce(
            (sum, agent) => sum + (agent.apr_30d || 0),
            0
        );
        const sumApr90d = agentsWithApr.reduce(
            (sum, agent) => sum + (agent.apr_90d || 0),
            0
        );
        const sumAprSi = agentsWithApr.reduce(
            (sum, agent) => sum + (agent.apr_si || 0),
            0
        );
        const sumSharpe30d = agentsWithApr.reduce(
            (sum, agent) => sum + (agent.sharpe_30d || 0),
            0
        );

        const bestApr30d = Math.max(
            ...agentsWithApr.map((agent) => agent.apr_30d || 0)
        );

        const stats: LazyTradingAprStats = {
            avgApr30d: parseFloat((sumApr30d / count).toFixed(2)),
            avgApr90d: parseFloat((sumApr90d / count).toFixed(2)),
            avgAprSi: parseFloat((sumAprSi / count).toFixed(2)),
            avgSharpe30d: parseFloat((sumSharpe30d / count).toFixed(2)),
            lazyTraderCount: lazyAgents.length,
            bestApr30d: parseFloat(bestApr30d.toFixed(2)),
        };

        return res.status(200).json(stats);
    } catch (error: any) {
        console.error('[LazyTrading APR Stats] Error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch APR stats' });
    }
}
