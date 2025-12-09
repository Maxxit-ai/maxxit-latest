/**
 * Test script to close an Ostium position
 * Usage: npx tsx scripts/test-close-ostium-position.ts
 */

import { closeOstiumPosition } from '../lib/adapters/ostium-adapter';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testClosePosition() {
  try {
    console.log('🔍 Testing Ostium Position Close...\n');

    const params = {
      agentAddress: process.env.TEST_AGENT_ADDRESS || '0xEE513B9D4AcB116c2691C8f2bE82B3323ED93905',
      userAddress: process.env.TEST_USER_ADDRESS || '0xa46697d8d59f064e46a25f02bc4d51fb70e80cc4',
      market: process.env.TEST_MARKET || 'BTC',
      tradeId: process.env.TEST_TRADE_ID || '121319',
      useDelegation: true,
      actualTradeIndex: process.env.TEST_TRADE_INDEX ? parseInt('0') : undefined,
    };

    console.log('📋 Parameters:');
    console.log(`   Agent Address: ${params.agentAddress}`);
    console.log(`   User Address: ${params.userAddress}`);
    console.log(`   Market: ${params.market}`);
    if (params.tradeId) {
      console.log(`   Trade ID: ${params.tradeId}`);
    }
    if (params.actualTradeIndex !== undefined) {
      console.log(`   Trade Index: ${params.actualTradeIndex}`);
    }
    console.log(`   Use Delegation: ${params.useDelegation}\n`);

    console.log('📤 Calling closeOstiumPosition...\n');

    const result = await closeOstiumPosition(params);

    const closePnl =
      typeof result?.closePnl === 'number'
        ? result.closePnl
        : typeof result?.result?.closePnl === 'number'
        ? result.result.closePnl
        : 0;

    console.log('✅ Position Close Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ Position closed successfully!');
      console.log(`   PnL: $${closePnl.toFixed(2)}`);
      if (result.result?.txHash) {
        console.log(`   TX Hash: ${result.result.txHash}`);
      }

      console.log('\nℹ️  APR calculator worker will:');
      console.log('   1. Sync accurate PnL from Ostium subgraph');
      console.log('   2. Automatically withdraw 10% of profit to agent wallet');
    } else {
      console.log('\n❌ Position close failed');
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
  } catch (error: any) {
    console.error('\n❌ Error closing position:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testClosePosition()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });