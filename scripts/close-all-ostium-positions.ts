#!/usr/bin/env tsx
/**
 * Close All Open Ostium Positions
 * Tests position closing functionality by opening opposite positions
 */

const OSTIUM_SERVICE_URL = 'https://maxxit-1.onrender.com';
const AGENT_ADDRESS = '0x103725f6337Ba3a0aE65617e2dA55fEf64A80fFA';
const USER_ADDRESS = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';

interface Position {
  market: string;
  side: string;
  size: number;
  entryPrice: number;
  leverage: number;
  tradeId: string;
}

async function getOpenPositions(): Promise<Position[]> {
  const response = await fetch(`${OSTIUM_SERVICE_URL}/positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: USER_ADDRESS }),
  });
  
  const data = await response.json();
  return data.success ? data.positions : [];
}

async function closePosition(position: Position) {
  // Extract market symbol (e.g., "ADA/USD" -> "ADA")
  const market = position.market.split('/')[0];
  
  // Open opposite position to close
  const payload = {
    agentAddress: AGENT_ADDRESS,
    userAddress: USER_ADDRESS,
    market: market,
    side: position.side === 'long' ? 'short' : 'long', // Opposite side
    size: position.size,
    leverage: position.leverage,
  };
  
  console.log(`   Closing via ${payload.side} position...`);
  
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/open-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      return {
        success: true,
        orderId: data.orderId,
        txHash: data.transactionHash,
      };
    } else {
      return {
        success: false,
        error: data.error,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function main() {
  console.log('🔄 Closing All Ostium Positions\n');
  console.log('═'.repeat(70));
  console.log('');
  
  // Get open positions
  console.log('📊 Fetching open positions...\n');
  const positions = await getOpenPositions();
  
  if (positions.length === 0) {
    console.log('✅ No open positions to close!');
    return;
  }
  
  console.log(`Found ${positions.length} open positions:\n`);
  
  positions.forEach((pos, i) => {
    console.log(`${i + 1}. ${pos.market} ${pos.side.toUpperCase()} | Size: $${pos.size} | Leverage: ${pos.leverage}x`);
  });
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('');
  console.log('⚠️  NOTE: Closing by opening opposite positions');
  console.log('   This hedges the position (net zero exposure)');
  console.log('');
  console.log('═'.repeat(70));
  console.log('');
  
  let successCount = 0;
  let failCount = 0;
  
  // Close each position
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    
    console.log(`[${i + 1}/${positions.length}] Closing ${position.market} ${position.side.toUpperCase()}...`);
    
    const result = await closePosition(position);
    
    if (result.success) {
      console.log(`   ✅ SUCCESS - Order ID: ${result.orderId}`);
      console.log(`   TX: ${result.txHash?.substring(0, 20)}...`);
      successCount++;
    } else {
      console.log(`   ❌ FAILED - ${result.error}`);
      failCount++;
    }
    
    console.log('');
    
    // Small delay
    if (i < positions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  console.log('═'.repeat(70));
  console.log('');
  console.log('📊 SUMMARY\n');
  console.log(`   Total Positions: ${positions.length}`);
  console.log(`   ✅ Closed: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log('');
  console.log('💡 Orders created - waiting for keepers to fill');
  console.log('');
}

main().catch(console.error);

