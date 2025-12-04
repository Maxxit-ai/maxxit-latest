/**
 * Regenerate Ostium Agent Keys
 * 
 * This script regenerates Ostium agent addresses and re-encrypts the private keys
 * using the correct scrypt derivation method.
 * 
 * Use this if keys were encrypted with the old method (hex conversion) and need
 * to be re-encrypted with the new method (scrypt).
 */

import { PrismaClient } from '@prisma/client';
import { getOrCreateOstiumAgentAddress } from '../lib/deployment-agent-address';

const prisma = new PrismaClient();

async function regenerateOstiumKeys() {
  console.log('\n🔧 Regenerating Ostium Agent Keys\n');
  console.log('='.repeat(60));
  console.log('⚠️  WARNING: This will regenerate Ostium agent addresses!');
  console.log('⚠️  Users will need to re-whitelist on Ostium!');
  console.log('='.repeat(60));
  console.log();

  try {
    // Get all users with Ostium addresses
    const users = await prisma.user_agent_addresses.findMany({
      where: {
        ostium_agent_address: { not: null },
      },
      select: {
        user_wallet: true,
        ostium_agent_address: true,
      },
    });

    console.log(`📊 Found ${users.length} user(s) with Ostium addresses\n`);

    if (users.length === 0) {
      console.log('✅ No users to regenerate');
      await prisma.$disconnect();
      return;
    }

    let regenerated = 0;
    let errors = 0;

    for (const user of users) {
      try {
        console.log(`🔄 Regenerating for user: ${user.user_wallet.substring(0, 10)}...`);
        console.log(`   Old address: ${user.ostium_agent_address}`);

        // Delete old Ostium address and keys (forces regeneration)
        await prisma.user_agent_addresses.update({
          where: { user_wallet: user.user_wallet.toLowerCase() },
          data: {
            ostium_agent_address: null,
            ostium_agent_key_encrypted: null,
            ostium_agent_key_iv: null,
            ostium_agent_key_tag: null,
          },
        });

        // Regenerate address (this will create new encrypted key with scrypt)
        const result = await getOrCreateOstiumAgentAddress({
          userWallet: user.user_wallet,
        });

        console.log(`   ✅ New address: ${result.address}`);
        console.log(`   ⚠️  User must re-whitelist this address on Ostium!\n`);

        regenerated++;
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}\n`);
        errors++;
      }
    }

    console.log('='.repeat(60));
    console.log(`✅ Regenerated: ${regenerated}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('='.repeat(60));
    console.log();
    console.log('⚠️  IMPORTANT: Users must re-whitelist their new Ostium addresses!');
    console.log();

  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  regenerateOstiumKeys().catch(console.error);
}

export { regenerateOstiumKeys };

