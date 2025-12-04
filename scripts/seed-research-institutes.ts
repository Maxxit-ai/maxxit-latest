/**
 * Seed Research Institutes
 * Populates the database with initial research institutes for testing
 * 
 * Run: npx tsx scripts/seed-research-institutes.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_INSTITUTES = [
  {
    name: 'LunarCrush Analytics',
    description: 'AI-powered social intelligence for crypto. Tracks social sentiment, volume, and engagement across major cryptocurrencies.',
    logo_url: 'https://lunarcrush.com/img/lunarcrush-square.png',
    website_url: 'https://lunarcrush.com',
    x_handle: 'LunarCrush',
    is_active: true,
  },
  {
    name: 'Coinbase Institutional Research',
    description: 'Professional-grade crypto research from Coinbase. Provides market analysis, institutional insights, and macro perspectives.',
    logo_url: 'https://images.ctfassets.net/c5bd0wqjc7v0/6VE4cRLZkQcjNp9wDZbzYO/e5b46a8a7f1f2f1f2f1f2f1f2f1f2f1f/coinbase-icon.png',
    website_url: 'https://www.coinbase.com/institutional/research',
    x_handle: 'CoinbaseInst',
    is_active: true,
  },
  {
    name: 'Messari Research',
    description: 'Crypto research and data platform. Delivers unbiased analysis on digital assets, protocols, and market trends.',
    logo_url: 'https://messari.io/wp-content/uploads/2021/01/messari-icon.png',
    website_url: 'https://messari.io/research',
    x_handle: 'MessariCrypto',
    is_active: true,
  },
  {
    name: 'Glassnode Insights',
    description: 'On-chain analytics and market intelligence. Provides data-driven insights into Bitcoin and Ethereum markets.',
    logo_url: 'https://glassnode.com/assets/img/glassnode-icon.png',
    website_url: 'https://glassnode.com/insights',
    x_handle: 'glassnode',
    is_active: true,
  },
  {
    name: 'Delphi Digital',
    description: 'Multi-service research and investment firm. Covers DeFi, NFTs, gaming, and emerging crypto sectors.',
    logo_url: 'https://delphidigital.io/wp-content/uploads/2021/01/delphi-icon.png',
    website_url: 'https://delphidigital.io',
    x_handle: 'Delphi_Digital',
    is_active: true,
  },
];

async function seedInstitutes() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║        🌱 SEEDING RESEARCH INSTITUTES                        ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    let created = 0;
    let skipped = 0;

    for (const instituteData of DEFAULT_INSTITUTES) {
      try {
        // Check if already exists
        const existing = await prisma.research_institutes.findUnique({
          where: { name: instituteData.name },
        });

        if (existing) {
          console.log(`⏭️  ${instituteData.name}: Already exists (skipped)`);
          skipped++;
          continue;
        }

        // Create new institute
        const institute = await prisma.research_institutes.create({
          data: instituteData,
        });

        console.log(`✅ ${instituteData.name}: Created (ID: ${institute.id.substring(0, 8)}...)`);
        created++;
      } catch (error: any) {
        console.error(`❌ ${instituteData.name}: Failed - ${error.message}`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${created + skipped}/${DEFAULT_INSTITUTES.length}`);
    console.log('\n✅ Seeding complete!\n');

    // List all active institutes
    const allInstitutes = await prisma.research_institutes.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        description: true,
        x_handle: true,
      },
    });

    console.log(`📋 Active Research Institutes (${allInstitutes.length}):\n`);
    allInstitutes.forEach((inst, index) => {
      console.log(`${index + 1}. ${inst.name}`);
      console.log(`   ID: ${inst.id}`);
      if (inst.x_handle) console.log(`   X: @${inst.x_handle}`);
      console.log('');
    });

    return { success: true, created, skipped };
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Auto-run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedInstitutes()
    .then(result => {
      console.log('[SeedInstitutes] Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[SeedInstitutes] Fatal error:', error);
      process.exit(1);
    });
}

export { seedInstitutes };

