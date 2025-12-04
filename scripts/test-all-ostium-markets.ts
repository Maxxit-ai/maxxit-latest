#!/usr/bin/env tsx
/**
 * Test All Ostium Markets
 * Opens a position in each available market to verify integration
 */

const OSTIUM_SERVICE_URL = 'https://maxxit-1.onrender.com';
const AGENT_ADDRESS = '0x103725f6337Ba3a0aE65617e2dA55fEf64A80fFA';
const USER_ADDRESS = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';

// Use $20 per position (Ostium minimum is $5 per support team)
const POSITION_SIZE = 20;
const LEVERAGE = 2;

interface TestResult {
  market: string;
  success: boolean;
  orderId?: string;
  txHash?: string;
  error?: string;
}

async function getAvailableMarkets(): Promise<string[]> {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/available-markets`);
    const data = await response.json();
    
    if (data.success && data.markets) {
      return Object.keys(data.markets);
    }
  } catch (error) {
    console.error('Failed to fetch markets:', error);
  }
  
  return [];
}

async function openPosition(market: string): Promise<TestResult> {
  const payload = {
    agentAddress: AGENT_ADDRESS,
    userAddress: USER_ADDRESS,
    market,
    side: 'long',
    size: POSITION_SIZE,
    leverage: LEVERAGE,
  };
  
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/open-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      return {
        market,
        success: true,
        orderId: data.orderId,
        txHash: data.transactionHash,
      };
    } else {
      return {
        market,
        success: false,
        error: data.error || 'Unknown error',
      };
    }
  } catch (error: any) {
    return {
      market,
      success: false,
      error: error.message,
    };
  }
}

async function testAllMarkets() {
  console.log('🧪 Testing All Ostium Markets\n');
  console.log('═'.repeat(70));
  console.log('');
  console.log('📋 Configuration:');
  console.log('   User Address:', USER_ADDRESS);
  console.log('   Agent Address:', AGENT_ADDRESS);
  console.log('   Position Size: $' + POSITION_SIZE + ' per market');
  console.log('   Leverage:', LEVERAGE + 'x');
  console.log('');
  
  // Get available markets
  console.log('📡 Fetching available markets...\n');
  const markets = await getAvailableMarkets();
  
  if (markets.length === 0) {
    console.error('❌ No markets found!');
    return;
  }
  
  console.log(`✅ Found ${markets.length} markets to test\n`);
  console.log('═'.repeat(70));
  console.log('');
  
  const results: TestResult[] = [];
  let successCount = 0;
  let failCount = 0;
  
  // Test each market with a small delay between requests
  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    
    console.log(`[${i + 1}/${markets.length}] Testing ${market}...`);
    
    const result = await openPosition(market);
    results.push(result);
    
    if (result.success) {
      console.log(`   ✅ SUCCESS - Order ID: ${result.orderId}`);
      console.log(`   TX: ${result.txHash?.substring(0, 20)}...`);
      successCount++;
    } else {
      console.log(`   ❌ FAILED - ${result.error}`);
      failCount++;
    }
    
    console.log('');
    
    // Small delay to avoid rate limiting
    if (i < markets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }
  }
  
  // Summary
  console.log('═'.repeat(70));
  console.log('');
  console.log('📊 TEST SUMMARY\n');
  console.log(`   Total Markets: ${markets.length}`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   Success Rate: ${((successCount / markets.length) * 100).toFixed(1)}%`);
  console.log('');
  
  // Detailed results
  console.log('📋 SUCCESSFUL POSITIONS:\n');
  results.filter(r => r.success).forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.market.padEnd(10)} | Order: ${r.orderId} | TX: ${r.txHash?.substring(0, 16)}...`);
  });
  
  if (failCount > 0) {
    console.log('');
    console.log('❌ FAILED POSITIONS:\n');
    results.filter(r => !r.success).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.market.padEnd(10)} | Error: ${r.error?.substring(0, 60)}...`);
    });
  }
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('');
  console.log('💡 TIP: View all transactions on Arbiscan Sepolia');
  console.log('   https://sepolia.arbiscan.io/address/' + AGENT_ADDRESS);
  console.log('');
}

testAllMarkets().catch(console.error);

