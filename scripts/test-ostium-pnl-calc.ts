#!/usr/bin/env ts-node
/**
 * Test script to verify Ostium PnL calculation with actual position data
 */

import axios from 'axios';
import { getOstiumPositions } from '../lib/adapters/ostium-adapter';

const OSTIUM_SERVICE_URL = process.env.OSTIUM_SERVICE_URL || 'http://localhost:5002';

async function testPnLCalculation(address: string) {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           OSTIUM PnL CALCULATION TEST                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log(`Testing address: ${address}\n`);

  try {
    // Get positions from service
    console.log('📥 Fetching positions from Ostium service...\n');
    const positions = await getOstiumPositions(address);
    
    if (positions.length === 0) {
      console.log('❌ No positions found');
      return;
    }

    console.log(`✅ Found ${positions.length} open positions\n`);
    console.log('═'.repeat(70));

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      console.log(`\n📊 POSITION #${i + 1}: ${pos.market} ${pos.side.toUpperCase()}`);
      console.log('─'.repeat(70));
      
      console.log('\n🔢 Basic Position Details:');
      console.log(`   Collateral:    $${pos.size.toFixed(2)} USDC`);
      console.log(`   Entry Price:   $${pos.entryPrice.toFixed(4)}`);
      console.log(`   Leverage:      ${pos.leverage}x`);
      console.log(`   Trade ID:      ${pos.tradeId}`);
      
      // Check for new fields
      const hasNewFields = (pos as any).tradeNotional !== undefined;
      
      if (hasNewFields) {
        console.log('\n✅ NEW FIELDS AVAILABLE:');
        console.log(`   Trade Notional (wei): ${(pos as any).tradeNotional}`);
        console.log(`   Position Size:        ${(pos as any).positionSize?.toFixed(6)} tokens`);
        console.log(`   Funding Fees (wei):   ${(pos as any).funding}`);
        console.log(`   Rollover Fees (wei):  ${(pos as any).rollover}`);
        console.log(`   Total Fees:           $${(pos as any).totalFees?.toFixed(6)}`);
      } else {
        console.log('\n⚠️  NEW FIELDS NOT AVAILABLE');
        console.log('   Service may need to be restarted');
      }

      // Get current price
      try {
        const tokenSymbol = pos.market.replace('/USD', '').replace('/USDT', '');
        const priceResponse = await axios.get(`${OSTIUM_SERVICE_URL}/price/${tokenSymbol}`, { timeout: 5000 });
        
        if (priceResponse.data.success && priceResponse.data.price) {
          const currentPrice = parseFloat(priceResponse.data.price);
          console.log(`\n💰 Current Price: $${currentPrice.toFixed(4)}`);
          
          // Calculate PnL using new method
          if (hasNewFields) {
            const positionSizeInTokens = (pos as any).positionSize || ((pos.size * pos.leverage) / pos.entryPrice);
            const isLong = pos.side.toLowerCase() === 'long';
            
            let pnlUSD = 0;
            if (isLong) {
              pnlUSD = positionSizeInTokens * (currentPrice - pos.entryPrice);
            } else {
              pnlUSD = positionSizeInTokens * (pos.entryPrice - currentPrice);
            }
            
            // Add fees
            const totalFees = (pos as any).totalFees || 0;
            pnlUSD += totalFees;
            
            const pnlPercent = pos.size > 0 ? (pnlUSD / pos.size) * 100 : 0;
            
            console.log('\n📈 CALCULATED PnL (NEW METHOD):');
            console.log(`   Position Size:  ${positionSizeInTokens.toFixed(6)} tokens`);
            console.log(`   Price Change:   $${(currentPrice - pos.entryPrice).toFixed(4)} (${((currentPrice / pos.entryPrice - 1) * 100).toFixed(2)}%)`);
            console.log(`   PnL (price):    $${(pnlUSD - totalFees).toFixed(2)}`);
            console.log(`   PnL (fees):     $${totalFees.toFixed(4)}`);
            console.log(`   ─────────────────────────────────────`);
            console.log(`   Total PnL:      $${pnlUSD.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
            
            // Show if trailing stop would be active
            if (pnlPercent >= 3) {
              console.log(`   ✅ Trailing stop ACTIVE (need +3%)`);
            } else {
              console.log(`   ⏳ Trailing stop inactive (need +3%, current: ${pnlPercent.toFixed(2)}%)`);
            }
          } else {
            // Old calculation method (fallback)
            const positionSizeInTokens = (pos.size * pos.leverage) / pos.entryPrice;
            const isLong = pos.side.toLowerCase() === 'long';
            
            let pnlUSD = 0;
            if (isLong) {
              pnlUSD = positionSizeInTokens * (currentPrice - pos.entryPrice);
            } else {
              pnlUSD = positionSizeInTokens * (pos.entryPrice - currentPrice);
            }
            
            const pnlPercent = pos.size > 0 ? (pnlUSD / pos.size) * 100 : 0;
            
            console.log('\n📈 CALCULATED PnL (OLD METHOD - FALLBACK):');
            console.log(`   Position Size:  ${positionSizeInTokens.toFixed(6)} tokens (calculated)`);
            console.log(`   Price Change:   $${(currentPrice - pos.entryPrice).toFixed(4)} (${((currentPrice / pos.entryPrice - 1) * 100).toFixed(2)}%)`);
            console.log(`   Total PnL:      $${pnlUSD.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
            console.log(`   ⚠️  Does not include funding/rollover fees`);
          }
        }
      } catch (priceError: any) {
        console.log(`\n⚠️  Could not fetch current price: ${priceError.message}`);
      }
      
      console.log('\n' + '═'.repeat(70));
    }

    console.log('\n✅ Test complete\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run test
const address = process.argv[2] || '0xa10846a81528d429b50b0dcbf8968938a572fac5';
testPnLCalculation(address).catch(console.error);

