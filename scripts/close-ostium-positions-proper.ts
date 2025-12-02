#!/usr/bin/env tsx
/**
 * Properly Close Ostium Positions
 * Uses Ostium's close_trade function (no USDC needed!)
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
  const market = position.market.split('/')[0]; // "ADA/USD" -> "ADA"
  
  console.log(`   Trade ID: ${position.tradeId}`);
  console.log(`   Closing via Ostium close_trade function...`);
  
  try {
    // Use Ostium's actual close endpoint
    const response = await fetch(`${OSTIUM_SERVICE_URL}/close-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentAddress: AGENT_ADDRESS,
        userAddress: USER_ADDRESS,
        market: market,
        tradeId: position.tradeId,
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      return {
        success: true,
        txHash: data.result?.txHash || data.txHash,
        pnl: data.closePnl || data.result?.closePnl || 0,
      };
    } else {
      return {
        success: false,
        error: data.error || 'Unknown error',
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
  console.log('🔄 Closing Ostium Positions (Properly)\n');
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
    console.log(`${i + 1}. ${pos.market} ${pos.side.toUpperCase()}`);
    console.log(`   Size: $${pos.size} | Leverage: ${pos.leverage}x | Trade ID: ${pos.tradeId}`);
  });
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('');
  console.log('💡 Using Ostium close_trade() - NO USDC NEEDED!');
  console.log('   Agent just pays gas with ETH');
  console.log('');
  console.log('═'.repeat(70));
  console.log('');
  
  let successCount = 0;
  let failCount = 0;
  const results: any[] = [];
  
  // Close each position
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    
    console.log(`[${i + 1}/${positions.length}] Closing ${position.market} ${position.side.toUpperCase()}...`);
    
    const result = await closePosition(position);
    results.push({ position, result });
    
    if (result.success) {
      console.log(`   ✅ SUCCESS`);
      console.log(`   TX: ${result.txHash?.substring(0, 20)}...`);
      console.log(`   PnL: $${result.pnl}`);
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
  
  if (successCount > 0) {
    console.log('');
    console.log('💰 CLOSED POSITIONS:\n');
    results.filter(r => r.result.success).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.position.market} | PnL: $${r.result.pnl}`);
    });
  }
  
  console.log('');
}

main().catch(console.error);

