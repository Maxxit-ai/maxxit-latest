/**
 * Hyperliquid Position Monitor (Standalone)
 * - Discovers positions directly from Hyperliquid API
 * - Auto-creates DB records for discovered positions
 * - Monitors ALL Hyperliquid positions across all deployments
 * - Real-time price tracking and risk management
 */

import { TradeExecutor } from '../lib/trade-executor';
import { prisma } from '../lib/prisma';
import { getHyperliquidOpenPositions, getHyperliquidMarketPrice, getHyperliquidUserFills } from '../lib/hyperliquid-utils';
import { updateMetricsForDeployment } from '../lib/metrics-updater';
import { calculatePnL } from '../lib/price-oracle';
import * as fs from 'fs';
import * as path from 'path';

const executor = new TradeExecutor();

// Lock file to prevent concurrent monitor instances
const LOCK_FILE = path.join(__dirname, '../.position-monitor.lock');
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

export async function monitorHyperliquidPositions() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║     📊 HYPERLIQUID POSITION MONITOR - SMART DISCOVERY        ║');
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
    // Step 1: Get ALL deployments (any agent can trade on Hyperliquid)
    // We'll discover positions directly from Hyperliquid API
    const deployments = await prisma.agent_deployments.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        agents: {
          select: {
            id: true,
            name: true,
            venue: true,
          }
        }
      }
    });

    console.log(`Found ${deployments.length} active deployment(s)\n`);
    console.log(`Checking each for Hyperliquid positions...\n`);

    let totalPositionsFound = 0;
    let totalPositionsMonitored = 0;
    let totalPositionsClosed = 0;

    // Step 2: For each deployment, fetch real positions from Hyperliquid
    for (const deployment of deployments) {
      const userAddress = deployment.safe_wallet;
      const agentName = deployment.agents.name;

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  ${agentName} (${userAddress.substring(0, 8)}...)`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      try {
        // Fetch positions from Hyperliquid API
        const hlPositions = await getHyperliquidOpenPositions(userAddress);
        
        if (hlPositions.length === 0) {
          console.log('  No open positions on Hyperliquid\n');
          continue;
        }

        console.log(`  Found ${hlPositions.length} position(s) on Hyperliquid\n`);
        totalPositionsFound += hlPositions.length;

        // Step 3: For each Hyperliquid position, monitor it
        for (const hlPos of hlPositions) {
          const symbol = hlPos.coin;
          const side = parseFloat(hlPos.szi) > 0 ? 'LONG' : 'SHORT';
          const entryPrice = parseFloat(hlPos.entryPx);
          const size = Math.abs(parseFloat(hlPos.szi));
          const unrealizedPnl = parseFloat(hlPos.unrealizedPnl);

          console.log(`\n  📊 ${symbol} ${side}:`);
          console.log(`     Entry: $${entryPrice.toFixed(4)}, Size: ${size.toFixed(4)}, PnL: $${unrealizedPnl.toFixed(2)}`);

          // Step 4: Check if position exists in DB
          let dbPosition = await prisma.positions.findFirst({
            where: {
              deployment_id: deployment.id,
              token_symbol: symbol,
              closed_at: null,
            }
          });

          // Step 5: If not in DB, create it (auto-discovery)
          if (!dbPosition) {
            console.log(`     ⚠️  Not in DB - creating record...`);
            
            try {
              // ALWAYS create a NEW signal for auto-discovered positions
              // Don't reuse signals to avoid unique constraint violations on (deployment_id, signal_id)
              // Wrapped in try-catch to handle race condition with other workers
              const signal = await prisma.signals.create({
                data: {
                  agent_id: deployment.agents.id,
                  token_symbol: symbol,
                  side: side,
                  venue: 'HYPERLIQUID',
                  size_model: { type: 'fixed', value: size },
                  risk_model: { stopLoss: null, takeProfit: null, trailingStop: 0.01 },
                  source_tweets: ['AUTO_DISCOVERED'],
                  proof_verified: true,
                  executor_agreement_verified: true,
                }
              });

              dbPosition = await prisma.positions.create({
                data: {
                  deployment_id: deployment.id,
                  signal_id: signal.id,
                  venue: 'HYPERLIQUID',
                  token_symbol: symbol,
                  side: side,
                  qty: size,
                  entry_price: entryPrice,
                  source: 'auto-discovered',
                  trailing_params: {
                    enabled: true,
                    trailingPercent: 1,
                    highestPrice: side === 'LONG' ? entryPrice : undefined,
                    lowestPrice: side === 'SHORT' ? entryPrice : undefined,
                  }
                }
              });
              console.log(`     ✅ Created DB record: ${dbPosition.id.substring(0, 8)}...`);
            } catch (error: any) {
              if (error.code === 'P2002') {
                // P2002: Unique constraint violation (race condition)
                // Another worker discovered this position first
                console.log(`     ℹ️  Position/signal already exists in DB (another worker got here first)`);
                console.log(`     ✅ This is normal - position will be monitored in next cycle (30 seconds)`);
                console.log(`     ⏭️  Skipping for now...`);
                continue; // Skip this position, it will be picked up in next cycle
              } else {
                console.error(`     ❌ Error creating position: ${error.message}`);
                continue; // Skip this position, don't crash the whole monitor
              }
            }
          } else {
            console.log(`     ✅ Found in DB: ${dbPosition.id.substring(0, 8)}...`);
          }

          // Step 6: Get current price
          const currentPrice = await getHyperliquidMarketPrice(symbol);
          
          if (!currentPrice) {
            console.log(`     ⚠️  Price unavailable for ${symbol}, skipping monitoring`);
            console.log(`     💡 Reason: Token may not be supported by price oracle\n`);
            continue;
          }

          console.log(`     💰 Current: $${currentPrice.toFixed(4)}`);

          // Step 7: Calculate P&L
          const positionValue = size * currentPrice;
          const { pnlUSD, pnlPercent } = calculatePnL(side, entryPrice, currentPrice, positionValue);

          console.log(`     📈 P&L: $${pnlUSD.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

          totalPositionsMonitored++;

          // Step 8: Check exit conditions
          let shouldClose = false;
          let closeReason = '';

          // HARD STOP LOSS: 10%
          const HARD_STOP_LOSS = 10;
          
          if (side === 'LONG') {
            const stopLossPrice = entryPrice * (1 - HARD_STOP_LOSS / 100);
            if (currentPrice <= stopLossPrice) {
              shouldClose = true;
              closeReason = 'HARD_STOP_LOSS';
              console.log(`     🔴 HARD STOP LOSS HIT! Stop: $${stopLossPrice.toFixed(4)}`);
            }
          } else { // SHORT
            const stopLossPrice = entryPrice * (1 + HARD_STOP_LOSS / 100);
            if (currentPrice >= stopLossPrice) {
              shouldClose = true;
              closeReason = 'HARD_STOP_LOSS';
              console.log(`     🔴 HARD STOP LOSS HIT! Stop: $${stopLossPrice.toFixed(4)}`);
            }
          }

          // TRAILING STOP LOGIC
          if (!shouldClose) {
            const trailingParams = dbPosition.trailing_params as any;
            
            if (trailingParams?.enabled) {
              const trailingPercent = trailingParams.trailingPercent || 1;
              
              if (side === 'LONG') {
                const activationThreshold = entryPrice * 1.03;
                const highestPrice = trailingParams.highestPrice || entryPrice;
                const newHighest = Math.max(highestPrice, currentPrice);
                
                if (newHighest > highestPrice) {
                  await prisma.positions.update({
                    where: { id: dbPosition.id },
                    data: {
                      trailing_params: {
                        ...trailingParams,
                        highestPrice: newHighest,
                      }
                    }
                  });
                }

                if (newHighest >= activationThreshold) {
                  const trailingStopPrice = newHighest * (1 - trailingPercent / 100);
                  if (currentPrice <= trailingStopPrice) {
                    shouldClose = true;
                    closeReason = 'TRAILING_STOP';
                    console.log(`     🟢 Trailing stop triggered! High: $${newHighest.toFixed(4)}, Stop: $${trailingStopPrice.toFixed(4)}`);
                  } else {
                    console.log(`     ✅ Trailing stop active (High: $${newHighest.toFixed(4)}, Stop: $${trailingStopPrice.toFixed(4)})`);
                  }
                } else {
                  console.log(`     ⏳ Trailing stop inactive (need +3% for activation, current: ${pnlPercent.toFixed(2)}%)`);
                }
              } else { // SHORT
                const activationThreshold = entryPrice * 0.97;
                const lowestPrice = trailingParams.lowestPrice || entryPrice;
                const newLowest = Math.min(lowestPrice, currentPrice);
                
                if (newLowest < lowestPrice) {
                  await prisma.positions.update({
                    where: { id: dbPosition.id },
                    data: {
                      trailing_params: {
                        ...trailingParams,
                        lowestPrice: newLowest,
                      }
                    }
                  });
                }

                if (newLowest <= activationThreshold) {
                  const trailingStopPrice = newLowest * (1 + trailingPercent / 100);
                  if (currentPrice >= trailingStopPrice) {
                    shouldClose = true;
                    closeReason = 'TRAILING_STOP';
                    console.log(`     🟢 Trailing stop triggered! Low: $${newLowest.toFixed(4)}, Stop: $${trailingStopPrice.toFixed(4)}`);
                  } else {
                    console.log(`     ✅ Trailing stop active (Low: $${newLowest.toFixed(4)}, Stop: $${trailingStopPrice.toFixed(4)})`);
                  }
                } else {
                  console.log(`     ⏳ Trailing stop inactive (need +3% for activation, current: ${pnlPercent.toFixed(2)}%)`);
                }
              }
            }
          }

          // Step 9: Close position if triggered
          if (shouldClose) {
            console.log(`\n     ⚡ Closing position via TradeExecutor...`);
            
            try {
              const result = await executor.closePosition(dbPosition.id);

              if (result.success) {
                totalPositionsClosed++;
                console.log(`     ✅ Position closed! P&L: $${pnlUSD.toFixed(2)} (${closeReason})\n`);
                
                // Update agent APR metrics automatically (non-blocking)
                updateMetricsForDeployment(deployment.id).catch(err => {
                  console.error('     ⚠️  Warning: Failed to update metrics:', err.message);
                });
              } else {
                // Don't log as error if position was already closed
                if (result.error?.includes('already closed')) {
                  console.log(`     ℹ️  Position already closed elsewhere\n`);
                } else {
                  console.log(`     ❌ Failed to close: ${result.error}\n`);
                }
              }
            } catch (closeError: any) {
              console.error(`     ❌ Exception while closing: ${closeError.message}\n`);
            }
          } else {
            console.log(`     ✅ Position healthy\n`);
          }
        }

        // Step 10: Clean up orphan DB records (positions in DB but not on HL)
        const dbPositions = await prisma.positions.findMany({
          where: {
            deployment_id: deployment.id,
            venue: 'HYPERLIQUID',
            closed_at: null,
          }
        });

        const hlTokens = new Set(hlPositions.map(p => p.coin));
        const orphans = dbPositions.filter(p => !hlTokens.has(p.token_symbol));

        if (orphans.length > 0) {
          console.log(`  🔄 Cleaning up ${orphans.length} orphan DB record(s) (closed externally):`);
          
          // Fetch historical fills to get actual PnL for closed positions
          let fills: any[] = [];
          try {
            fills = await getHyperliquidUserFills(deployment.hyperliquid_user_address || deployment.user_wallet);
            console.log(`     Retrieved ${fills.length} historical fills from Hyperliquid`);
          } catch (error: any) {
            console.log(`     ⚠️  Could not fetch fills: ${error.message}`);
          }
          
          for (const orphan of orphans) {
            console.log(`     Closing ${orphan.token_symbol} (not on Hyperliquid)`);
            
            let exitPrice = parseFloat(orphan.entry_price.toString());
            let pnl = 0;
            let exitReason = 'closed_externally';
            
            // Try to find the closing fill for this position
            if (fills.length > 0) {
              const closingFills = fills.filter(f => {
                return f.coin === orphan.token_symbol && parseFloat(f.closedPnl) !== 0;
              });
              
              if (closingFills.length > 0) {
                // Use the most recent closing fill
                const mostRecentFill = closingFills.reduce((latest, fill) => 
                  fill.time > latest.time ? fill : latest
                );
                
                exitPrice = parseFloat(mostRecentFill.px);
                pnl = parseFloat(mostRecentFill.closedPnl);
                exitReason = 'closed_externally_with_pnl';
                
                console.log(`        ✅ Found closing fill: Exit=$${exitPrice.toFixed(4)}, PnL=$${pnl.toFixed(2)}`);
              } else {
                console.log(`        ⚠️  No closing fill found, using entry price as exit`);
              }
            }
            
            await prisma.positions.update({
              where: { id: orphan.id },
              data: {
                closed_at: new Date(),
                pnl: pnl.toString(),
                exit_price: exitPrice.toString(),
                exit_reason: exitReason,
              }
            });
            
            // Update agent APR metrics (non-blocking)
            if (pnl !== 0) {
              updateMetricsForDeployment(deployment.id).catch(err => {
                console.error('        ⚠️  Warning: Failed to update metrics:', err.message);
              });
            }
          }
          console.log();
        }

      } catch (error: any) {
        console.error(`  ❌ Error monitoring ${agentName}:`, error.message);
        console.log();
      }
    }

    // Summary
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                       MONITORING COMPLETE                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`  Positions Found:     ${totalPositionsFound}`);
    console.log(`  Positions Monitored: ${totalPositionsMonitored}`);
    console.log(`  Positions Closed:    ${totalPositionsClosed}\n`);

    return {
      success: true,
      found: totalPositionsFound,
      monitored: totalPositionsMonitored,
      closed: totalPositionsClosed,
    };

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error);
    return { success: false, error: error.message };
  } finally {
    // Release lock before exiting
    releaseLock();
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  monitorHyperliquidPositions()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

