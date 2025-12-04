import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[ClearAllData] Starting database cleanup...');

    // Delete all data in the correct order (respecting foreign key constraints)
    const deletedCounts = {
      telegramTrades: 0,
      telegramUsers: 0,
      positions: 0,
      pnlSnapshots: 0,
      billingEvents: 0,
      agentDeployments: 0,
      signals: 0,
      agents: 0,
      ctPosts: 0,
      ctAccounts: 0,
      marketIndicators6h: 0,
      venueStatus: 0,
      tokenRegistry: 0,
      auditLogs: 0,
    };

    // Delete in order of dependencies
    const telegramTradesResult = await prisma.telegramTrade.deleteMany();
    deletedCounts.telegramTrades = telegramTradesResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.telegramTrades} telegram trades`);

    const telegramUsersResult = await prisma.telegramUser.deleteMany();
    deletedCounts.telegramUsers = telegramUsersResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.telegramUsers} telegram users`);

    const positionsResult = await prisma.position.deleteMany();
    deletedCounts.positions = positionsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.positions} positions`);

    const pnlSnapshotsResult = await prisma.pnlSnapshot.deleteMany();
    deletedCounts.pnlSnapshots = pnlSnapshotsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.pnlSnapshots} PnL snapshots`);

    const billingEventsResult = await prisma.billingEvent.deleteMany();
    deletedCounts.billingEvents = billingEventsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.billingEvents} billing events`);

    const agentDeploymentsResult = await prisma.agentDeployment.deleteMany();
    deletedCounts.agentDeployments = agentDeploymentsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.agentDeployments} agent deployments`);

    const signalsResult = await prisma.signal.deleteMany();
    deletedCounts.signals = signalsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.signals} signals`);

    const agentsResult = await prisma.agent.deleteMany();
    deletedCounts.agents = agentsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.agents} agents`);

    const ctPostsResult = await prisma.ctPost.deleteMany();
    deletedCounts.ctPosts = ctPostsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.ctPosts} CT posts`);

    const ctAccountsResult = await prisma.ctAccount.deleteMany();
    deletedCounts.ctAccounts = ctAccountsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.ctAccounts} CT accounts`);

    const marketIndicatorsResult = await prisma.marketIndicators6h.deleteMany();
    deletedCounts.marketIndicators6h = marketIndicatorsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.marketIndicators6h} market indicators`);

    const venueStatusResult = await prisma.venueStatus.deleteMany();
    deletedCounts.venueStatus = venueStatusResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.venueStatus} venue status records`);

    const tokenRegistryResult = await prisma.tokenRegistry.deleteMany();
    deletedCounts.tokenRegistry = tokenRegistryResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.tokenRegistry} token registry entries`);

    const auditLogsResult = await prisma.auditLog.deleteMany();
    deletedCounts.auditLogs = auditLogsResult.count;
    console.log(`[ClearAllData] Deleted ${deletedCounts.auditLogs} audit logs`);

    const totalDeleted = Object.values(deletedCounts).reduce((sum, count) => sum + count, 0);

    console.log(`[ClearAllData] Database cleanup completed! Total records deleted: ${totalDeleted}`);

    return res.status(200).json({
      success: true,
      message: 'All data cleared successfully',
      deletedCounts,
      totalDeleted,
    });

  } catch (error: any) {
    console.error('[ClearAllData] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear database',
    });
  } finally {
    await prisma.$disconnect();
  }
}
