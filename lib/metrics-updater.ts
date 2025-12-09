/**
 * Automatic Metrics Updater
 * Updates agent APR and Sharpe ratio after position closes
 */


import { prisma } from '../lib/prisma';

export interface MetricsUpdateResult {
  success: boolean;
  apr30d?: number;
  apr90d?: number;
  aprSi?: number;
  sharpe30d?: number;
  error?: string;
}

/**
 * Update agent metrics automatically after a position closes
 * @param agentId - The agent whose metrics to update
 */
export async function updateAgentMetrics(agentId: string): Promise<MetricsUpdateResult> {
  try {
    console.log(`[MetricsUpdater] Updating metrics for agent ${agentId}`);

    // Get agent's venue to filter positions correctly
    const agent = await prisma.agents.findUnique({
      where: { id: agentId },
      select: { venue: true, name: true },
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    console.log(`[MetricsUpdater] Agent: ${agent.name} on ${agent.venue}`);

    // Get all closed positions for this agent AND venue
    const deployments = await prisma.agent_deployments.findMany({
      where: { agent_id: agentId },
      select: { id: true },
    });

    const deploymentIds = deployments.map(d => d.id);

    // 🔧 FIX: Filter positions by VENUE to prevent cross-venue APR contamination
    const positions = await prisma.positions.findMany({
      where: {
        deployment_id: { in: deploymentIds },
        venue: agent.venue, // ✅ Only positions from THIS venue
        closed_at: { not: null },
      },
      orderBy: { closed_at: 'desc' },
    });

    if (positions.length === 0) {
      console.log('[MetricsUpdater] No closed positions found - skipping update');
      return { success: true };
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Filter positions by time
    const positions30d = positions.filter(p => p.closed_at && p.closed_at >= thirtyDaysAgo);
    const positions90d = positions.filter(p => p.closed_at && p.closed_at >= ninetyDaysAgo);

    // Calculate total PnL for each period
    const totalPnl30d = positions30d.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
    const totalPnl90d = positions90d.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
    const totalPnlSi = positions.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);

    // Calculate ACTUAL capital deployed (entry_price × qty) for each period
    const calculateCapitalDeployed = (positionList: typeof positions) => {
      return positionList.reduce((sum, p) => {
        const entryPrice = parseFloat(p.entry_price?.toString() || '0');
        const qty = parseFloat(p.qty?.toString() || '0');
        return sum + (entryPrice * qty);
      }, 0);
    };

    const capitalDeployed30d = calculateCapitalDeployed(positions30d);
    const capitalDeployed90d = calculateCapitalDeployed(positions90d);
    const capitalDeployedSi = calculateCapitalDeployed(positions);

    // APR calculation using ACTUAL deployed capital (not assumed $1000)
    // Fallback to $1000 only if no capital was deployed (edge case)
    const apr30d = capitalDeployed30d > 0 
      ? (totalPnl30d / capitalDeployed30d) * (365 / 30) * 100
      : 0;
    const apr90d = capitalDeployed90d > 0
      ? (totalPnl90d / capitalDeployed90d) * (365 / 90) * 100
      : 0;
    
    // Calculate SI APR based on first position date
    const firstPosition = positions[positions.length - 1];
    const daysSinceInception = firstPosition.closed_at 
      ? Math.max(1, (now.getTime() - firstPosition.closed_at.getTime()) / (24 * 60 * 60 * 1000))
      : 1;
    const aprSi = capitalDeployedSi > 0
      ? (totalPnlSi / capitalDeployedSi) * (365 / daysSinceInception) * 100
      : 0;

    // Simplified Sharpe ratio (std dev approximation)
    const avgReturn = totalPnl30d / Math.max(1, positions30d.length);
    const variance = positions30d.reduce((sum, p) => {
      const pnl = parseFloat(p.pnl?.toString() || '0');
      return sum + Math.pow(pnl - avgReturn, 2);
    }, 0) / Math.max(1, positions30d.length);
    const stdDev = Math.sqrt(variance);
    const sharpe30d = stdDev > 0 ? (avgReturn / stdDev) : 0;

    // Update agent
    await prisma.agents.update({
      where: { id: agentId },
      data: {
        apr_30d: apr30d,
        apr_90d: apr90d,
        apr_si: aprSi,
        sharpe_30d: sharpe30d,
      },
    });

    console.log('[MetricsUpdater] ✅ Metrics updated:', {
      apr30d: apr30d.toFixed(2) + '%',
      apr90d: apr90d.toFixed(2) + '%',
      aprSi: aprSi.toFixed(2) + '%',
      sharpe30d: sharpe30d.toFixed(2),
      positionsAnalyzed: positions.length,
      capitalDeployed30d: '$' + capitalDeployed30d.toFixed(2),
      capitalDeployedSi: '$' + capitalDeployedSi.toFixed(2),
      totalPnlSi: '$' + totalPnlSi.toFixed(2),
    });

    return {
      success: true,
      apr30d,
      apr90d,
      aprSi,
      sharpe30d,
    };
  } catch (error: any) {
    console.error('[MetricsUpdater] Error updating metrics:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update metrics for a deployment's agent after a position closes
 * @param deploymentId - The deployment ID of the closed position
 */
export async function updateMetricsForDeployment(deploymentId: string): Promise<MetricsUpdateResult> {
  try {
    // Get the agent ID from deployment
    const deployment = await prisma.agent_deployments.findUnique({
      where: { id: deploymentId },
      select: { agent_id: true },
    });

    if (!deployment) {
      return {
        success: false,
        error: 'Deployment not found',
      };
    }

    return await updateAgentMetrics(deployment.agent_id);
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

