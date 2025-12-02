import axios from 'axios';

const OSTIUM_SERVICE_URL = 'https://maxxit-1.onrender.com';
const AGENT_ADDRESS = '0x103725f6337Ba3a0aE65617e2dA55fEf64A80fFA';
const USER_ADDRESS = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function openBTCPosition() {
  console.log('\n🔵 Step 1: Opening BTC Position...\n');
  
  try {
    const response = await axios.post(`${OSTIUM_SERVICE_URL}/open-position`, {
      agentAddress: AGENT_ADDRESS,
      userAddress: USER_ADDRESS,
      market: 'BTC',
      side: 'long',
      collateral: 20, // $20 position
      leverage: 2,
    });

    if (response.data.success) {
      console.log('✅ BTC Position Opened!');
      console.log(`   Market: ${response.data.market}`);
      console.log(`   Tx Hash: ${response.data.result?.txHash || 'N/A'}`);
      return true;
    } else {
      console.error(`❌ Failed: ${response.data.error}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

async function getPositions() {
  const response = await axios.post(`${OSTIUM_SERVICE_URL}/positions`, {
    address: USER_ADDRESS,
  });
  return response.data.positions || [];
}

async function closeBTCPosition(tradeId: string) {
  console.log('\n🔴 Step 3: Closing BTC Position...\n');
  
  try {
    const response = await axios.post(`${OSTIUM_SERVICE_URL}/close-position`, {
      agentAddress: AGENT_ADDRESS,
      userAddress: USER_ADDRESS,
      market: 'BTC',
      tradeId: tradeId,
    });

    if (response.data.success) {
      console.log('✅ Close Request Sent!');
      console.log(`   Tx Hash: ${response.data.result?.txHash || 'EMPTY - CHECK RENDER LOGS'}`);
      console.log(`   PnL: $${response.data.closePnl || 0}`);
      return true;
    } else {
      console.error(`❌ Failed: ${response.data.error}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

async function testBTCOpenClose() {
  console.log('🧪 Testing BTC Open → Close Cycle\n');
  console.log('═══════════════════════════════════════════════\n');

  // Step 1: Open position
  const opened = await openBTCPosition();
  if (!opened) {
    console.log('\n❌ Failed to open position. Aborting.');
    return;
  }

  // Step 2: Wait and fetch positions
  console.log('\n⏳ Waiting 5 seconds for position to settle...\n');
  await sleep(5000);

  console.log('📊 Step 2: Fetching Positions...\n');
  const positions = await getPositions();
  
  const btcPosition = positions.find((p: any) => p.market.includes('BTC'));
  
  if (!btcPosition) {
    console.log('❌ BTC position not found! It might have failed or not settled yet.');
    console.log(`\nAll positions (${positions.length}):`);
    positions.forEach((p: any) => console.log(`  - ${p.market} (ID: ${p.tradeId})`));
    return;
  }

  console.log('✅ BTC Position Found!');
  console.log(`   Market: ${btcPosition.market}`);
  console.log(`   Trade ID: ${btcPosition.tradeId}`);
  console.log(`   Size: $${btcPosition.size}`);
  console.log(`   Leverage: ${btcPosition.leverage}x`);

  // Step 3: Close position
  const closed = await closeBTCPosition(btcPosition.tradeId);
  
  // Step 4: Verify
  console.log('\n⏳ Waiting 10 seconds for close to process...\n');
  await sleep(10000);

  console.log('📊 Step 4: Verifying Close...\n');
  const afterPositions = await getPositions();
  const btcStillOpen = afterPositions.find((p: any) => p.tradeId === btcPosition.tradeId);

  console.log('═══════════════════════════════════════════════\n');
  console.log('📊 RESULT:\n');
  
  if (!btcStillOpen) {
    console.log('✅ SUCCESS! BTC position CLOSED!');
    console.log('   The position is no longer in open trades.');
  } else {
    console.log('⚠️  PARTIAL: BTC position still in "Trades"');
    console.log('   It might be in "Orders" (pending close)');
    console.log('   Check Ostium UI to confirm status.');
  }

  console.log(`\nTotal open positions now: ${afterPositions.length}`);
  if (afterPositions.length > 0) {
    console.log('\nRemaining positions:');
    afterPositions.forEach((p: any) => console.log(`  - ${p.market} (ID: ${p.tradeId})`));
  }
}

testBTCOpenClose();

