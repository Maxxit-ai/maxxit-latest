#!/usr/bin/env ts-node
/**
 * Sync Hyperliquid Markets to Database
 * Fetches all available markets from Hyperliquid API and stores them in venue_markets table
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncHyperliquidMarkets() {
  console.log('🔄 Syncing Hyperliquid Markets from API...\n');
  
  try {
    // Use public Hyperliquid API directly
    const hyperliquidApiUrl = process.env.HYPERLIQUID_TESTNET === 'true'
      ? 'https://api.hyperliquid-testnet.xyz/info'
      : 'https://api.hyperliquid.xyz/info';
    
    // Fetch metadata from Hyperliquid API
    const response = await fetch(hyperliquidApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch markets: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.universe || !Array.isArray(data.universe)) {
      throw new Error('Invalid response from Hyperliquid service');
    }
    
    console.log(`📊 Found ${data.universe.length} markets from Hyperliquid\n`);
    
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (let index = 0; index < data.universe.length; index++) {
      const market = data.universe[index];
      
      try {
        const symbol = market.name; // e.g., "BTC", "ETH"
        
        const marketData = {
          venue: 'HYPERLIQUID' as const,
          token_symbol: symbol,
          market_name: `${symbol}/USD`, // Hyperliquid is always vs USD
          market_index: index, // Store the universe index for reference
          is_active: true,
          min_position: market.szDecimals ? parseFloat(`0.${'0'.repeat(market.szDecimals - 1)}1`) : undefined,
          max_leverage: market.maxLeverage ? parseInt(market.maxLeverage) : 50,
          group: 'crypto', // Hyperliquid only has crypto
          last_synced: new Date(),
          metadata: {
            szDecimals: market.szDecimals,
            onlyIsolated: market.onlyIsolated,
          },
        };
        
        // Upsert (create or update)
        const result = await prisma.venue_markets.upsert({
          where: {
            venue_token_symbol: {
              venue: 'HYPERLIQUID',
              token_symbol: symbol,
            },
          },
          update: {
            market_name: marketData.market_name,
            market_index: marketData.market_index,
            is_active: marketData.is_active,
            min_position: marketData.min_position,
            max_leverage: marketData.max_leverage,
            group: marketData.group,
            last_synced: marketData.last_synced,
            metadata: marketData.metadata,
          },
          create: marketData,
        });
        
        if (result.last_synced.getTime() === marketData.last_synced.getTime()) {
          created++;
        } else {
          updated++;
        }
        
        console.log(`  ✅ ${symbol} (Index: ${index}) - ${marketData.market_name} (Max Leverage: ${marketData.max_leverage}x)`);
      } catch (error: any) {
        console.error(`  ❌ ${market.name}: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Sync Summary:');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${data.universe.length}`);
    console.log('═'.repeat(60));
    
    return { created, updated, errors, total: data.universe.length };
    
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  syncHyperliquidMarkets()
    .then((result) => {
      console.log('\n✅ Hyperliquid markets synced successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed to sync Hyperliquid markets:', error);
      process.exit(1);
    });
}

export { syncHyperliquidMarkets };

