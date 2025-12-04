/**
 * Cleanup Script: Remove tweets from inactive CT accounts
 * This will delete all tweets from accounts marked as is_active = false
 * to prevent accidental LLM API calls when admin endpoints are triggered
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupInactiveAccounts() {
  console.log('🧹 CLEANUP: Removing tweets from inactive CT accounts...\n');

  // Get all inactive accounts
  const inactiveAccounts = await prisma.ct_accounts.findMany({
    where: { is_active: false },
    select: {
      id: true,
      x_username: true,
      _count: {
        select: {
          ct_posts: true
        }
      }
    }
  });

  console.log(`Found ${inactiveAccounts.length} inactive accounts\n`);

  let totalDeleted = 0;

  for (const account of inactiveAccounts) {
    const tweetCount = await prisma.ct_posts.count({
      where: { ct_account_id: account.id }
    });

    if (tweetCount > 0) {
      console.log(`Deleting ${tweetCount} tweets from @${account.x_username}...`);
      
      await prisma.ct_posts.deleteMany({
        where: { ct_account_id: account.id }
      });
      
      totalDeleted += tweetCount;
    }
  }

  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Tweets deleted: ${totalDeleted}`);
  console.log(`   Accounts cleaned: ${inactiveAccounts.length}`);

  await prisma.$disconnect();
}

// Run if executed directly
if (require.main === module) {
  cleanupInactiveAccounts()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { cleanupInactiveAccounts };

