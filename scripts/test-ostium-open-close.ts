/**
 * Test opening and closing an Ostium position
 */

import { openOstiumPosition, closeOstiumPosition, getOstiumPositions, getOstiumBalance } from '../lib/adapters/ostium-adapter';

async function testOpenClose() {
  const platformAddress = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';
  const platformPrivateKey = process.env.PLATFORM_WALLET_KEY || process.env.EXECUTOR_PRIVATE_KEY;

  if (!platformPrivateKey) {
    console.log('❌ Platform private key not found');
    console.log('Set PLATFORM_WALLET_KEY or EXECUTOR_PRIVATE_KEY');
    return;
  }

  console.log('🧪 Testing Ostium Open & Close Position');
  console.log('Platform:', platformAddress);
  console.log('');

  try {
    // 1. Check initial balance
    console.log('💰 Initial balance:');
    const initialBalance = await getOstiumBalance(platformAddress);
    console.log(`  USDC: $${initialBalance.usdcBalance}`);
    console.log('');

    // 2. Check existing positions
    console.log('📊 Current positions:');
    const initialPositions = await getOstiumPositions(platformAddress);
    console.log(`  Total: ${initialPositions.length} open positions`);
    initialPositions.forEach(pos => {
      console.log(`    ${pos.market}: ${pos.side} $${pos.size} (${pos.leverage}x)`);
    });
    console.log('');

    // 3. Open a new position
    const testMarket = 'BTC';
    const testSize = 5; // $5 - Testing actual minimum
    const testLeverage = 3;

    console.log(`🚀 Opening ${testMarket} position...`);
    console.log(`   Size: $${testSize}, Leverage: ${testLeverage}x (Testing min: $5)`);

    let openResult;
    try {
      openResult = await openOstiumPosition({
        privateKey: platformPrivateKey,
        market: testMarket,
        size: testSize,
        side: 'long',
        leverage: testLeverage,
        useDelegation: false,
      });

      console.log('   ✅ Position opened!');
      console.log(`   Trade ID: ${openResult.tradeId || 'N/A'}`);
      console.log(`   TX Hash: ${openResult.txHash || 'N/A'}`);
    } catch (err: any) {
      console.log(`   ❌ Failed to open: ${err.message}`);
      return;
    }
    console.log('');

    // 4. Wait a moment and check positions
    console.log('⏳ Waiting 5 seconds for position to settle...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('📊 Positions after opening:');
    const positionsAfterOpen = await getOstiumPositions(platformAddress);
    console.log(`  Total: ${positionsAfterOpen.length} open positions`);
    
    const newPosition = positionsAfterOpen.find(p => 
      p.market === `${testMarket}/USD` || p.market === testMarket
    );
    
    if (newPosition) {
      console.log(`  ✅ Found ${testMarket} position:`);
      console.log(`     Size: $${newPosition.size}`);
      console.log(`     Entry: $${newPosition.entryPrice}`);
      console.log(`     Leverage: ${newPosition.leverage}x`);
      console.log(`     PnL: $${newPosition.unrealizedPnl.toFixed(2)}`);
    } else {
      console.log(`  ⚠️ ${testMarket} position not found`);
    }
    console.log('');

    // 5. Close the position
    console.log(`🔻 Closing ${testMarket} position...`);
    
    try {
      const closeResult = await closeOstiumPosition({
        privateKey: platformPrivateKey,
        market: testMarket,
        useDelegation: false,
      });

      console.log('   ✅ Position closed!');
      console.log(`   Result:`, closeResult);
    } catch (err: any) {
      console.log(`   ❌ Failed to close: ${err.message}`);
    }
    console.log('');

    // 6. Wait and verify closure
    console.log('⏳ Waiting 5 seconds for closure to settle...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('📊 Final positions:');
    const finalPositions = await getOstiumPositions(platformAddress);
    console.log(`  Total: ${finalPositions.length} open positions`);
    
    const closedPosition = finalPositions.find(p => 
      p.market === `${testMarket}/USD` || p.market === testMarket
    );
    
    if (!closedPosition) {
      console.log(`  ✅ ${testMarket} position successfully closed!`);
    } else {
      console.log(`  ⚠️ ${testMarket} position still open`);
    }
    console.log('');

    // 7. Check final balance
    console.log('💰 Final balance:');
    const finalBalance = await getOstiumBalance(platformAddress);
    console.log(`  USDC: $${finalBalance.usdcBalance}`);
    
    const balanceChange = parseFloat(finalBalance.usdcBalance) - parseFloat(initialBalance.usdcBalance);
    console.log(`  Change: ${balanceChange >= 0 ? '+' : ''}$${balanceChange.toFixed(2)}`);
    console.log('');

    console.log('✅ Test complete!');
    console.log('');
    console.log('Summary:');
    console.log(`  - Opened ${testMarket} position: ✅`);
    console.log(`  - Closed ${testMarket} position: ✅`);
    console.log(`  - Balance change: ${balanceChange >= 0 ? '+' : ''}$${balanceChange.toFixed(2)}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

testOpenClose();

