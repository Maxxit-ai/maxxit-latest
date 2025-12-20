/**
 * Trade Execution Worker
 * Runs automatically to execute pending signals
 * Schedule: Every 5 minutes (synced with signal generation)
 */


import { prisma } from '../lib/prisma';

export async function executeTradesForSignals() {
  console.log('[TradeWorker] Starting trade execution...');
  console.log('[TradeWorker] Timestamp:', new Date().toISOString());

  try {
    // Fetch all pending signals (signals without positions = not yet executed)
    console.log('[TradeWorker] Querying for pending signals...');
    console.log('[TradeWorker] Criteria: no positions, not skipped, agent ACTIVE, deployment ACTIVE with module enabled');
    
    const pendingSignals = await prisma.signals.findMany({
      where: {
        positions: {
          none: {}, // No positions created yet
        },
        skipped_reason: null, // Not skipped
        agents: {
          status: 'ACTIVE',
          agent_deployments: {
            some: {
              status: 'ACTIVE',
              OR: [
                { module_enabled: true }, // For SPOT/GMX signals (need Safe module)
                { hyperliquid_agent_address: { not: null } }, // For HYPERLIQUID signals (has agent wallet)
              ]
            },
          },
        },
      },
      include: {
        agents: {
          include: {
            agent_deployments: {
              where: { 
                status: 'ACTIVE',
                sub_active: true,
              },
              // Note: Venue-specific filtering (module_enabled, agent addresses) 
              // is handled in the API endpoint, not here
            },
          },
        },
      },
      orderBy: {
        created_at: 'asc',
      },
      take: 20, // Process 20 signals per run
    });

    console.log(`[TradeWorker] Found ${pendingSignals.length} pending signals`);
    
    if (pendingSignals.length > 0) {
      console.log('[TradeWorker] Signal details:');
      pendingSignals.forEach(s => {
        console.log(`[TradeWorker]   - ${s.id.substring(0, 8)}... (${s.agents?.name}): ${s.token_symbol} ${s.side}, created ${s.created_at}`);
        console.log(`[TradeWorker]     Deployments: ${s.agents?.agent_deployments?.length || 0}`);
        if (s.agents?.agent_deployments && s.agents.agent_deployments.length > 0) {
          s.agents.agent_deployments.forEach(d => {
            console.log(`[TradeWorker]       Safe: ${d.safe_wallet}, Module: ${d.module_enabled}`);
          });
        }
      });
    } else {
      console.log('[TradeWorker] No pending signals found. Checking why...');
      
      // Debug: Check if any signals exist without positions
      const allSignalsWithoutPositions = await prisma.signals.findMany({
        where: {
          positions: { none: {} },
        },
        select: {
          id: true,
          token_symbol: true,
          skipped_reason: true,
          agents: {
            select: {
              name: true,
              status: true,
            },
          },
        },
        take: 5,
      });
      
      console.log(`[TradeWorker] DEBUG: Signals without positions (any status): ${allSignalsWithoutPositions.length}`);
      if (allSignalsWithoutPositions.length > 0) {
        allSignalsWithoutPositions.forEach(s => {
          console.log(`[TradeWorker]   - ${s.id.substring(0, 8)}... (${s.agents?.name}): ${s.token_symbol}, agent_status=${s.agents?.status}, skipped=${!!s.skipped_reason}`);
        });
      }
    }

    let successCount = 0;
    let failureCount = 0;

    // Execute each signal
    for (const signal of pendingSignals) {
      try {
        console.log(`[TradeWorker] Executing signal ${signal.id} (${signal.token_symbol} ${signal.side})...`);
        console.log(`[TradeWorker]   Agent: ${signal.agents?.name}`);
        console.log(`[TradeWorker]   Deployment Safe: ${signal.agents?.agent_deployments?.[0]?.safe_wallet}`);

        // Call the trade execution API
        const apiBaseUrl = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiBaseUrl}/api/admin/execute-trade-once?signalId=${signal.id}`, {
          method: 'POST',
        });

        if (response.ok) {
          const result = await response.json();
          
          // Log full API response for debugging
          console.log(`[TradeWorker] 📋 API Response for signal ${signal.id}:`);
          console.log(`[TradeWorker]    Success: ${result.success}`);
          console.log(`[TradeWorker]    Total Deployments: ${result.totalDeployments || 'unknown'}`);
          console.log(`[TradeWorker]    Successful: ${result.successfulDeployments || result.positionsCreated || 0}`);
          console.log(`[TradeWorker]    Failed: ${result.failedDeployments || result.errors?.length || 0}`);
          console.log(`[TradeWorker]    Positions Created: ${result.positionsCreated || 0}`);
          
          if (result.deploymentSummary) {
            console.log(`[TradeWorker]    📊 Summary: ${result.deploymentSummary.successful}/${result.deploymentSummary.total} succeeded, ${result.deploymentSummary.failed} failed, ${result.deploymentSummary.skipped} skipped`);
          }
          
          if (result.errors && result.errors.length > 0) {
            console.log(`[TradeWorker]    ⚠️  Deployment Errors:`);
            result.errors.forEach((err: any) => {
              console.log(`[TradeWorker]      - ${err.deploymentId?.substring(0, 8) || 'unknown'}: ${err.error}`);
              if (err.reason) {
                console.log(`[TradeWorker]        Reason: ${err.reason}`);
              }
            });
          }
          
          if (result.success && result.positionsCreated > 0) {
            successCount++;
            console.log(`[TradeWorker] ✅ Signal ${signal.id} executed successfully`);
            console.log(`[TradeWorker]    Positions created: ${result.positionsCreated}`);
            if (result.positions && result.positions[0]) {
              console.log(`[TradeWorker]    TX Hash: ${result.positions[0].entryTxHash}`);
              console.log(`[TradeWorker]    Arbiscan: https://arbiscan.io/tx/${result.positions[0].entryTxHash}`);
            }
            
            // Warn if not all deployments got trades
            const totalDeployments = signal.agents?.agent_deployments?.length || 0;
            if (result.positionsCreated < totalDeployments) {
              console.log(`[TradeWorker]    ⚠️  WARNING: Only ${result.positionsCreated}/${totalDeployments} deployments got trades!`);
            }
          } else {
            failureCount++;
            console.error(`[TradeWorker] ❌ Signal ${signal.id} execution failed`);
            console.error(`[TradeWorker]    Error: ${result.message || result.error}`);
            
            // Check if this is a permanent failure that should skip the signal
            let shouldSkip = false;
            let skipReason = '';
            
            if (result.errors && result.errors.length > 0) {
              result.errors.forEach((err: any) => {
                console.error(`[TradeWorker]    - Deployment ${err.deploymentId}: ${err.error}`);
                if (err.reason) console.error(`[TradeWorker]      Reason: ${err.reason}`);
                
                // Detect permanent failure conditions
                const errorMsg = err.error?.toLowerCase() || '';
                const errorReason = err.reason?.toLowerCase() || '';
                
                if (
                  errorMsg.includes('minimum value of $10') ||
                  errorMsg.includes('minimum order size') ||
                  errorMsg.includes('insufficient balance') ||
                  errorMsg.includes('below venue minimum') ||
                  errorMsg.includes('position size too small') ||
                  errorReason.includes('insufficient balance')
                ) {
                  shouldSkip = true;
                  skipReason = err.error || 'Insufficient funds or below minimum order size';
                }
              });
              
              // If ALL deployments failed with permanent errors, skip the signal
              if (shouldSkip && result.errors.length === (signal.agents?.agent_deployments?.length || 0)) {
                console.log(`[TradeWorker] 🚫 Marking signal ${signal.id} as skipped (permanent failure)`);
                console.log(`[TradeWorker]    Reason: ${skipReason}`);
                
                await prisma.signals.update({
                  where: { id: signal.id },
                  data: {
                    skipped_reason: skipReason,
                  }
                });
              }
            }
          }
        } else {
          failureCount++;
          const errorText = await response.text();
          console.error(`[TradeWorker] ❌ Signal ${signal.id} API call failed (${response.status})`);
          console.error(`[TradeWorker]    Response: ${errorText}`);
          
          // Try to parse error and check if it's a permanent failure
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.errors) {
              // Check for minimum order size errors
              const hasMinimumError = errorData.errors.some((err: any) => 
                err.error?.includes('minimum value of $10') || 
                err.error?.includes('minimum order size')
              );
              
              // Check for market not available errors (multiple formats)
              const marketNotAvailableError = errorData.errors.find((err: any) => 
                err.error?.includes('Market not available for') || 
                err.error?.includes('is not available on')
              );
              
              if (hasMinimumError) {
                console.log(`[TradeWorker] 🚫 Marking signal ${signal.id} as skipped (below minimum)`);
                await prisma.signals.update({
                  where: { id: signal.id },
                  data: {
                    skipped_reason: 'Below minimum order size ($10 for Hyperliquid)',
                  }
                });
              } else if (marketNotAvailableError) {
                // Extract token name from error message (multiple formats)
                let tokenName = signal.token_symbol;
                const tokenMatch1 = marketNotAvailableError.error.match(/Market not available for (\w+)/);
                const tokenMatch2 = marketNotAvailableError.error.match(/Market (\w+) is not available on/);
                if (tokenMatch1) tokenName = tokenMatch1[1];
                if (tokenMatch2) tokenName = tokenMatch2[1];
                
                const skipReason = `Market ${tokenName} not available on ${signal.venue}`;
                
                console.log(`[TradeWorker] 🚫 Marking signal ${signal.id} as skipped (market not available)`);
                console.log(`[TradeWorker]    Reason: ${skipReason}`);
                
                await prisma.signals.update({
                  where: { id: signal.id },
                  data: {
                    skipped_reason: skipReason,
                  }
                });
              }
            }
          } catch (e) {
            // Couldn't parse error, will retry next time
          }
        }

        // Small delay between executions to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        failureCount++;
        console.error(`[TradeWorker] Error executing signal ${signal.id}:`, error);
      }
    }

    console.log(`[TradeWorker] Complete! Success: ${successCount}, Failed: ${failureCount}`);
    return { success: true, executed: successCount, failed: failureCount };
  } catch (error: any) {
    console.error('[TradeWorker] Fatal error:', error);
    return { success: false, error: error.message };
  }
  // Note: Don't disconnect - using singleton
}

// Auto-run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  executeTradesForSignals()
    .then(result => {
      console.log('[TradeWorker] Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[TradeWorker] Fatal error:', error);
      process.exit(1);
    });
}

