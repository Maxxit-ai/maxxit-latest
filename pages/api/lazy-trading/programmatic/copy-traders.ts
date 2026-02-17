import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/copy-traders
 *
 * Discover traders to copy-trade. Returns two tiers:
 *   Tier 1 — OpenClaw Traders (agents with name starting "OpenClaw Trader -")
 *   Tier 2 — Top Traders Leaderboard (ranked by impact_factor)
 *
 * Query params:
 *   source     — "openclaw" | "leaderboard" | "all" (default: "all")
 *   limit      — max results per tier (default: 20, max: 100)
 *   minTrades  — minimum trade count filter (leaderboard only)
 *   minImpactFactor — minimum impact factor filter (leaderboard only)
 *
 * Dependency: This is the FIRST endpoint in the copy-trading flow.
 * Use the returned wallet addresses (creatorWallet or walletAddress)
 * as the `address` param in GET /copy-trader-trades.
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const apiKeyRecord = await resolveLazyTradingApiKey(req);
        if (!apiKeyRecord) {
            return res.status(401).json({ error: "Invalid API key" });
        }

        // Parse query params
        const source = (req.query.source as string) || "all";
        const limit = Math.min(
            Math.max(parseInt(req.query.limit as string) || 20, 1),
            100
        );
        const minTrades = req.query.minTrades
            ? parseInt(req.query.minTrades as string)
            : undefined;
        const minImpactFactor = req.query.minImpactFactor
            ? parseFloat(req.query.minImpactFactor as string)
            : undefined;

        if (!["openclaw", "leaderboard", "all"].includes(source)) {
            return res.status(400).json({
                error: "Invalid source parameter. Must be 'openclaw', 'leaderboard', or 'all'",
            });
        }

        let openclawTraders: any[] = [];
        let topTraders: any[] = [];

        // =====================================================================
        // Tier 1: OpenClaw Traders (prioritized)
        // =====================================================================
        if (source === "openclaw" || source === "all") {
            const agents = await prisma.agents.findMany({
                where: {
                    name: { startsWith: "OpenClaw Trader -" },
                    status: { in: ["PUBLIC", "PRIVATE"] },
                },
                select: {
                    id: true,
                    name: true,
                    creator_wallet: true,
                    venue: true,
                    status: true,
                    is_copy_trade_club: true,
                    apr_30d: true,
                    apr_90d: true,
                    apr_si: true,
                    sharpe_30d: true,
                    agent_deployments: {
                        where: { status: "ACTIVE" },
                        select: {
                            id: true,
                            status: true,
                            safe_wallet: true,
                            is_testnet: true,
                        },
                        take: 1,
                    },
                },
                take: limit,
                orderBy: { name: "asc" },
            });

            openclawTraders = agents.map((agent) => {
                const deployment = agent.agent_deployments[0] || null;
                return {
                    agentId: agent.id,
                    agentName: agent.name,
                    creatorWallet: agent.creator_wallet,
                    venue: agent.venue,
                    status: agent.status,
                    isCopyTradeClub: agent.is_copy_trade_club,
                    performance: {
                        apr30d: agent.apr_30d,
                        apr90d: agent.apr_90d,
                        aprSinceInception: agent.apr_si,
                        sharpe30d: agent.sharpe_30d,
                    },
                    deployment: deployment
                        ? {
                            id: deployment.id,
                            status: deployment.status,
                            safeWallet: deployment.safe_wallet,
                            isTestnet: deployment.is_testnet,
                        }
                        : null,
                };
            });
        }

        // =====================================================================
        // Tier 2: Top Traders Leaderboard
        // =====================================================================
        if (source === "leaderboard" || source === "all") {
            const whereClause: any = {};
            if (minTrades !== undefined) {
                whereClause.total_trades = { gte: minTrades };
            }
            if (minImpactFactor !== undefined) {
                whereClause.impact_factor = { gte: minImpactFactor };
            }

            const traders = await prisma.top_traders.findMany({
                where: whereClause,
                orderBy: { impact_factor: "desc" },
                take: limit,
            });

            topTraders = traders.map((trader) => {
                const totalTrades =
                    trader.total_profit_trades + trader.total_loss_trades;
                const winRate =
                    totalTrades > 0
                        ? trader.total_profit_trades / totalTrades
                        : 0;

                return {
                    walletAddress: trader.wallet_address,
                    totalVolume: trader.total_volume.toString(),
                    totalClosedVolume: trader.total_closed_volume.toString(),
                    totalPnl: trader.total_pnl.toString(),
                    totalProfitTrades: trader.total_profit_trades,
                    totalLossTrades: trader.total_loss_trades,
                    totalTrades: trader.total_trades,
                    winRate: Math.round(winRate * 100) / 100,
                    lastActiveAt: trader.last_active_at.toISOString(),
                    scores: {
                        edgeScore: trader.edge_score,
                        consistencyScore: trader.consistency_score,
                        stakeScore: trader.stake_score,
                        freshnessScore: trader.freshness_score,
                        impactFactor: trader.impact_factor,
                    },
                    updatedAt: trader.updated_at.toISOString(),
                };
            });
        }

        // Track API key usage
        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        return res.status(200).json({
            success: true,
            openclawTraders,
            topTraders,
            openclawCount: openclawTraders.length,
            topTradersCount: topTraders.length,
        });
    } catch (error: any) {
        console.error(
            "[API /lazy-trading/programmatic/copy-traders] Error:",
            error.message
        );
        return res.status(500).json({
            error: "Failed to fetch traders for copy-trading",
            message: error.message,
        });
    }
}
