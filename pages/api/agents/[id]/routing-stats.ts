/**
 * Get Agent Routing Stats
 * Shows breakdown of trades by venue for multi-venue agents
 */

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
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Get agent
    const agent = await prisma.agents.findUnique({
      where: { id },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get routing history stats from agent_routing_history
    const routingStats = await prisma.$queryRaw<Array<{
      selected_venue: string;
      count: bigint;
    }>>`
      SELECT 
        arh.selected_venue,
        COUNT(*) as count
      FROM agent_routing_history arh
      JOIN signals s ON s.id = arh.signal_id
      WHERE s.agent_id = ${id}::uuid
      AND arh.selected_venue IS NOT NULL
      GROUP BY arh.selected_venue
      ORDER BY count DESC;
    `;

    // Get total trades
    const totalTrades = routingStats.reduce((sum, stat) => sum + Number(stat.count), 0);

    // Format stats with percentages
    const venueBreakdown = routingStats.map(stat => ({
      venue: stat.selected_venue,
      count: Number(stat.count),
      percentage: totalTrades > 0 ? ((Number(stat.count) / totalTrades) * 100).toFixed(1) : '0',
    }));

    // Get most common token routing patterns
    const tokenRouting = await prisma.$queryRaw<Array<{
      token_symbol: string;
      selected_venue: string;
      count: bigint;
    }>>`
      SELECT 
        arh.token_symbol,
        arh.selected_venue,
        COUNT(*) as count
      FROM agent_routing_history arh
      JOIN signals s ON s.id = arh.signal_id
      WHERE s.agent_id = ${id}::uuid
      AND arh.selected_venue IS NOT NULL
      GROUP BY arh.token_symbol, arh.selected_venue
      ORDER BY count DESC
      LIMIT 10;
    `;

    // Get average routing duration
    const avgDuration = await prisma.$queryRaw<Array<{
      avg_duration_ms: number;
    }>>`
      SELECT 
        AVG(arh.routing_duration_ms) as avg_duration_ms
      FROM agent_routing_history arh
      JOIN signals s ON s.id = arh.signal_id
      WHERE s.agent_id = ${id}::uuid
      AND arh.routing_duration_ms IS NOT NULL;
    `;

    // Get recent routing decisions
    const recentDecisions = await prisma.$queryRaw<Array<{
      token_symbol: string;
      selected_venue: string;
      routing_reason: string;
      routing_duration_ms: number;
      created_at: Date;
    }>>`
      SELECT 
        arh.token_symbol,
        arh.selected_venue,
        arh.routing_reason,
        arh.routing_duration_ms,
        arh.created_at
      FROM agent_routing_history arh
      JOIN signals s ON s.id = arh.signal_id
      WHERE s.agent_id = ${id}::uuid
      ORDER BY arh.created_at DESC
      LIMIT 20;
    `;

    return res.status(200).json({
      agent: {
        id: agent.id,
        name: agent.name,
        venue: agent.venue,
        isMultiVenue: agent.venue === 'MULTI',
      },
      stats: {
        totalTrades,
        venueBreakdown,
        avgRoutingDurationMs: avgDuration[0]?.avg_duration_ms ? Math.round(avgDuration[0].avg_duration_ms) : 0,
      },
      tokenRouting: tokenRouting.map(t => ({
        tokenSymbol: t.token_symbol,
        venue: t.selected_venue,
        count: Number(t.count),
      })),
      recentDecisions: recentDecisions.map(d => ({
        tokenSymbol: d.token_symbol,
        venue: d.selected_venue,
        reason: d.routing_reason,
        durationMs: d.routing_duration_ms,
        timestamp: d.created_at,
      })),
    });
  } catch (error: any) {
    console.error('[API /agents/[id]/routing-stats] Error:', error.message);
    return res.status(500).json({ 
      error: error.message || 'Failed to get routing stats' 
    });
  }
}

