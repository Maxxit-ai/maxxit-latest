/**
 * Test both crypto and non-crypto positions on Ostium
 */

import { openOstiumPosition, getOstiumPositions, getOstiumBalance } from '../lib/adapters/ostium-adapter';

async function testBothMarkets() {
  const platformAddress = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';
  const platformPrivateKey = process.env.PLATFORM_WALLET_KEY || process.env.EXECUTOR_PRIVATE_KEY;

  if (!platformPrivateKey) {
    console.log('❌ Platform private key not found');
    console.log('Set PLATFORM_WALLET_KEY or EXECUTOR_PRIVATE_KEY');
    return;
  }

  console.log('🧪 Testing Crypto + Non-Crypto Markets on Ostium');
  console.log('Platform:', platformAddress);
  console.log('');

  try {
    // Check balance
    console.log('💰 Balance:');
    const balance = await getOstiumBalance(platformAddress);
    console.log(`  USDC: $${balance.usdcBalance}`);
    console.log('');

    // Test trades
    const testTrades = [
      // Crypto
      { market: 'BTC', size: 100, side: 'long' as const, name: 'Bitcoin (Crypto)', type: 'crypto' },
      { market: 'ETH', size: 100, side: 'long' as const, name: 'Ethereum (Crypto)', type: 'crypto' },
      
      // Forex
      { market: 'EURUSD', size: 100, side: 'long' as const, name: 'EUR/USD (Forex)', type: 'forex' },
      { market: 'GBPUSD', size: 100, side: 'long' as const, name: 'GBP/USD (Forex)', type: 'forex' },
      
      // Commodities
      { market: 'XAUUSD', size: 100, side: 'long' as const, name: 'Gold (Commodity)', type: 'commodity' },
      { market: 'XAGUSD', size: 100, side: 'long' as const, name: 'Silver (Commodity)', type: 'commodity' },
      
      // Stocks
      { market: 'GOOGL', size: 100, side: 'long' as const, name: 'Google (Stock)', type: 'stock' },
      { market: 'AAPL', size: 100, side: 'long' as const, name: 'Apple (Stock)', type: 'stock' },
    ];

    const results = {
      crypto: { attempted: 0, success: 0, failed: 0 },
      forex: { attempted: 0, success: 0, failed: 0 },
      commodity: { attempted: 0, success: 0, failed: 0 },
      stock: { attempted: 0, success: 0, failed: 0 },
    };

    console.log('🚀 Testing positions...');
    console.log('');

    for (const trade of testTrades) {
      console.log(`📊 ${trade.name}`);
      console.log(`   Market: ${trade.market}, Size: $${trade.size}`);

      results[trade.type as keyof typeof results].attempted++;

      try {
        const result = await openOstiumPosition({
          privateKey: platformPrivateKey,
          market: trade.market,
          size: trade.size,
          side: trade.side,
          leverage: 3,
          useDelegation: false,
        });

        console.log(`   ✅ SUCCESS! Position opened`);
        console.log(`      Trade ID: ${result.tradeId || 'N/A'}`);
        results[trade.type as keyof typeof results].success++;

        // Close immediately to clean up
        console.log(`   🔻 Closing position...`);
        const { closeOstiumPosition } = await import('../lib/adapters/ostium-adapter');
        await closeOstiumPosition({
          privateKey: platformPrivateKey,
          market: trade.market,
          useDelegation: false,
        });
        console.log(`   ✅ Closed`);

      } catch (err: any) {
        console.log(`   ❌ FAILED: ${err.message}`);
        results[trade.type as keyof typeof results].failed++;
      }
      console.log('');

      // Small delay between trades
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    Object.entries(results).forEach(([type, stats]) => {
      const rate = stats.attempted > 0 ? (stats.success / stats.attempted * 100).toFixed(0) : '0';
      const icon = stats.success > 0 ? '✅' : '❌';
      console.log(`${icon} ${type.toUpperCase()}`);
      console.log(`   Attempted: ${stats.attempted}`);
      console.log(`   Success: ${stats.success}`);
      console.log(`   Failed: ${stats.failed}`);
      console.log(`   Success Rate: ${rate}%`);
      console.log('');
    });

    // Check final positions
    console.log('📊 Final open positions:');
    const finalPositions = await getOstiumPositions(platformAddress);
    console.log(`  Total: ${finalPositions.length}`);
    finalPositions.forEach(pos => {
      console.log(`    ${pos.market}: ${pos.side} $${pos.size}`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

testBothMarkets();

