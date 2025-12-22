/**
 * Ostium Position Monitor
 * - Monitors positions created by Trade Executor
 * - Reconciles with Ostium to detect external closes
 * - Real-time price tracking and trailing stops
 * - Similar to Hyperliquid monitor but for Arbitrum-based Ostium
 */

import { TradeExecutor } from '../lib/trade-executor';
import { prisma } from '../lib/prisma';
import { getOstiumPositions, getOstiumBalance } from '../lib/adapters/ostium-adapter';
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
        
        const ostiumPositions = await getOstiumPositions(deployment.safe_wallet);
        const usedOstiumKeys = new Set<string>();
        
        console.log(`   Ostium Positions: ${ostiumPositions.length}`);
        console.log(`   Ostium Positions: ${JSON.stringify(ostiumPositions, null, 2)}`);
        
        for (const ostPos of ostiumPositions) {
          const txHashPreview = ostPos.txHash ? ostPos.txHash.slice(0, 16) + '...' : 'N/A';
          console.log(`      - ${ostPos.market} ${ostPos.side.toUpperCase()} | TX: ${txHashPreview}`);
        }

        // Get open positions and closing positionf from DB
        const dbPositions = await prisma.positions.findMany({
          where: {
            deployment_id: deployment.id,
            venue: 'OSTIUM',
            status: { in: ['OPEN', 'CLOSING'] },
          },
        });

        console.log(`   Positions Monitored: ${dbPositions.length} (OPEN + CLOSING)`);
        totalPositionsMonitored += dbPositions.length;

        // Monitor each position
        for (const position of dbPositions) {
          try {
            const ostPosition = findMatchForPosition(position, ostiumPositions, usedOstiumKeys);
            if (ostPosition) {
              usedOstiumKeys.add(getOstiumKey(ostPosition));
            }
            
            if (position.status === 'CLOSING') {
              if (!ostPosition) {
                console.log(`   ✅ CLOSING → CLOSED: Close order fulfilled by keeper`);
                console.log(`      Position: ${position.token_symbol} ${position.side}`);
                
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
                console.log(`      Position: ${position.token_symbol} ${position.side}`);
                
                if (minutesWaiting > 10) {
                  console.log(`   ⚠️  WARNING: Close order pending for ${minutesWaiting} minutes - keeper might have rejected it`);
                  console.log(`   ⚠️  Consider manual intervention if this persists`);
                  await prisma.positions.update({
                    where: { id: position.id },
                    data: {
                      status: 'OPEN',
                      exit_reason: null,
                    },
                  });
                  continue;
                }
                
                continue;
              }
            }
            
            if (ostPosition && ostPosition.tradeIndex !== undefined) {
              const ostiumTradeIndex = parseInt(ostPosition.tradeIndex as string, 10);
              const currentDbIndex = position.ostium_trade_index;
              
              if (currentDbIndex !== ostiumTradeIndex) {
                console.log(`   🔄 Syncing trade index: DB=${currentDbIndex} → Ostium=${ostiumTradeIndex}`);
                await prisma.positions.update({
                  where: { id: position.id },
                  data: { ostium_trade_index: ostiumTradeIndex },
                });
              }
            }

            // Position closed externally?
            if (!ostPosition) {
              // CRITICAL: Don't close positions that are pending (entry_price = 0 means pending)
              // Ostium uses keeper-based orders - they take 1-5 minutes to fill
              // Note: qty should ALWAYS be > 0 (collateral amount), so we only check entry_price
              const entryPrice = Number(position.entry_price?.toString() || 0);
              const qty = Number(position.qty?.toString() || 0);
              
              // Position is pending if entry_price is 0 (order not filled yet)
              // qty should be > 0 (collateral), but we check it as a safety measure
              const isPending = entryPrice === 0 && qty > 0;
              
              // Also check if position was created recently (within last 5 minutes)
              const positionAge = Date.now() - position.opened_at.getTime();
              const isRecent = positionAge < 5 * 60 * 1000; // 5 minutes
              
              if (isPending && isRecent) {
                console.log(`   ⏳ Position ${position.token_symbol} ${position.side} is pending (order submitted, waiting for keeper to fill)`);
                console.log(`      TX: ${position.entry_tx_hash}`);
                console.log(`      Age: ${Math.round(positionAge / 1000)}s (keeper typically fills within 1-5 minutes)`);
                console.log(`      ⏭️  Skipping close check - order is still pending`);
                continue; // Don't close - order is still pending
              }
              
              console.log(`   ⚠️  Position ${position.token_symbol} ${position.side} (TX: ${position.entry_tx_hash}) no longer on Ostium - marking as closed`);
              console.log(`      Age: ${Math.round(positionAge / 1000 / 60)} minutes`);
              
              await prisma.positions.update({
                where: { id: position.id },
                data: {
                  status: 'CLOSED',
                  closed_at: new Date(),
                  exit_price: null, // Unknown exit price
                  exit_reason: 'CLOSED_EXTERNALLY',
                  pnl: 0, // Unknown PnL (TODO: calculate from fills)
                },
              });

              totalPositionsClosed++;
              
              // Update metrics
              updateMetricsForDeployment(deployment.id).catch(err => {
                console.error('Failed to update metrics:', err.message);
              });
              
              continue;
            }

            // Get CURRENT market price from Ostium service ONLY
            let currentPrice: number;
            try {
              // Extract token symbol (e.g., "BTC" from "BTC/USD")
              const tokenSymbol = position.token_symbol.replace('/USD', '').replace('/USDT', '');
              
              // Get price from Ostium service (Ostium platform prices only)
              const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || 'http://localhost:5002';
              const priceResponse = await axios.get(`${ostiumServiceUrl}/price/${tokenSymbol}`, { timeout: 5000 });
              
              if (priceResponse.data.success && priceResponse.data.price) {
                currentPrice = parseFloat(priceResponse.data.price);
                console.log(`   💰 Current Price: $${currentPrice.toFixed(4)} | Entry: $${position.entry_price.toFixed(4)}`);
              } else {
                throw new Error(priceResponse.data.error || 'Price not available from Ostium');
              }
            } catch (priceError: any) {
              console.error(`   ⚠️  Could not fetch current price for ${position.token_symbol}: ${priceError.message}`);
              console.log(`   ⏭️  Skipping trailing stop check (using entry price as fallback)`);
              currentPrice = ostPosition.entryPrice; // Fallback to entry price
            }

            const needsSL = !ostPosition.stopLossPrice || ostPosition.stopLossPrice === 0;
            
            if (ostPosition.tradeIndex !== undefined || needsSL) {
              const stopLossPercent = 0.05; // Default 5%
              const takeProfitPercent = 0.10; // Default 10%
              const entryPrice = Number(position.entry_price.toString());
              const isLong = position.side === 'LONG' || position.side === 'BUY';
              
              const calculatedTpPrice = isLong ? entryPrice * (1 + takeProfitPercent) : entryPrice * (1 - takeProfitPercent);
              const needsTP = !ostPosition.takeProfitPrice || Math.abs(ostPosition.takeProfitPrice - calculatedTpPrice) > (entryPrice * 0.01);

              if (needsSL || needsTP) {
                console.log(`   🎯 Position needs protection - setting ${needsSL ? 'SL' : ''}${needsSL && needsTP ? ' and ' : ''}${needsTP ? 'TP' : ''}...`);
                
                try {
                  const userAgentAddress = await prisma.user_agent_addresses.findUnique({
                    where: { user_wallet: deployment.user_wallet.toLowerCase() },
                    select: { ostium_agent_address: true },
                  });
                  
                  if (!userAgentAddress?.ostium_agent_address) {
                    console.log(`   ⚠️  Agent address not found for user ${deployment.user_wallet}, skipping SL/TP setting`);
                    throw new Error('Agent address not found'); // Will be caught below, position monitoring continues
                  }
                  
                  const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || 'http://localhost:5002';
                  const tokenSymbol = position.token_symbol.replace('/USD', '').replace('/USDT', '');
                  
                  if (needsSL) {
                    const slResponse = await axios.post(`${ostiumServiceUrl}/set-stop-loss`, {
                      agentAddress: userAgentAddress.ostium_agent_address,
                      userAddress: deployment.safe_wallet,
                      market: tokenSymbol,
                      tradeIndex: ostPosition.tradeIndex,
                      stopLossPercent: stopLossPercent,
                      currentPrice: currentPrice,
                      pairIndex: ostPosition.pairIndex,
                      side: position.side.toLowerCase(),
                      useDelegation: true,
                    }, { timeout: 60000 });
                    
                    if (slResponse.data.success) {
                      console.log(`   ✅ SL set successfully: ${slResponse.data.message || 'Done'}`);
                      if (slResponse.data.adjusted) {
                        console.log(`   ⚠️  SL was adjusted to avoid liquidation`);
                      }
                    } else {
                      console.log(`   ⚠️  SL setting failed: ${slResponse.data.error}`);
                    }
                  }
                  
                  if (needsTP) {
                    if (entryPrice > 0) {
                      const tpResponse = await axios.post(`${ostiumServiceUrl}/set-take-profit`, {
                        agentAddress: userAgentAddress.ostium_agent_address,
                        userAddress: deployment.safe_wallet,
                        market: tokenSymbol,
                        tradeIndex: ostPosition.tradeIndex,
                        takeProfitPercent: takeProfitPercent,
                        entryPrice: entryPrice, // Use entry price for TP calculation
                        pairIndex: ostPosition.pairIndex,
                        side: position.side.toLowerCase(),
                        useDelegation: true,
                      }, { timeout: 60000 });
                      
                      if (tpResponse.data.success) {
                        console.log(`   ✅ TP set successfully: ${tpResponse.data.message || 'Done'}`);
                      } else {
                        console.log(`   ⚠️  TP setting failed: ${tpResponse.data.error}`);
                      }
                    } else {
                      console.log(`   ⚠️  Cannot set TP - entry price is 0 (position may still be pending)`);
                    }
                  }
                } catch (protectionError: any) {
                  console.error(`   ⚠️  Error setting SL/TP: ${protectionError.message}`);
                }
              }
            }

            // Calculate unrealized P&L using actual position size from Ostium
            // Use tradeNotional (actual position size) and factor in fees
            const collateral = Number(position.qty.toString()); // qty is collateral in USDC
            const leverage = ostPosition.leverage || 1;
            const entryPriceNum = Number(position.entry_price.toString());
            const isLong = position.side === 'LONG' || position.side === 'BUY';
            
            // Use actual position size from Ostium if available, otherwise calculate it
            let positionSizeInTokens: number;
            if ((ostPosition as any).positionSize && (ostPosition as any).positionSize > 0) {
              // Use actual position size from Ostium SDK (more accurate)
              positionSizeInTokens = (ostPosition as any).positionSize;
              console.log(`   📊 Using actual position size: ${positionSizeInTokens.toFixed(6)} tokens`);
            } else {
              // Fallback: Calculate position size from collateral and leverage
              positionSizeInTokens = (collateral * leverage) / entryPriceNum;
              console.log(`   📊 Calculated position size: ${positionSizeInTokens.toFixed(6)} tokens (fallback)`);
            }
            
            // P&L from price movement
            let pnlUSD = 0;
            if (isLong) {
              pnlUSD = positionSizeInTokens * (currentPrice - entryPriceNum);
            } else {
              // For SHORT: profit when price goes down
              pnlUSD = positionSizeInTokens * (entryPriceNum - currentPrice);
            }
            
            // Factor in funding and rollover fees if available
            const totalFees = (ostPosition as any).totalFees || 0;
            if (totalFees !== 0) {
              pnlUSD += totalFees;
              console.log(`   💸 Fees (funding + rollover): $${totalFees.toFixed(4)}`);
            }
            
            // P&L percentage relative to collateral
            const pnlPercent = collateral > 0 ? (pnlUSD / collateral) * 100 : 0;
            
            console.log(`   📈 P&L: $${pnlUSD.toFixed(2)} (${pnlPercent.toFixed(2)}%) | Collateral: $${collateral.toFixed(2)}, Leverage: ${leverage}x`);

            // Check trailing stop logic
            const trailingParams = position.trailing_params as any;
            let shouldClose = false;
            let closeReason = '';

            // HARD STOP LOSS: 10% (using calculated P&L percentage)
            const HARD_STOP_LOSS = 10;
            
            if (pnlPercent <= -HARD_STOP_LOSS) {
              shouldClose = true;
              closeReason = 'HARD_STOP_LOSS';
              console.log(`   🔴 HARD STOP LOSS HIT! P&L: ${pnlPercent.toFixed(2)}% (threshold: -${HARD_STOP_LOSS}%)`);
            }

            // TRAILING STOP LOGIC (using calculated P&L percentage)
            if (!shouldClose && trailingParams?.enabled) {
              const trailingPercent = trailingParams.trailingPercent || 1;
              const activationThreshold = 3; // Activate trailing stop after +3% P&L
              
              // Track highest P&L percentage (works for both LONG and SHORT)
              const highestPnlPercent = trailingParams.highestPnlPercent !== undefined 
                ? trailingParams.highestPnlPercent 
                : 0; // Start from 0 (entry)
              const newHighestPnl = Math.max(highestPnlPercent, pnlPercent);
              
              // Update highest P&L if new high
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

              // Check if trailing stop should trigger
              if (newHighestPnl >= activationThreshold) {
                // Trailing stop triggers if P&L drops by trailingPercent from the high
                const trailingStopPnl = newHighestPnl - trailingPercent;
                if (pnlPercent <= trailingStopPnl) {
                  shouldClose = true;
                  closeReason = 'TRAILING_STOP';
                  console.log(`   🟢 Trailing stop triggered! High P&L: ${newHighestPnl.toFixed(2)}%, Current: ${pnlPercent.toFixed(2)}%, Stop: ${trailingStopPnl.toFixed(2)}%`);
                } else {
                  console.log(`   ✅ Trailing stop active (High P&L: ${newHighestPnl.toFixed(2)}%, Stop: ${trailingStopPnl.toFixed(2)}%, Current: ${pnlPercent.toFixed(2)}%)`);
                }
              } else {
                console.log(`   ⏳ Trailing stop inactive (need +${activationThreshold}% for activation, current: ${pnlPercent.toFixed(2)}%)`);
              }
            }

            // Execute close if triggered
            if (shouldClose) {
              console.log(`   🔴 Closing position (Reason: ${closeReason})`);
              
              const closeResult = await executor.closePosition(position.id);
              
              if (closeResult.success) {
                console.log(`   ✅ Position closed successfully`);
                totalPositionsClosed++;
              } else {
                console.error(`   ❌ Failed to close position: ${closeResult.error}`);
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

