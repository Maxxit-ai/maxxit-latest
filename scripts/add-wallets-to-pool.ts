/**
 * Add wallets to the wallet pool
 * Usage: npx tsx scripts/add-wallets-to-pool.ts [count]
 */

import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addWalletsToPool(count: number = 10) {
  console.log(`🔧 Adding ${count} wallets to pool...`);
  console.log('');
  
  // Generate wallets
  console.log('⚙️  Generating wallets...');
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom();
    wallets.push({
      address: wallet.address,
      private_key: wallet.privateKey,
    });
    console.log(`  ${i + 1}. ${wallet.address}`);
  }
  console.log('');

  // Insert into database
  console.log('💾 Inserting into database...');
  let inserted = 0;
  
  for (const wallet of wallets) {
    try {
      await prisma.wallet_pool.create({
        data: {
          address: wallet.address,
          private_key: wallet.private_key,
          assigned_to_user_wallet: null,
        },
      });
      inserted++;
    } catch (error: any) {
      console.error(`  ⚠️  Failed to insert ${wallet.address}: ${error.message}`);
    }
  }
  
  console.log(`  ✅ Inserted ${inserted}/${count} wallets`);
  console.log('');

  // Show updated stats
  console.log('📊 Updated Pool Stats:');
  const total = await prisma.wallet_pool.count();
  const assigned = await prisma.wallet_pool.count({
    where: { assigned_to_user_wallet: { not: null } },
  });
  const available = total - assigned;
  
  console.log(`  Total: ${total}`);
  console.log(`  Assigned: ${assigned}`);
  console.log(`  Available: ${available} ✅`);
  console.log('');
  
  console.log('✅ Done! Users can now deploy Ostium agents.');
  
  await prisma.$disconnect();
}

// Get count from command line args or default to 20
const count = parseInt(process.argv[2] || '20', 10);

if (isNaN(count) || count < 1 || count > 100) {
  console.error('❌ Invalid count. Please provide a number between 1 and 100.');
  console.error('Usage: npx tsx scripts/add-wallets-to-pool.ts [count]');
  process.exit(1);
}

addWalletsToPool(count);

