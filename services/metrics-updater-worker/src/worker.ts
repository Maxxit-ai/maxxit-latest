/**
 * Metrics Updater Worker (Microservice)
 * Updates agent performance metrics (APR, Sharpe ratio)
 * Interval: 1 hour (configurable via WORKER_INTERVAL)
 */

import dotenv from 'dotenv';
import express from 'express';
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const PORT = process.env.PORT || 5004;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || '3600000'); // 1 hour default

let workerInterval: NodeJS.Timeout | null = null;

// Health check server
const app = express();
app.get('/health', async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'metrics-updater-worker',
    interval: INTERVAL,
    database: dbHealthy ? 'connected' : 'disconnected',
    isRunning: workerInterval !== null,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Metrics Updater Worker health check on port ${PORT}`);
});

/**
 * Update metrics for all active agents
 */
async function updateAllAgentMetrics() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📊 METRICS UPDATER WORKER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Get all public agents (public agents are actively trading)
    const agents = await prisma.agents.findMany({
      where: { status: 'PUBLIC' },
      select: { id: true, name: true, venue: true },
    });

    console.log(`📋 Found ${agents.length} active agent(s) to update\n`);

    if (agents.length === 0) {
      console.log('⚠️  No active agents found\n');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    // Update metrics for each agent
    for (const agent of agents) {
      try {
        console.log(`[${agent.name}] Updating metrics...`);
        
        const result = await updateAgentMetrics(agent.id);
        
        if (result.success) {
          console.log(`[${agent.name}] ✅ Updated - APR 30d: ${result.apr30d?.toFixed(2)}%`);
          successCount++;
        } else {
          console.log(`[${agent.name}] ⚠️  ${result.error || 'No data'}`);
          failCount++;
        }
      } catch (error: any) {
        console.error(`[${agent.name}] ❌ Error:`, error.message);
        failCount++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 METRICS UPDATE SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Agents Processed: ${agents.length}`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ⚠️  Skipped/Failed: ${failCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error: any) {
    console.error('[MetricsUpdater] ❌ Fatal error:', error.message);
  }
}

/**
 * Update metrics for a single agent
 */
async function updateAgentMetrics(agentId: string): Promise<{
  success: boolean;
  apr30d?: number;
  apr90d?: number;
  aprSi?: number;
  sharpe30d?: number;
  error?: string;
}> {
  try {
    // Get agent
    const agent = await prisma.agents.findUnique({
      where: { id: agentId },
      select: { venue: true, name: true },
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Get deployments
    const deployments = await prisma.agent_deployments.findMany({
      where: { agent_id: agentId },
      select: { id: true },
    });

    const deploymentIds = deployments.map((d: { id: string }) => d.id);

    // Get closed positions
    const positions = await prisma.positions.findMany({
      where: {
        deployment_id: { in: deploymentIds },
        closed_at: { not: null },
      },
      orderBy: { closed_at: 'desc' },
    });

    if (positions.length === 0) {
      return { success: true }; // No closed positions yet
    }

    // Calculate APR for different time periods
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const positions30d = positions.filter((p: any) => p.closed_at && p.closed_at >= thirtyDaysAgo);
    const positions90d = positions.filter((p: any) => p.closed_at && p.closed_at >= ninetyDaysAgo);

    const totalPnl30d = positions30d.reduce((sum: number, p: any) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
    const totalPnl90d = positions90d.reduce((sum: number, p: any) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
    const totalPnlSi = positions.reduce((sum: number, p: any) => sum + parseFloat(p.pnl?.toString() || '0'), 0);

    // Calculate capital deployed
    const calculateCapitalDeployed = (positionList: typeof positions) => {
      return positionList.reduce((sum: number, p: any) => {
        const entryPrice = parseFloat(p.entry_price?.toString() || '0');
        const qty = parseFloat(p.qty?.toString() || '0');
        return sum + (entryPrice * qty);
      }, 0);
    };

    const capitalDeployed30d = calculateCapitalDeployed(positions30d);
    const capitalDeployed90d = calculateCapitalDeployed(positions90d);
    const capitalDeployedSi = calculateCapitalDeployed(positions);

    // Calculate APR
    const apr30d = capitalDeployed30d > 0
      ? (totalPnl30d / capitalDeployed30d) * (365 / 30) * 100
      : 0;
    const apr90d = capitalDeployed90d > 0
      ? (totalPnl90d / capitalDeployed90d) * (365 / 90) * 100
      : 0;
    const daysActive = Math.max(1, (now.getTime() - positions[positions.length - 1].opened_at.getTime()) / (24 * 60 * 60 * 1000));
    const aprSi = capitalDeployedSi > 0
      ? (totalPnlSi / capitalDeployedSi) * (365 / daysActive) * 100
      : 0;

    // Calculate Sharpe ratio
    const calculateSharpeRatio = (positionList: typeof positions, annualizationFactor: number) => {
      if (positionList.length < 2) return 0;

      const returns = positionList.map((p: any) => {
        const entryPrice = parseFloat(p.entry_price?.toString() || '0');
        const qty = parseFloat(p.qty?.toString() || '0');
        const pnl = parseFloat(p.pnl?.toString() || '0');
        return entryPrice * qty > 0 ? pnl / (entryPrice * qty) : 0;
      });

      const meanReturn = returns.reduce((sum: number, r: number) => sum + r, 0) / returns.length;
      const stdDev = Math.sqrt(returns.reduce((sum: number, r: number) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1));

      return stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(annualizationFactor) : 0;
    };

    const sharpe30d = calculateSharpeRatio(positions30d, 365 / 30);

    // Update agent metrics
    await prisma.agents.update({
      where: { id: agentId },
      data: {
        apr_30d: apr30d,
        apr_90d: apr90d,
        apr_si: aprSi,
        sharpe_30d: sharpe30d,
      },
    });

    return { success: true, apr30d, apr90d, aprSi, sharpe30d };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log('🚀 Metrics Updater Worker starting...');
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60} minutes)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Run immediately on startup
  await updateAllAgentMetrics();
  
  // Then run on interval
  workerInterval = setInterval(async () => {
    await updateAllAgentMetrics();
  }, INTERVAL);
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log('🛑 Stopping Metrics Updater Worker interval...');
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown('Metrics Updater Worker', server);

// Start worker
if (require.main === module) {
  runWorker().catch(error => {
    console.error('[MetricsUpdater] ❌ Worker failed to start:', error);
    process.exit(1);
  });
}

export { updateAllAgentMetrics, updateAgentMetrics };
