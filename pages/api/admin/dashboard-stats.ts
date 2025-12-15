import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";

const prisma = new PrismaClient();

// RPC endpoint for Arbitrum
const ARBITRUM_RPC =
  process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";

interface AgentWithStats {
  id: string;
  name: string;
  venue: string;
  creatorWallet: string;
  profitReceiverAddress: string;
  status: string | null;
  apr30d: number | null;
  apr90d: number | null;
  sharpe30d: number | null;
  subscriberCount: number;
  activeSubscribers: number;
  totalPositions: number;
  openPositions: number;
  totalSignals: number;
  totalPnl: number;
  walletBalance: string | null;
}

interface DashboardStats {
  overview: {
    totalAgents: number;
    publicAgents: number;
    privateAgents: number;
    draftAgents: number;
    totalDeployments: number;
    activeDeployments: number;
    pausedDeployments: number;
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalSignals: number;
    totalPnl: number;
    totalBillingEvents: number;
    totalTelegramUsers: number;
    totalCtAccounts: number;
    totalResearchInstitutes: number;
  };
  agents: AgentWithStats[];
  recentActivity: {
    type: string;
    description: string;
    timestamp: string;
    metadata?: any;
  }[];
  venueBreakdown: {
    venue: string;
    agentCount: number;
    deploymentCount: number;
    positionCount: number;
  }[];
  dailyStats: {
    date: string;
    signals: number;
    positions: number;
    pnl: number;
  }[];
}

async function getWalletBalance(address: string): Promise<string | null> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC);
    const balance = await provider.getBalance(address);
    return ethers.utils.formatEther(balance);
  } catch (error) {
    console.error(`Failed to fetch balance for ${address}:`, error);
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // #region debug log - API start
    fetch("http://127.0.0.1:7242/ingest/cd616be5-dd4d-4d59-bd73-3c41aeb54556", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "api/admin/dashboard-stats.ts:60",
        message: "API handler start",
        data: { hasDbUrl: !!process.env.DATABASE_URL },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "E",
      }),
    }).catch(() => {});
    // #endregion
    // #region debug log - before DB queries
    fetch("http://127.0.0.1:7242/ingest/cd616be5-dd4d-4d59-bd73-3c41aeb54556", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "api/admin/dashboard-stats.ts:106",
        message: "Before DB queries",
        data: {},
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "E",
      }),
    }).catch(() => {});
    // #endregion

    // Fetch all overview counts in parallel
    const [
      totalAgents,
      publicAgents,
      privateAgents,
      draftAgents,
      totalDeployments,
      activeDeployments,
      pausedDeployments,
      totalPositions,
      openPositions,
      closedPositions,
      totalSignals,
      totalBillingEvents,
      totalTelegramUsers,
      totalCtAccounts,
      totalResearchInstitutes,
    ] = await Promise.all([
      prisma.agents.count().catch(() => 0),
      prisma.agents.count({ where: { status: "PUBLIC" } }).catch(() => 0),
      prisma.agents.count({ where: { status: "PRIVATE" } }).catch(() => 0),
      prisma.agents.count({ where: { status: "DRAFT" } }).catch(() => 0),
      prisma.agent_deployments.count().catch(() => 0),
      prisma.agent_deployments
        .count({ where: { status: "ACTIVE" } })
        .catch(() => 0),
      prisma.agent_deployments
        .count({ where: { status: "PAUSED" } })
        .catch(() => 0),
      prisma.positions.count().catch(() => 0),
      prisma.positions.count({ where: { status: "OPEN" } }).catch(() => 0),
      prisma.positions
        .count({ where: { closed_at: { not: null } } })
        .catch(() => 0),
      prisma.signals.count().catch(() => 0),
      prisma.billing_events.count().catch(() => 0),
      prisma.telegram_users.count().catch(() => 0),
      prisma.ct_accounts.count().catch(() => 0),
      prisma.research_institutes.count().catch(() => 0),
    ]);

    // Calculate total PnL
    let totalPnl = 0;
    try {
      const pnlSum = await prisma.positions.aggregate({
        _sum: {
          pnl: true,
        },
        where: {
          pnl: { not: null },
        },
      });
      totalPnl = pnlSum._sum.pnl ? Number(pnlSum._sum.pnl) : 0;
    } catch (pnlError: any) {
      console.warn(
        "[Dashboard Stats] Failed to calculate PnL:",
        pnlError.message
      );
    }

    // Fetch agents with their stats
    let agents: any[] = [];
    try {
      agents = await prisma.agents.findMany({
        include: {
          agent_deployments: {
            include: {
              positions: true,
            },
          },
          signals: true,
        },
        orderBy: {
          apr_30d: "desc",
        },
      });
    } catch (agentsError: any) {
      console.warn(
        "[Dashboard Stats] Failed to fetch agents:",
        agentsError.message
      );
    }

    // Process agents with stats
    const agentsWithStats: AgentWithStats[] = await Promise.all(
      agents.map(async (agent) => {
        const subscriberCount = agent.agent_deployments.length;
        const activeSubscribers = agent.agent_deployments.filter(
          (d: any) => d.status === "ACTIVE"
        ).length;

        const allPositions = agent.agent_deployments.flatMap(
          (d: any) => d.positions
        );
        const totalAgentPositions = allPositions.length;
        const openAgentPositions = allPositions.filter(
          (p: any) => p.status === "OPEN"
        ).length;
        const totalAgentPnl = allPositions.reduce(
          (sum: any, p: any) => sum + (p.pnl ? Number(p.pnl) : 0),
          0
        );

        // Fetch wallet balance for profit receiver address
        const walletBalance = await getWalletBalance(
          agent.profit_receiver_address
        );

        return {
          id: agent.id,
          name: agent.name,
          venue: agent.venue,
          creatorWallet: agent.creator_wallet,
          profitReceiverAddress: agent.profit_receiver_address,
          status: agent.status,
          apr30d: agent.apr_30d,
          apr90d: agent.apr_90d,
          sharpe30d: agent.sharpe_30d,
          subscriberCount,
          activeSubscribers,
          totalPositions: totalAgentPositions,
          openPositions: openAgentPositions,
          totalSignals: agent.signals.length,
          totalPnl: totalAgentPnl,
          walletBalance,
        };
      })
    );

    // Fetch recent activity (audit logs) - optional, don't fail if it errors
    let recentActivity: any[] = [];
    try {
      const recentAuditLogs = await prisma.audit_logs.findMany({
        orderBy: { occurred_at: "desc" },
        take: 20,
      });

      recentActivity = recentAuditLogs.map((log) => ({
        type: log.event_name,
        description: `${log.event_name} on ${log.subject_type || "system"}`,
        timestamp: log.occurred_at.toISOString(),
        metadata: log.payload,
      }));
    } catch (auditError: any) {
      console.warn(
        "[Dashboard Stats] Failed to fetch audit logs:",
        auditError.message
      );
      // Continue without audit logs - not critical for dashboard
    }

    // Venue breakdown
    let venueBreakdown: any[] = [];
    try {
      venueBreakdown = await Promise.all(
        ["HYPERLIQUID", "OSTIUM", "GMX", "SPOT", "MULTI"].map(async (venue) => {
          const [agentCount, deploymentCount, positionCount] =
            await Promise.all([
              prisma.agents
                .count({ where: { venue: venue as any } })
                .catch(() => 0),
              prisma.agent_deployments
                .count({
                  where: { agents: { venue: venue as any } },
                })
                .catch(() => 0),
              prisma.positions
                .count({ where: { venue: venue as any } })
                .catch(() => 0),
            ]);
          return { venue, agentCount, deploymentCount, positionCount };
        })
      );
    } catch (venueError: any) {
      console.warn(
        "[Dashboard Stats] Failed to fetch venue breakdown:",
        venueError.message
      );
    }

    // Daily stats for the last 30 days
    let dailyStats: any[] = [];
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailySignals = await prisma.signals
        .groupBy({
          by: ["created_at"],
          where: {
            created_at: { gte: thirtyDaysAgo },
          },
          _count: true,
        })
        .catch(() => []);

      const dailyPositions = await prisma.positions
        .groupBy({
          by: ["opened_at"],
          where: {
            opened_at: { gte: thirtyDaysAgo },
          },
          _count: true,
        })
        .catch(() => []);

      // Aggregate daily stats
      const dailyStatsMap = new Map<
        string,
        { signals: number; positions: number; pnl: number }
      >();

      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        dailyStatsMap.set(dateStr, { signals: 0, positions: 0, pnl: 0 });
      }

      dailySignals.forEach((s) => {
        const dateStr = s.created_at.toISOString().split("T")[0];
        const existing = dailyStatsMap.get(dateStr);
        if (existing) {
          existing.signals += s._count;
        }
      });

      dailyPositions.forEach((p) => {
        const dateStr = p.opened_at.toISOString().split("T")[0];
        const existing = dailyStatsMap.get(dateStr);
        if (existing) {
          existing.positions += p._count;
        }
      });

      dailyStats = Array.from(dailyStatsMap.entries())
        .map(([date, stats]) => ({
          date,
          ...stats,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (dailyError: any) {
      console.warn(
        "[Dashboard Stats] Failed to fetch daily stats:",
        dailyError.message
      );
    }

    const stats: DashboardStats = {
      overview: {
        totalAgents,
        publicAgents,
        privateAgents,
        draftAgents,
        totalDeployments,
        activeDeployments,
        pausedDeployments,
        totalPositions,
        openPositions,
        closedPositions,
        totalSignals,
        totalPnl,
        totalBillingEvents,
        totalTelegramUsers,
        totalCtAccounts,
        totalResearchInstitutes,
      },
      agents: agentsWithStats,
      recentActivity,
      venueBreakdown,
      dailyStats,
    };

    res.status(200).json(stats);
  } catch (error: any) {
    console.error("[Admin Dashboard Stats] Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch dashboard stats" });
  } finally {
    await prisma.$disconnect();
  }
}
