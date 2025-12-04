#!/usr/bin/env ts-node
/**
 * Sync Ostium Markets to Database
 * Fetches all available markets from Ostium SDK and stores them in venue_markets table
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncOstiumMarkets() {
  console.log('🔄 Syncing Ostium Markets from SDK...\n');
  
  try {
    // Call Python script to fetch all markets from SDK
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const scriptPath = './services/fetch-all-ostium-markets.py';
    const { stdout, stderr } = await execAsync(`cd services && source venv/bin/activate && python3 ../services/fetch-all-ostium-markets.py`);
    
    if (stderr && !stderr.includes('UserWarning')) {
      console.error('Python stderr:', stderr);
    }
    
    const data = JSON.parse(stdout);
    
    if (!data.success || !data.markets) {
      throw new Error(data.error || 'Invalid response from Python script');
    }
    
    console.log(`📊 Found ${data.count} markets from Ostium SDK\n`);
    
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (const market of data.markets) {
      try {
        const symbol = market.symbol || `UNKNOWN_${market.index}`;
        const marketData = {
          venue: 'OSTIUM' as const,
          token_symbol: symbol,
          market_name: market.name,
          market_index: market.index,
          is_active: market.isMarketOpen !== false, // Default to true if not specified
          min_position: market.minLevPos ? parseFloat(market.minLevPos) : null,
          max_leverage: market.maxLeverage ? parseInt(market.maxLeverage) : null,
          group: market.group || null,
          current_price: market.currentPrice ? parseFloat(market.currentPrice) : null,
          last_synced: new Date(),
        };
        
        // Upsert (create or update)
        const result = await prisma.venue_markets.upsert({
          where: {
            venue_token_symbol: {
              venue: 'OSTIUM',
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
            current_price: marketData.current_price,
            last_synced: marketData.last_synced,
          },
          create: marketData,
        });
        
        if (result.last_synced.getTime() === marketData.last_synced.getTime()) {
          created++;
        } else {
          updated++;
        }
        
        const statusIcon = marketData.is_active ? '✅' : '⏸️';
        const groupLabel = marketData.group ? `[${marketData.group}]` : '';
        console.log(`  ${statusIcon} ${symbol} (Index: ${market.index}) - ${market.name} ${groupLabel}`);
      } catch (error: any) {
        console.error(`  ❌ ${market.symbol || market.index}: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Sync Summary:');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${data.count}`);
    console.log('═'.repeat(60));
    
    return { created, updated, errors, total: data.count };
    
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  syncOstiumMarkets()
    .then((result) => {
      console.log('\n✅ Ostium markets synced successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed to sync Ostium markets:', error);
      process.exit(1);
    });
}

export { syncOstiumMarkets };

