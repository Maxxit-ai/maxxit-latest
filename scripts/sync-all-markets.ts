#!/usr/bin/env ts-node
/**
 * Sync All Venue Markets
 * Runs market sync for all supported venues
 */

import { syncOstiumMarkets } from './sync-ostium-markets';
import { syncHyperliquidMarkets } from './sync-hyperliquid-markets';

async function syncAllMarkets() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║          🔄 SYNCING ALL VENUE MARKETS                    ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const results: any = {
    ostium: null,
    hyperliquid: null,
  };
  
  // Sync Ostium
  try {
    console.log('🟢 [1/2] Syncing Ostium Markets...\n');
    results.ostium = await syncOstiumMarkets();
    console.log('\n');
  } catch (error: any) {
    console.error('❌ Ostium sync failed:', error.message);
    console.log('\n');
  }
  
  // Sync Hyperliquid
  try {
    console.log('🔵 [2/2] Syncing Hyperliquid Markets...\n');
    results.hyperliquid = await syncHyperliquidMarkets();
    console.log('\n');
  } catch (error: any) {
    console.error('❌ Hyperliquid sync failed:', error.message);
    console.log('\n');
  }
  
  // Summary
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     SYNC COMPLETE                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  if (results.ostium) {
    console.log('🟢 Ostium:');
    console.log(`   Markets: ${results.ostium.total}`);
    console.log(`   Created: ${results.ostium.created}`);
    console.log(`   Updated: ${results.ostium.updated}`);
  }
  
  if (results.hyperliquid) {
    console.log('\n🔵 Hyperliquid:');
    console.log(`   Markets: ${results.hyperliquid.total}`);
    console.log(`   Created: ${results.hyperliquid.created}`);
    console.log(`   Updated: ${results.hyperliquid.updated}`);
  }
  
  console.log('\n✅ All markets synced!\n');
  
  return results;
}

// Run if executed directly
if (require.main === module) {
  syncAllMarkets()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { syncAllMarkets };

