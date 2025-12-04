/**
 * Clear All Agent Data Except My Wallet
 * 
 * Preserves data for specified wallet(s) and deletes everything else
 * 
 * Usage:
 *   npx tsx scripts/clear-all-except-my-wallet.ts --wallet 0x... [--confirm]
 *   npx tsx scripts/clear-all-except-my-wallet.ts --wallet 0x... --wallet 0x... [--confirm]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearAllExceptMyWallet(preserveWallets: string[], confirm: boolean = false) {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║      🗑️  CLEAR ALL DATA EXCEPT MY WALLET(S)              ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (preserveWallets.length === 0) {
    console.error('❌ No wallet(s) specified to preserve!');
    console.log('\nUsage:');
    console.log('  npx tsx scripts/clear-all-except-my-wallet.ts --wallet 0x... [--confirm]');
    console.log('  npx tsx scripts/clear-all-except-my-wallet.ts --wallet 0x... --wallet 0x... [--confirm]\n');
    return { success: false, error: 'No wallets specified' };
  }

  // Normalize wallets to lowercase
  const normalizedWallets = preserveWallets.map(w => w.toLowerCase());
  
  console.log(`📋 Preserving data for ${normalizedWallets.length} wallet(s):`);
  for (const wallet of normalizedWallets) {
    console.log(`   • ${wallet}`);
  }
  console.log('');

  if (!confirm) {
    console.log('⚠️  DRY RUN MODE - No data will be deleted\n');
    console.log('Add --confirm flag to actually delete data:\n');
    console.log('  npx tsx scripts/clear-all-except-my-wallet.ts --wallet 0x... --confirm\n');
  } else {
    console.log('🚨 DELETION MODE - Data will be permanently deleted!\n');
  }

  try {
    // Count data to preserve vs delete
    console.log('📊 Analyzing Data...\n');

    const allDeployments = await prisma.agent_deployments.findMany({
      select: {
        id: true,
        user_wallet: true,
        safe_wallet: true,
      },
    });

    const myDeployments = allDeployments.filter(d => {
      const userWallet = (d.user_wallet || '').toLowerCase();
      const safeWallet = (d.safe_wallet || '').toLowerCase();
      return normalizedWallets.includes(userWallet) || normalizedWallets.includes(safeWallet);
    });

    const otherDeployments = allDeployments.filter(d => {
      const userWallet = (d.user_wallet || '').toLowerCase();
      const safeWallet = (d.safe_wallet || '').toLowerCase();
      return !normalizedWallets.includes(userWallet) && !normalizedWallets.includes(safeWallet);
    });

    const myDeploymentIds = myDeployments.map(d => d.id);
    const otherDeploymentIds = otherDeployments.map(d => d.id);

    console.log(`My Deployments: ${myDeployments.length}`);
    console.log(`Other Deployments: ${otherDeployments.length}\n`);

    // Get agent IDs for my deployments vs other deployments
    const myAgentIds = Array.from(new Set(myDeployments.map(d => d.agent_id).filter(Boolean)));
    const otherAgentIds = Array.from(new Set(otherDeployments.map(d => d.agent_id).filter(Boolean)));

    // Count what will be deleted
    const counts = {
      agents: await prisma.agents.count(),
      myDeployments: myDeployments.length,
      otherDeployments: otherDeployments.length,
      signals: otherAgentIds.length > 0 ? await prisma.signals.count({
        where: {
          agent_id: { in: otherAgentIds },
        },
      }) : 0,
      positions: otherDeploymentIds.length > 0 ? await prisma.positions.count({
        where: {
          deployment_id: { in: otherDeploymentIds },
        },
      }) : 0,
      userAddresses: await prisma.user_agent_addresses.count({
        where: {
          user_wallet: { notIn: normalizedWallets },
        },
      }),
      userPreferences: await prisma.user_trading_preferences.count({
        where: {
          user_wallet: { notIn: normalizedWallets },
        },
      }),
    };

    console.log('📊 Data to DELETE:');
    console.log(`   Other Users' Deployments: ${counts.otherDeployments}`);
    console.log(`   Signals (other users): ${counts.signals}`);
    console.log(`   Positions (other users): ${counts.positions}`);
    console.log(`   User Addresses (other users): ${counts.userAddresses}`);
    console.log(`   User Preferences (other users): ${counts.userPreferences}\n`);

    console.log('📊 Data to PRESERVE:');
    console.log(`   My Deployments: ${counts.myDeployments}`);
    console.log(`   My Signals: (will be preserved)`);
    console.log(`   My Positions: (will be preserved)`);
    console.log(`   My Addresses: (will be preserved)`);
    console.log(`   My Preferences: (will be preserved)\n`);

    const totalToDelete = counts.otherDeployments + counts.signals + counts.positions + 
                          counts.userAddresses + counts.userPreferences;

    if (totalToDelete === 0) {
      console.log('✅ No data to delete - only your data exists!\n');
      return { success: true, deleted: 0 };
    }

    if (!confirm) {
      console.log('💡 Run with --confirm to delete this data\n');
      return { success: true, deleted: 0, dryRun: true };
    }

    // Confirm deletion
    console.log('🚨 DELETING DATA IN 5 SECONDS...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🗑️  Starting deletion...\n');

    let totalDeleted = 0;

    // 1. Delete positions from other deployments
    const deletedPositions = otherDeploymentIds.length > 0 ? await prisma.positions.deleteMany({
      where: {
        deployment_id: { in: otherDeploymentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedPositions.count} positions (other users)`);
    totalDeleted += deletedPositions.count;

    // 2. Delete signals from other agents
    const deletedSignals = otherAgentIds.length > 0 ? await prisma.signals.deleteMany({
      where: {
        agent_id: { in: otherAgentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedSignals.count} signals (other users)`);
    totalDeleted += deletedSignals.count;

    // 3. Delete other deployments
    const deletedDeployments = otherDeploymentIds.length > 0 ? await prisma.agent_deployments.deleteMany({
      where: {
        id: { in: otherDeploymentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedDeployments.count} deployments (other users)`);
    totalDeleted += deletedDeployments.count;

    // 4. Delete agents that have no deployments (orphaned)
    const deletedAgents = otherAgentIds.length > 0 ? await prisma.agents.deleteMany({
      where: {
        id: { in: otherAgentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedAgents.count} agents (other users)`);
    totalDeleted += deletedAgents.count;

    // 5. Delete user addresses for other users
    const deletedAddresses = await prisma.user_agent_addresses.deleteMany({
      where: {
        user_wallet: { notIn: normalizedWallets },
      },
    });
    console.log(`✅ Deleted ${deletedAddresses.count} user addresses (other users)`);
    totalDeleted += deletedAddresses.count;

    // 6. Delete user preferences for other users
    const deletedPreferences = await prisma.user_trading_preferences.deleteMany({
      where: {
        user_wallet: { notIn: normalizedWallets },
      },
    });
    console.log(`✅ Deleted ${deletedPreferences.count} user preferences (other users)`);
    totalDeleted += deletedPreferences.count;

    // 7. Delete agent link tables for deleted agents
    const deletedAgentAccounts = otherAgentIds.length > 0 ? await prisma.agent_accounts.deleteMany({
      where: {
        agent_id: { in: otherAgentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedAgentAccounts.count} agent-CT account links`);

    const deletedAgentTelegram = otherAgentIds.length > 0 ? await prisma.agent_telegram_users.deleteMany({
      where: {
        agent_id: { in: otherAgentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedAgentTelegram.count} agent-Telegram user links`);

    const deletedAgentResearch = otherAgentIds.length > 0 ? await prisma.agent_research_institutes.deleteMany({
      where: {
        agent_id: { in: otherAgentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedAgentResearch.count} agent-Research institute links`);

    // 8. Delete PNL snapshots for other deployments
    const deletedPnl = otherDeploymentIds.length > 0 ? await prisma.pnl_snapshots.deleteMany({
      where: {
        deployment_id: { in: otherDeploymentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedPnl.count} PNL snapshots (other users)`);

    // 9. Delete billing events for other deployments
    const deletedBilling = otherDeploymentIds.length > 0 ? await prisma.billing_events.deleteMany({
      where: {
        deployment_id: { in: otherDeploymentIds },
      },
    }) : { count: 0 };
    console.log(`✅ Deleted ${deletedBilling.count} billing events (other users)`);

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║              ✅ CLEANUP COMPLETE                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Deleted ${totalDeleted} records from other users\n`);
    console.log('📋 Your Data Preserved:');
    console.log(`  ✅ ${myDeployments.length} deployment(s)`);
    console.log(`  ✅ Your positions`);
    console.log(`  ✅ Your signals`);
    console.log(`  ✅ Your agent addresses`);
    console.log(`  ✅ Your trading preferences\n`);

    console.log('📋 Also Preserved:');
    console.log('  ✅ Telegram alpha users');
    console.log('  ✅ CT accounts');
    console.log('  ✅ Research institutes');
    console.log('  ✅ Token registry');
    console.log('  ✅ Venue status\n');

    return { success: true, deleted: totalDeleted };
  } catch (error: any) {
    console.error('\n❌ Error during cleanup:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const wallets: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--wallet' && args[i + 1]) {
    wallets.push(args[i + 1]);
    i++; // Skip next arg
  }
}

// Run cleanup
if (require.main === module) {
  clearAllExceptMyWallet(wallets, confirm)
    .then((result) => {
      if (result.success) {
        if (result.dryRun) {
          console.log('✅ Dry run complete. Add --confirm to delete data.\n');
        } else {
          console.log('✅ Cleanup complete!\n');
        }
        process.exit(0);
      } else {
        console.log('\n❌ Cleanup failed.\n');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { clearAllExceptMyWallet };

