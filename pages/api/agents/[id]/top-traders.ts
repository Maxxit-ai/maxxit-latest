import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';

/**
 * API for managing agent's top traders subscriptions
 * 
 * GET    /api/agents/[id]/top-traders  - List agent's top traders
 * POST   /api/agents/[id]/top-traders  - Link top trader to agent
 * DELETE /api/agents/[id]/top-traders  - Unlink top trader
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        const { id: agentId } = req.query;

        if (!agentId || typeof agentId !== 'string') {
            return res.status(400).json({ error: 'Invalid agent ID' });
        }

        // Verify agent exists
        const agent = await prisma.agents.findUnique({
            where: { id: agentId },
        });

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        if (req.method === 'GET') {
            return await handleGet(agentId, req, res);
        } else if (req.method === 'POST') {
            return await handlePost(agentId, req, res);
        } else if (req.method === 'DELETE') {
            return await handleDelete(agentId, req, res);
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error: any) {
        console.error('[API] Agent top traders error:', error.message);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

async function handleGet(agentId: string, req: NextApiRequest, res: NextApiResponse) {
    const links = await prisma.agent_top_traders.findMany({
        where: {
            agent_id: agentId,
        },
        include: {
            top_traders: {
                select: {
                    id: true,
                    wallet_address: true,
                    total_volume: true,
                    total_pnl: true,
                    total_trades: true,
                    total_profit_trades: true,
                    total_loss_trades: true,
                    impact_factor: true,
                    last_active_at: true,
                },
            },
        },
        orderBy: {
            created_at: 'desc',
        },
    });

    const topTraders = links.map(link => ({
        id: link.top_traders.id,
        walletAddress: link.top_traders.wallet_address,
        totalVolume: link.top_traders.total_volume.toString(),
        totalPnl: link.top_traders.total_pnl.toString(),
        totalTrades: link.top_traders.total_trades,
        totalProfitTrades: link.top_traders.total_profit_trades,
        totalLossTrades: link.top_traders.total_loss_trades,
        impactFactor: link.top_traders.impact_factor,
        lastActiveAt: link.top_traders.last_active_at,
        isActive: link.is_active,
    }));

    return res.status(200).json({
        success: true,
        topTraders,
    });
}

async function handlePost(agentId: string, req: NextApiRequest, res: NextApiResponse) {
    const { top_trader_id } = req.body;

    if (!top_trader_id) {
        return res.status(400).json({ error: 'top_trader_id is required' });
    }

    // Verify top trader exists
    const topTrader = await prisma.top_traders.findUnique({
        where: { id: top_trader_id },
    });

    if (!topTrader) {
        return res.status(404).json({ error: 'Top trader not found' });
    }

    // Check if already linked
    const existing = await prisma.agent_top_traders.findUnique({
        where: {
            agent_id_top_trader_id: {
                agent_id: agentId,
                top_trader_id,
            },
        },
    });

    if (existing) {
        // If existing but inactive, reactivate
        if (!existing.is_active) {
            await prisma.agent_top_traders.update({
                where: { id: existing.id },
                data: { is_active: true },
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Top trader already linked (reactivated if was inactive)'
        });
    }

    // Create link
    const link = await prisma.agent_top_traders.create({
        data: {
            agent_id: agentId,
            top_trader_id,
            is_active: true,
        },
        include: {
            top_traders: true,
        },
    });

    // Update is_copy_trade_club flag to true
    await prisma.agents.update({
        where: { id: agentId },
        data: { is_copy_trade_club: true },
    });

    console.log(`[API] Linked agent ${agentId} to top trader ${topTrader.wallet_address}, set is_copy_trade_club=true`);

    return res.status(201).json({
        success: true,
        message: 'Top trader linked to agent',
        topTrader: {
            id: link.top_traders.id,
            walletAddress: link.top_traders.wallet_address,
            impactFactor: link.top_traders.impact_factor,
        },
    });
}

async function handleDelete(agentId: string, req: NextApiRequest, res: NextApiResponse) {
    const top_trader_id = (req.query.top_trader_id as string) || req.body?.top_trader_id;

    if (!top_trader_id) {
        return res.status(400).json({ error: 'top_trader_id is required' });
    }

    await prisma.agent_top_traders.delete({
        where: {
            agent_id_top_trader_id: {
                agent_id: agentId,
                top_trader_id,
            },
        },
    });

    const remainingCount = await prisma.agent_top_traders.count({
        where: { agent_id: agentId },
    });

    // If no more top traders, set is_copy_trade_club to false
    if (remainingCount === 0) {
        await prisma.agents.update({
            where: { id: agentId },
            data: { is_copy_trade_club: false },
        });
        console.log(`[API] Agent ${agentId} has no more top traders, set is_copy_trade_club=false`);
    }

    console.log(`[API] Unlinked agent ${agentId} from top trader ${top_trader_id}`);

    return res.status(200).json({
        success: true,
        message: 'Top trader unlinked from agent',
    });
}
