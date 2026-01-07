/**
 * Ostium Position Monitor
 * - Monitors positions created by Trade Executor
 * - Reconciles with Ostium to detect external closes
 * - Real-time price tracking and trailing stops
 * - Similar to Hyperliquid monitor but for Arbitrum-based Ostium
 */

import { TradeExecutor } from '../lib/trade-executor';
import { prisma } from '../lib/prisma';
import { getOstiumTradeById } from '../lib/adapters/ostium-adapter';
import { updateMetricsForDeployment } from '../lib/metrics-updater';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const executor = new TradeExecutor();

// Lock file to prevent concurrent monitor instances
const LOCK_FILE = path.join(__dirname, '../.position-monitor-ostium.lock');
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes


/**
 * Acquire a file-based lock to prevent concurrent monitor instances
 */
async function acquireLock(): Promise<boolean> {
  try {
    // Check if lock file exists
    if (fs.existsSync(LOCK_FILE)) {
      const stats = fs.statSync(LOCK_FILE);
      const lockAge = Date.now() - stats.mtimeMs;

      // If lock is older than timeout, assume it's stale and remove it
      if (lockAge > LOCK_TIMEOUT_MS) {
        console.log('⚠️  Found stale lock file, removing...');
        fs.unlinkSync(LOCK_FILE);
      } else {
        console.log('⚠️  Another monitor instance is running (lock age: ' + Math.round(lockAge / 1000) + 's)');
        return false;
      }
    }

    // Create lock file with current timestamp and PID
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

/**
 * Release the lock file
 */
function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (error: any) {
    console.error('Failed to release lock:', error.message);
  }
}

export async function monitorOstiumPositions() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║        📊 OSTIUM POSITION MONITOR - SMART DISCOVERY          ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Acquire lock to prevent concurrent runs
  const hasLock = await acquireLock();
  if (!hasLock) {
    console.log('❌ Could not acquire lock. Exiting to prevent race conditions.\n');
    return {
      success: false,
      error: 'Another monitor instance is already running',
    };
  }

  try {
    // Get ALL active deployments for Ostium venue
    // Include: 1) OSTIUM agents, 2) MULTI agents (assume they have Ostium enabled)
    const deployments = await prisma.agent_deployments.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { agents: { venue: 'OSTIUM' } },
          { agents: { venue: 'MULTI' } }, // All MULTI agents (Ostium is a default venue)
        ],
      },
      include: {
        agents: {
          select: {
            id: true,
            name: true,
            venue: true,
          },
        },
      },
    });

    console.log(`🔍 Found ${deployments.length} active Ostium deployments (including MULTI agents)\n`);

    if (deployments.length === 0) {
      console.log('✅ No Ostium deployments to monitor\n');
      releaseLock();
      return { success: true, positionsMonitored: 0 };
    }

    let totalPositionsMonitored = 0;
    let totalPositionsClosed = 0;

    const getOstiumKey = (pos: any) => {
      if (pos.tradeId) return `tradeId:${pos.tradeId}`;
      if (pos.tradeIndex !== undefined) return `tradeIndex:${pos.tradeIndex}`;
      if (pos.txHash) return `tx:${pos.txHash}`;
      return `fallback:${pos.market || 'unknown'}:${pos.side || 'unknown'}`;
    };

    const findMatchForPosition = (
      dbPosition: any,
      ostPositions: any[],
      usedKeys: Set<string>
    ) => {
      if (dbPosition.ostium_trade_id) {
        const matchByTradeId = ostPositions.find(p => {
          const key = getOstiumKey(p);
          return !usedKeys.has(key) && p.tradeId && `${p.tradeId}` === `${dbPosition.ostium_trade_id}`;
        });
        if (matchByTradeId) return matchByTradeId;
      }
    };

    // Monitor each deployment
    for (const deployment of deployments) {
      try {
        console.log(`\n📍 Deployment: ${deployment.agents.name} (${deployment.id.slice(0, 8)}...)`);
        console.log(`   User Wallet: ${deployment.safe_wallet}`);

        // Get open positions and closing positions from DB
        const dbPositions = await prisma.positions.findMany({
          where: {
            deployment_id: deployment.id,
            venue: 'OSTIUM',
            status: { in: ['OPEN', 'CLOSING'] },
          },
          include: {
            signals: {
              select: {
                risk_model: true,
              },
            },
          },
        });

        console.log(`   Positions Monitored: ${dbPositions.length} (OPEN + CLOSING)`);
        totalPositionsMonitored += dbPositions.length;

        // Monitor each position
        for (const position of dbPositions) {
          try {
            const tradeId = position.ostium_trade_id;

            if (!tradeId) {
              console.log(`   ⚠️  Position ${position.token_symbol} ${position.side} has no tradeId, skipping`);
              continue;
            }

            let onChainTrade: any = null;
            let isOpenOnChain = false;

            try {
              onChainTrade = await getOstiumTradeById(tradeId);
              isOpenOnChain = onChainTrade && onChainTrade.isOpen === true;
            } catch (err: any) {
              console.log(`   ⚠️  Could not fetch trade ${tradeId} from subgraph: ${err.message}`);
              isOpenOnChain = false;
            }

            console.log(`   📊 Position: ${position.token_symbol} ${position.side} (TradeID: ${tradeId})`);
            console.log(`      Status: DB=${position.status} | OnChain=${isOpenOnChain ? 'OPEN' : 'CLOSED'}`);

            // Handle CLOSING status
            if (position.status === 'CLOSING') {
              if (!isOpenOnChain) {
                console.log(`   ✅ CLOSING → CLOSED: Close order fulfilled by keeper`);

                await prisma.positions.update({
                  where: { id: position.id },
                  data: {
                    status: 'CLOSED',
                    closed_at: new Date(),
                    exit_price: null,
                    pnl: 0,
                  },
                });

                totalPositionsClosed++;

                updateMetricsForDeployment(deployment.id).catch(err => {
                  console.error('Failed to update metrics:', err.message);
                });

                continue;
              } else {
                const positionAge = Date.now() - (position.closed_at?.getTime() || Date.now());
                const minutesWaiting = Math.round(positionAge / 1000 / 60);

                console.log(`   ⏳ CLOSING: Waiting for keeper to fulfill close order (${minutesWaiting} min)`);

                if (minutesWaiting > 10) {
                  console.log(`   ⚠️  WARNING: Close order pending for ${minutesWaiting} minutes - reopening position`);
                  await prisma.positions.update({
                    where: { id: position.id },
                    data: {
                      status: 'OPEN',
                      exit_reason: null,
                    },
                  });
                }

                continue;
              }
            }

            // Position closed externally?
            if (!isOpenOnChain) {
              const entryPrice = Number(position.entry_price?.toString() || 0);
              const positionAge = Date.now() - position.opened_at.getTime();
              const isRecent = positionAge < 5 * 60 * 1000; // 5 minutes

              if (entryPrice === 0 && isRecent) {
                console.log(`   ⏳ Position is pending (waiting for keeper), age: ${Math.round(positionAge / 1000)}s`);
                continue;
              }

              console.log(`   ⚠️  Position closed externally - marking as CLOSED`);

              await prisma.positions.update({
                where: { id: position.id },
                data: {
                  status: 'CLOSED',
                  closed_at: new Date(),
                  exit_price: null,
                  exit_reason: 'CLOSED_EXTERNALLY',
                  pnl: 0,
                },
              });

              totalPositionsClosed++;

              updateMetricsForDeployment(deployment.id).catch(err => {
                console.error('Failed to update metrics:', err.message);
              });

              continue;
            }

            // Position is OPEN on-chain - monitor it
            const tradeIndex = parseInt(onChainTrade.index);
            const pairIndex = onChainTrade.pair?.id;

            // Sync trade index if different
            if (tradeIndex !== undefined && position.ostium_trade_index !== tradeIndex) {
              console.log(`   🔄 Syncing trade index: DB=${position.ostium_trade_index} → Ostium=${tradeIndex}`);
              await prisma.positions.update({
                where: { id: position.id },
                data: { ostium_trade_index: tradeIndex },
              });
            }

            // Get current market price
            let currentPrice: number;
            try {
              const tokenSymbol = position.token_symbol.replace('/USD', '').replace('/USDT', '');
              const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || 'http://localhost:5002';
              const priceResponse = await axios.get(`${ostiumServiceUrl}/price/${tokenSymbol}`, { timeout: 5000 });

              if (priceResponse.data.success && priceResponse.data.price) {
                currentPrice = parseFloat(priceResponse.data.price);
                console.log(`   💰 Current Price: $${currentPrice.toFixed(4)} | Entry: $${position.entry_price.toFixed(4)}`);
              } else {
                throw new Error('Price not available');
              }
            } catch (priceError: any) {
              console.error(`   ⚠️  Could not fetch price: ${priceError.message}`);
              currentPrice = Number(position.entry_price.toString());
            }

            const onChainSLPrice = parseFloat(onChainTrade.stopLossPrice || 0) / 1e18;
            const needsProtection = onChainSLPrice === 0;

            if (needsProtection) {
              console.log(`   🎯 Position needs protection - setting SL and TP...`);

              try {
                const userAgentAddress = await prisma.user_agent_addresses.findUnique({
                  where: { user_wallet: deployment.user_wallet.toLowerCase() },
                  select: { ostium_agent_address: true },
                });

                if (!userAgentAddress?.ostium_agent_address) {
                  console.log(`   ⚠️  Agent address not found, skipping SL/TP setting`);
                } else {
                  const riskModel = (position as any).signals?.risk_model as { stopLoss?: number; takeProfit?: number } | null;

                  const DEFAULT_SL_PERCENT = 0.05;
                  const DEFAULT_TP_PERCENT = 0.10;

                  let stopLossPercent = riskModel?.stopLoss || 0;
                  if (stopLossPercent === 0 || stopLossPercent < 0.01) {
                    stopLossPercent = DEFAULT_SL_PERCENT;
                    console.log(`   📊 SL: ${(stopLossPercent * 100).toFixed(1)}% (default - trader did not set)`);
                  } else {
                    console.log(`   📊 SL: ${(stopLossPercent * 100).toFixed(1)}% (from trader)`);
                  }

                  let takeProfitPercent = riskModel?.takeProfit || 0;
                  if (takeProfitPercent === 0 || takeProfitPercent < 0.01) {
                    takeProfitPercent = DEFAULT_TP_PERCENT;
                    console.log(`   📊 TP: ${(takeProfitPercent * 100).toFixed(1)}% (default - trader did not set)`);
                  } else {
                    console.log(`   📊 TP: ${(takeProfitPercent * 100).toFixed(1)}% (from trader)`);
                  }

                  const tokenSymbol = position.token_symbol.replace('/USD', '').replace('/USDT', '');
                  const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || 'http://localhost:5002';
                  const entryPrice = Number(position.entry_price.toString());

                  if (entryPrice > 0) {
                    try {
                      const slResponse = await axios.post(`${ostiumServiceUrl}/set-stop-loss`, {
                        agentAddress: userAgentAddress.ostium_agent_address,
                        userAddress: deployment.safe_wallet,
                        market: tokenSymbol,
                        tradeIndex: tradeIndex,
                        stopLossPercent: stopLossPercent,
                        entryPrice: entryPrice,
                        pairIndex: pairIndex,
                        side: position.side.toLowerCase(),
                        useDelegation: true,
                      }, { timeout: 60000 });

                      if (slResponse.data.success) {
                        console.log(`   ✅ SL set: ${slResponse.data.message || 'Done'}`);
                      } else {
                        console.log(`   ⚠️  SL failed: ${slResponse.data.error}`);
                      }
                    } catch (slError: any) {
                      console.error(`   ⚠️  Error setting SL: ${slError.message}`);
                    }

                    try {
                      const tpResponse = await axios.post(`${ostiumServiceUrl}/set-take-profit`, {
                        agentAddress: userAgentAddress.ostium_agent_address,
                        userAddress: deployment.safe_wallet,
                        market: tokenSymbol,
                        tradeIndex: tradeIndex,
                        takeProfitPercent: takeProfitPercent,
                        entryPrice: entryPrice,
                        pairIndex: pairIndex,
                        side: position.side.toLowerCase(),
                        useDelegation: true,
                      }, { timeout: 60000 });

                      if (tpResponse.data.success) {
                        console.log(`   ✅ TP set: ${tpResponse.data.message || 'Done'}`);
                      } else {
                        console.log(`   ⚠️  TP failed: ${tpResponse.data.error}`);
                      }
                    } catch (tpError: any) {
                      console.error(`   ⚠️  Error setting TP: ${tpError.message}`);
                    }
                  }
                }
              } catch (protectionError: any) {
                console.error(`   ⚠️  Error setting SL/TP: ${protectionError.message}`);
              }
            }

            // Calculate unrealized P&L
            const collateral = Number(position.qty.toString());
            const leverage = parseFloat(onChainTrade.leverage || 100) / 100;
            const entryPriceNum = Number(position.entry_price.toString());
            const isLong = position.side === 'LONG' || position.side === 'BUY';

            const positionSizeInTokens = (collateral * leverage) / entryPriceNum;

            let pnlUSD = 0;
            if (isLong) {
              pnlUSD = positionSizeInTokens * (currentPrice - entryPriceNum);
            } else {
              pnlUSD = positionSizeInTokens * (entryPriceNum - currentPrice);
            }

            const pnlPercent = collateral > 0 ? (pnlUSD / collateral) * 100 : 0;

            console.log(`   📈 P&L: $${pnlUSD.toFixed(2)} (${pnlPercent.toFixed(2)}%) | Collateral: $${collateral.toFixed(2)}, Leverage: ${leverage}x`);

            // Check trailing stop logic
            const trailingParams = position.trailing_params as any;
            let shouldClose = false;
            let closeReason = '';

            const HARD_STOP_LOSS = 10;

            if (pnlPercent <= -HARD_STOP_LOSS) {
              shouldClose = true;
              closeReason = 'HARD_STOP_LOSS';
              console.log(`   🔴 HARD STOP LOSS HIT! P&L: ${pnlPercent.toFixed(2)}%`);
            }

            if (!shouldClose && trailingParams?.enabled) {
              const trailingPercent = trailingParams.trailingPercent || 1;
              const activationThreshold = 3;

              const highestPnlPercent = trailingParams.highestPnlPercent !== undefined
                ? trailingParams.highestPnlPercent
                : 0;
              const newHighestPnl = Math.max(highestPnlPercent, pnlPercent);

              if (newHighestPnl > highestPnlPercent) {
                await prisma.positions.update({
                  where: { id: position.id },
                  data: {
                    trailing_params: {
                      ...trailingParams,
                      highestPnlPercent: newHighestPnl,
                    }
                  }
                });
                console.log(`   📈 New P&L high: ${newHighestPnl.toFixed(2)}%`);
              }

              if (newHighestPnl >= activationThreshold) {
                const trailingStopPnl = newHighestPnl - trailingPercent;
                if (pnlPercent <= trailingStopPnl) {
                  shouldClose = true;
                  closeReason = 'TRAILING_STOP';
                  console.log(`   🟢 Trailing stop triggered! High: ${newHighestPnl.toFixed(2)}%, Current: ${pnlPercent.toFixed(2)}%`);
                } else {
                  console.log(`   ✅ Trailing stop active (High: ${newHighestPnl.toFixed(2)}%, Stop: ${trailingStopPnl.toFixed(2)}%, Current: ${pnlPercent.toFixed(2)}%)`);
                }
              } else {
                console.log(`   ⏳ Trailing stop inactive (need +${activationThreshold}%, current: ${pnlPercent.toFixed(2)}%)`);
              }
            }

            if (shouldClose) {
              console.log(`   🔴 Closing position (Reason: ${closeReason})`);

              const closeResult = await executor.closePosition(position.id);

              if (closeResult.success) {
                console.log(`   ✅ Position closed successfully`);
                totalPositionsClosed++;
              } else {
                console.error(`   ❌ Failed to close: ${closeResult.error}`);
              }
            }

            // Update current price in DB
            await prisma.positions.update({
              where: { id: position.id },
              data: { current_price: currentPrice },
            });

          } catch (posError: any) {
            console.error(`   ❌ Error monitoring position ${position.id}:`, posError.message);
          }
        }

      } catch (deploymentError: any) {
        console.error(`❌ Error monitoring deployment ${deployment.id}:`, deploymentError.message);
      }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                   MONITORING COMPLETE                         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`Total Positions Monitored: ${totalPositionsMonitored}`);
    console.log(`Total Positions Closed:    ${totalPositionsClosed}\n`);

    releaseLock();

    return {
      success: true,
      positionsMonitored: totalPositionsMonitored,
      positionsClosed: totalPositionsClosed,
    };

  } catch (error: any) {
    console.error('❌ Monitor failed:', error);
    releaseLock();
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run monitor if executed directly
if (require.main === module) {
  console.log('Starting Ostium Position Monitor...\n');

  // Run immediately
  monitorOstiumPositions().then(result => {
    if (result.success) {
      console.log('✅ Monitor completed successfully');
    } else {
      console.error('❌ Monitor failed:', result.error);
      process.exit(1);
    }
  });

  // Then run every 30 seconds
  setInterval(() => {
    monitorOstiumPositions().catch(error => {
      console.error('Monitor error:', error);
    });
  }, 30000);
}

export default monitorOstiumPositions;

