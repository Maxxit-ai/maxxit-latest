#!/usr/bin/env tsx
/**
 * Test Ostium Service After Deployment
 * Run this after redeploying to Render to verify everything works
 */

const OSTIUM_SERVICE_URL = 'https://maxxit-1.onrender.com';

const PLATFORM_WALLET = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';
const AGENT_WALLET = '0x103725f6337Ba3a0aE65617e2dA55fEf64A80fFA';

async function testOstiumService() {
  console.log('🧪 Testing Ostium Service After Deployment');
  console.log('='.repeat(60));
  console.log('');

  // Test 1: Health Check
  console.log('1️⃣  Health Check...');
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/health`);
    const data = await response.json();
    
    if (response.ok && data.status === 'ok') {
      console.log('   ✅ Service is running');
      console.log('   Network:', data.network);
      console.log('   Timestamp:', data.timestamp);
    } else {
      console.log('   ❌ Health check failed');
      console.log('   Response:', data);
      return;
    }
  } catch (error: any) {
    console.log('   ❌ Cannot connect to service');
    console.log('   Error:', error.message);
    return;
  }
  console.log('');

  // Test 2: Available Markets
  console.log('2️⃣  Fetching Available Markets...');
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/available-markets`);
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('   ✅ Markets loaded:', data.count);
      const marketsList = Object.keys(data.markets).slice(0, 5).join(', ');
      console.log('   Markets:', marketsList, '...');
    } else {
      console.log('   ⚠️  Markets API error:', data.error);
    }
  } catch (error: any) {
    console.log('   ❌ Failed to fetch markets:', error.message);
  }
  console.log('');

  // Test 3: Database Connection (Open Position with agent)
  console.log('3️⃣  Testing Database Connection (Agent Key Fetch)...');
  console.log('   Agent Address:', AGENT_WALLET);
  console.log('   User Address:', PLATFORM_WALLET);
  console.log('');

  try {
    const payload = {
      agentAddress: AGENT_WALLET,
      userAddress: PLATFORM_WALLET,
      market: 'BTC',
      side: 'long',
      size: 5000, // $5000 USD
      leverage: 2,
    };

    console.log('   📤 Opening BTC position...');
    console.log('      Size: $' + payload.size);
    console.log('      Leverage: ' + payload.leverage + 'x');
    console.log('      Side:', payload.side);
    console.log('');

    const response = await fetch(`${OSTIUM_SERVICE_URL}/open-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('   ✅ Position opened successfully!');
      console.log('      Order ID:', data.orderId);
      console.log('      Transaction Hash:', data.transactionHash);
      console.log('      Status:', data.status);
      console.log('');
      console.log('   🎉 Database connection working!');
      console.log('   🎉 Agent key fetched from wallet_pool!');
      console.log('   🎉 Position executed via delegation!');
      console.log('');
      console.log('   📋 View on Arbiscan:');
      console.log('      https://sepolia.arbiscan.io/tx/' + data.transactionHash);
    } else {
      console.log('   ❌ Position failed');
      console.log('   Error:', data.error);
      console.log('');
      
      // Specific error handling
      if (data.error?.includes('psycopg2')) {
        console.log('   ⚠️  DATABASE ISSUE: psycopg2 module still not installed');
        console.log('   👉 Action: Clear build cache and redeploy on Render');
      } else if (data.error?.includes('DATABASE_URL')) {
        console.log('   ⚠️  DATABASE ISSUE: DATABASE_URL not configured');
        console.log('   👉 Action: Set DATABASE_URL in Render environment variables');
      } else if (data.error?.includes('not found in wallet pool')) {
        console.log('   ⚠️  DATABASE ISSUE: Agent not in wallet pool');
        console.log('   👉 Action: Run scripts/add-wallets-to-pool.ts');
      } else if (data.error?.includes('Sufficient allowance')) {
        console.log('   ⚠️  APPROVAL ISSUE: User needs to approve USDC spending');
        console.log('   👉 This is expected if user has $0 USDC or no approval');
      } else if (data.error?.includes('BelowMinLevPos')) {
        console.log('   ⚠️  POSITION SIZE: Below minimum ($5000 USD required)');
        console.log('   👉 This test uses $5000, so this is unexpected');
      }
    }
  } catch (error: any) {
    console.log('   ❌ Request failed:', error.message);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Test complete!');
}

testOstiumService().catch(console.error);

