/**
 * APR Calculator Worker
 * - Syncs closed position PnL from Ostium subgraph
 * - Updates agent APR metrics
 * - Runs periodically to keep metrics up to date
 * 
 */

import { PrismaClient } from '@prisma/client';
import { getOstiumOrderById, getOstiumClosedPositions } from '../lib/adapters/ostium-adapter';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const LOCK_FILE = path.join(__dirname, '../.apr-calculator.lock');
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

async function acquireLock(): Promise<boolean> {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const stats = fs.statSync(LOCK_FILE);
      const lockAge = Date.now() - stats.mtimeMs;

      if (lockAge > LOCK_TIMEOUT_MS) {
        console.log('⚠️  Found stale lock file, removing...');
        fs.unlinkSync(LOCK_FILE);
      } else {
        console.log('⚠️  Another APR calculator instance is running');
        return false;
      }
    }

    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }));

    return true;
  } catch (error: any) {
    console.error('Failed to acquire lock:', error.message);
    return false;
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (error: any) {
    console.error('Failed to release lock:', error.message);
  }
}

async function syncOstiumPnL(deploymentId: string, safeWallet: string): Promise<number> {
  let syncedCount = 0;

  try {
    const positionsNeedingSync = await prisma.positions.findMany({
      where: {
        deployment_id: deploymentId,
        venue: 'OSTIUM',
        OR: [
          {
            status: 'CLOSED',
            OR: [
              { pnl: null },
              { pnl: 0 },
              { exit_reason: 'CLOSED_EXTERNALLY' },
            ],
          },
          {
            status: 'CLOSING',
          },
        ],
      },
    });

    if (positionsNeedingSync.length === 0) {
      return 0;
    }

    console.log(`   🔄 Found ${positionsNeedingSync.length} positions needing PnL sync (CLOSED + CLOSING)`);

    const closedPositions = await getOstiumClosedPositions(safeWallet, 50);
    const closeActions = ['close', 'takeprofit', 'stoploss', 'liquidation'];
    const closedTrades = closedPositions.filter(p =>
      closeActions.includes(p.orderAction.toLowerCase())
    );

    console.log(`   📊 Found ${closedTrades.length} closed trades from Ostium subgraph`);

    const syncedPositions = new Set<string>();

    for (const dbPosition of positionsNeedingSync) {
      const positionKey = `${dbPosition.deployment_id}_${dbPosition.token_symbol}_${dbPosition.ostium_trade_id || dbPosition.ostium_trade_index || dbPosition.qty.toString()}`;

      if (syncedPositions.has(positionKey)) {
        console.log(`   ⏭️  Skipping duplicate position: ${dbPosition.token_symbol} (key: ${positionKey})`);
        continue;
      }

      const dbTradeId = dbPosition.ostium_trade_id;

      if (!dbTradeId) {
        console.log(`   ⚠️  Skipping ${dbPosition.token_symbol}: No tradeID in database`);
        continue;
      }

      let openOrder: any = null;
      try {
        openOrder = await getOstiumOrderById(dbTradeId);
      } catch (err: any) {
        console.log(`   ⚠️  Unable to fetch open order ${dbTradeId}: ${err.message || err}`);
        continue;
      }

      if (!openOrder || !openOrder.pair) {
        console.log(`   ⚠️  Open order ${dbTradeId} not found or invalid`);
        continue;
      }

      const openSide = openOrder.isBuy ? 'long' : 'short';
      const openToken = String(openOrder.pair.from || '').toUpperCase();
      const openCollateralRaw = Number(openOrder.collateral || 0);
      const openCollateral = openCollateralRaw / (10 ** 6); // Convert to USDC

      const matchedCloseTrade = closedTrades.find(closeTrade => {
        const closeToken = closeTrade.market.toUpperCase();
        const closeSide = closeTrade.side.toLowerCase();
        const closeCollateral = closeTrade.collateral;

        const tokenMatch = closeToken === openToken;
        const sideMatch = closeSide === openSide;
        const collateralMatch = Math.abs(closeCollateral - openCollateral) / openCollateral < 0.01;

        return tokenMatch && sideMatch && collateralMatch;
      });

      if (!matchedCloseTrade) {
        if (dbPosition.status === 'CLOSING') {
          const closingAge = Date.now() - (dbPosition.closed_at?.getTime() || dbPosition.opened_at.getTime());
          const minutesInClosing = Math.round(closingAge / 1000 / 60);
          
          console.log(`   ⏳ CLOSING position not yet in closed trades: ${dbPosition.token_symbol} (waiting ${minutesInClosing} min)`);
          
          if (minutesInClosing > 15) {
            console.log(`   ⚠️  CLOSING → OPEN: Close order likely rejected by keeper (>15 min)`);
            await prisma.positions.update({
              where: { id: dbPosition.id },
              data: {
                status: 'OPEN',
                exit_reason: null,
              },
            });
            syncedCount++;
          }
        } else {
          console.log(`   ⚠️  No matching close order found for ${dbPosition.token_symbol} (open order: ${dbTradeId})`);
        }
        continue;
      }

      const pnlUsdc = matchedCloseTrade.pnlUsdc;
      const exitPrice = matchedCloseTrade.price;

      await prisma.positions.update({
        where: { id: dbPosition.id },
        data: {
          status: 'CLOSED',
          closed_at: dbPosition.closed_at || new Date(),
          pnl: pnlUsdc,
          exit_price: exitPrice > 0 ? exitPrice : dbPosition.exit_price,
          exit_reason: dbPosition.exit_reason || String(matchedCloseTrade.orderAction).toUpperCase(),
        },
      });

      syncedPositions.add(positionKey);
      
      if (dbPosition.status === 'CLOSING') {
        console.log(`   ✅ CLOSING → CLOSED: Synced PnL for ${dbPosition.token_symbol}: $${pnlUsdc.toFixed(2)} (tradeID: ${dbTradeId})`);
      } else {
        console.log(`   ✅ Synced PnL for ${dbPosition.token_symbol}: $${pnlUsdc.toFixed(2)} (tradeID: ${dbTradeId})`);
      }
      syncedCount++;

    }

    return syncedCount;
  } catch (error: any) {
    console.error(`   ❌ PnL sync error: ${error.message}`);
    return syncedCount;
  }
}

/**
 * Calculate APR metrics for an agent
 */
async function calculateAgentMetrics(agentId: string, agentName: string, venue: string): Promise<{
  success: boolean;
  apr30d?: number;
  apr90d?: number;
  aprSi?: number;
  sharpe30d?: number;
  error?: string;
}> {
  try {
    const deployments = await prisma.agent_deployments.findMany({
      where: { agent_id: agentId },
      select: { id: true, safe_wallet: true },
    });

    const deploymentIds = deployments.map(d => d.id);
    const venueFilter = venue === 'MULTI' ? {} : { venue: venue as any };

    const allPositions = await prisma.positions.findMany({
      where: {
        deployment_id: { in: deploymentIds },
        closed_at: { not: null },
        ...venueFilter,
      },
      orderBy: { closed_at: 'desc' },
    });

    if (allPositions.length === 0) {
      console.log(`   📭 No closed positions found for ${agentName}`);
      return { success: true };
    }

    const seenPositions = new Set<string>();
    const positions: typeof allPositions = [];

    for (const pos of allPositions) {
      const uniqueIdentifier = pos.ostium_trade_id ||
        (pos.ostium_trade_index !== null ? `idx_${pos.ostium_trade_index}` : null) ||
        pos.qty.toString();
      const positionKey = `${pos.deployment_id}_${pos.token_symbol}_${uniqueIdentifier}`;

      if (!seenPositions.has(positionKey)) {
        seenPositions.add(positionKey);
        positions.push(pos);
      } else {
        console.log(`   ⚠️  Dropping duplicate position: ${pos.token_symbol} (key: ${positionKey.slice(0, 50)}...)`);
      }
    }

    if (positions.length < allPositions.length) {
      console.log(`   🔍 Deduplicated: ${allPositions.length} → ${positions.length} unique positions`);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
    const ninetyDaysAgo = new Date(now.getTime() - NINETY_DAYS_MS);

    const positions30d = positions.filter(p => p.closed_at && p.closed_at >= thirtyDaysAgo);
    const positions90d = positions.filter(p => p.closed_at && p.closed_at >= ninetyDaysAgo);

    const totalPnl30d = positions30d.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
    const totalPnl90d = positions90d.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
    const totalPnlSi = positions.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);

    const capitalCache = new Map<string, number>();
    const getPositionCapital = async (p: typeof positions[number]) => {
      if (capitalCache.has(p.id)) {
        return capitalCache.get(p.id)!;
      }

      let capital = 0;

      if (p.venue === 'OSTIUM') {
        const tradeId = p.ostium_trade_id;
        if (tradeId) {
          try {
            const order = await getOstiumOrderById(tradeId);
            const collateralRaw = Number(order?.collateral || 0);
            const collateral = collateralRaw / 1e6;
            if (collateral > 0) {
              capital = collateral;
            }
          } catch (err: any) {
            console.log(`   ⚠️  Failed to fetch order ${tradeId} for capital: ${err.message}`);
          }
        }
      } else {
        console.log(`   ⚠️  No capital found for ${p.token_symbol}`);
        capital = 0;
      }

      capitalCache.set(p.id, capital);
      return capital;
    };

    const calculateCapitalDeployed = async (positionList: typeof positions) => {
      const capitals = await Promise.all(positionList.map(getPositionCapital));
      return capitals.reduce((sum, c) => sum + c, 0);
    };

    const capitalDeployed30d = await calculateCapitalDeployed(positions30d);
    const capitalDeployed90d = await calculateCapitalDeployed(positions90d);
    const capitalDeployedSi = await calculateCapitalDeployed(positions);

    // Calculate APR (annualized percentage return)
    // APR = (PnL / Capital) * (365 / Days) * 100
    const apr30d = capitalDeployed30d > 0
      ? (totalPnl30d / capitalDeployed30d) * (365 / 30) * 100
      : 0;
    const apr90d = capitalDeployed90d > 0
      ? (totalPnl90d / capitalDeployed90d) * (365 / 90) * 100
      : 0;

    // Calculate days since inception from first position
    const firstPosition = positions[positions.length - 1];
    const daysSinceInception = firstPosition.opened_at
      ? Math.max(1, (now.getTime() - firstPosition.opened_at.getTime()) / (24 * 60 * 60 * 1000))
      : 1;
    const aprSi = capitalDeployedSi > 0
      ? (totalPnlSi / capitalDeployedSi) * (365 / daysSinceInception) * 100
      : 0;

    // Calculate Sharpe ratio for 30d
    // Sharpe = (Mean Return - Risk Free Rate) / Standard Deviation of Returns
    // Simplified: Sharpe = Mean Return / Std Dev (assuming risk-free rate = 0)
    let sharpe30d = 0;
    if (positions30d.length >= 2) {
      const returns = await Promise.all(positions30d.map(async p => {
        const capital = await getPositionCapital(p);
        const pnl = parseFloat(p.pnl?.toString() || '0');
        return capital > 0 ? pnl / capital : 0;
      }));

      const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);

      // Annualize: multiply by sqrt(365/30) for 30-day period
      sharpe30d = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(365 / 30) : 0;
    }

    await prisma.agents.update({
      where: { id: agentId },
      data: {
        apr_30d: apr30d,
        apr_90d: apr90d,
        apr_si: aprSi,
        sharpe_30d: sharpe30d,
      },
    });

    console.log(`   ✅ Metrics updated:`);
    console.log(`      APR 30d: ${apr30d.toFixed(2)}%`);
    console.log(`      APR 90d: ${apr90d.toFixed(2)}%`);
    console.log(`      APR SI:  ${aprSi.toFixed(2)}%`);
    console.log(`      Sharpe:  ${sharpe30d.toFixed(2)}`);
    console.log(`      Positions: ${positions30d.length} (30d), ${positions.length} (total)`);
    console.log(`      Capital Deployed: $${capitalDeployed30d.toFixed(2)} (30d)`);
    console.log(`      Total PnL: $${totalPnl30d.toFixed(2)} (30d)`);

    return {
      success: true,
      apr30d,
      apr90d,
      aprSi,
      sharpe30d,
    };
  } catch (error: any) {
    console.error(`   ❌ Metrics calculation error: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Main APR calculation function
 */
export async function calculateAllAgentAPR() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║           📊 APR CALCULATOR - METRICS UPDATE                 ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Acquire lock
  const hasLock = await acquireLock();
  if (!hasLock) {
    console.log('❌ Could not acquire lock. Exiting.\n');
    return { success: false, error: 'Another instance is running' };
  }

  try {
    // Get all public agents
    const agents = await prisma.agents.findMany({
      where: { status: 'PUBLIC' },
      select: { id: true, name: true, venue: true },
    });

    console.log(`📋 Found ${agents.length} public agent(s) to update\n`);

    if (agents.length === 0) {
      console.log('✅ No agents to update\n');
      releaseLock();
      return { success: true, agentsUpdated: 0 };
    }

    let successCount = 0;
    let pnlSyncCount = 0;

    for (const agent of agents) {
      console.log(`\n📍 Agent: ${agent.name} (${agent.venue})`);

      // Get deployments for PnL sync (Ostium only)
      if (agent.venue === 'OSTIUM' || agent.venue === 'MULTI') {
        const deployments = await prisma.agent_deployments.findMany({
          where: {
            agent_id: agent.id,
            status: 'ACTIVE',
          },
          select: { id: true, safe_wallet: true },
        });

        for (const deployment of deployments) {
          const synced = await syncOstiumPnL(deployment.id, deployment.safe_wallet);
          pnlSyncCount += synced;
        }
      }

      // Calculate and update metrics
      const result = await calculateAgentMetrics(agent.id, agent.name, agent.venue);

      if (result.success) {
        successCount++;
      }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                   APR CALCULATION COMPLETE                    ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`Total Agents Updated: ${successCount}/${agents.length}`);
    console.log(`PnL Records Synced:   ${pnlSyncCount}\n`);

    releaseLock();

    return {
      success: true,
      agentsUpdated: successCount,
      pnlSynced: pnlSyncCount,
    };

  } catch (error: any) {
    console.error('❌ APR Calculator failed:', error);
    releaseLock();
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run if executed directly
if (require.main === module) {
  console.log('Starting APR Calculator Worker...\n');

  // Run immediately
  calculateAllAgentAPR().then(result => {
    if (result.success) {
      console.log('✅ APR calculation completed successfully');
    } else {
      console.error('❌ APR calculation failed:', result.error);
      process.exit(1);
    }
  });

  // Then run every 30 minutes
  const THIRTY_MINUTES = 30 * 60 * 1000;
  setInterval(() => {
    calculateAllAgentAPR().catch(error => {
      console.error('APR Calculator error:', error);
    });
  }, THIRTY_MINUTES);
}

export default calculateAllAgentAPR;

