/**
 * Combined Position Monitor (Sequential Execution)
 * Runs Hyperliquid and Ostium monitors sequentially to avoid race conditions
 */

import { monitorHyperliquidPositions } from './position-monitor-hyperliquid';
import { monitorOstiumPositions } from './position-monitor-ostium';

async function runCombinedMonitor() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║        📊 COMBINED POSITION MONITOR (SEQUENTIAL)             ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  let hyperliquidResult = { success: false, positionsMonitored: 0, error: null as any };
  let ostiumResult = { success: false, positionsMonitored: 0, error: null as any };

  // Step 1: Run Hyperliquid Monitor
  console.log('🔵 [1/2] Starting Hyperliquid Position Monitor...\n');
  try {
    hyperliquidResult = await monitorHyperliquidPositions();
    console.log(`\n✅ Hyperliquid Monitor: ${hyperliquidResult.success ? 'Success' : 'Failed'}`);
    console.log(`   Positions Monitored: ${hyperliquidResult.positionsMonitored}`);
  } catch (error: any) {
    console.error('\n❌ Hyperliquid Monitor Error:', error.message);
    hyperliquidResult.error = error.message;
  }

  // Add a small delay between monitors to avoid any overlap
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

  // Step 2: Run Ostium Monitor
  console.log('\n🟢 [2/2] Starting Ostium Position Monitor...\n');
  try {
    ostiumResult = await monitorOstiumPositions();
    console.log(`\n✅ Ostium Monitor: ${ostiumResult.success ? 'Success' : 'Failed'}`);
    console.log(`   Positions Monitored: ${ostiumResult.positionsMonitored}`);
  } catch (error: any) {
    console.error('\n❌ Ostium Monitor Error:', error.message);
    ostiumResult.error = error.message;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 COMBINED MONITOR SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🔵 Hyperliquid: ${hyperliquidResult.positionsMonitored} positions ${hyperliquidResult.success ? '✅' : '❌'}`);
  console.log(`🟢 Ostium: ${ostiumResult.positionsMonitored} positions ${ostiumResult.success ? '✅' : '❌'}`);
  console.log(`⏱️  Total Duration: ${duration}s`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const overallSuccess = hyperliquidResult.success || ostiumResult.success;
  return {
    success: overallSuccess,
    hyperliquid: hyperliquidResult,
    ostium: ostiumResult,
    duration: parseFloat(duration),
  };
}

// Auto-run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runCombinedMonitor()
    .then(result => {
      console.log('[CombinedMonitor] Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[CombinedMonitor] Fatal error:', error);
      process.exit(1);
    });
}

export { runCombinedMonitor };

