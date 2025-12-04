/**
 * Clear Agent Data - Start Fresh
 * 
 * Safely clears agent-related data while preserving:
 * - Telegram alpha users
 * - CT accounts
 * - Research institutes
 * - Token registry
 * 
 * Run: npx tsx scripts/clear-agent-data.ts [--confirm]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearAgentData(confirm: boolean = false) {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║      🗑️  CLEAR AGENT DATA - START FRESH                  ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (!confirm) {
    console.log('⚠️  DRY RUN MODE - No data will be deleted\n');
    console.log('Add --confirm flag to actually delete data:\n');
    console.log('  npx tsx scripts/clear-agent-data.ts --confirm\n');
  } else {
    console.log('🚨 DELETION MODE - Data will be permanently deleted!\n');
  }

  try {
    // Count existing data
    console.log('📊 Current Data State:\n');

    const counts = {
      agents: await prisma.agents.count(),
      deployments: await prisma.agent_deployments.count(),
      signals: await prisma.signals.count(),
      positions: await prisma.positions.count(),
      userAddresses: await prisma.user_agent_addresses.count(),
      userPreferences: await prisma.user_trading_preferences.count(),
      telegramPosts: await prisma.telegram_posts.count(),
      agentAccounts: await prisma.agent_accounts.count(),
      agentTelegramUsers: await prisma.agent_telegram_users.count(),
      agentResearchInstitutes: await prisma.agent_research_institutes.count(),
      pnlSnapshots: await prisma.pnl_snapshots.count(),
      billingEvents: await prisma.billing_events.count(),
    };

    console.log(`Agents: ${counts.agents}`);
    console.log(`Agent Deployments: ${counts.deployments}`);
    console.log(`Signals: ${counts.signals}`);
    console.log(`Positions: ${counts.positions}`);
    console.log(`User Agent Addresses: ${counts.userAddresses}`);
    console.log(`User Trading Preferences: ${counts.userPreferences}`);
    console.log(`Telegram Posts: ${counts.telegramPosts}`);
    console.log(`Agent-CT Account Links: ${counts.agentAccounts}`);
    console.log(`Agent-Telegram User Links: ${counts.agentTelegramUsers}`);
    console.log(`Agent-Research Institute Links: ${counts.agentResearchInstitutes}`);
    console.log(`PNL Snapshots: ${counts.pnlSnapshots}`);
    console.log(`Billing Events: ${counts.billingEvents}`);

    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`\nTotal Records to Delete: ${totalRecords}\n`);

    if (totalRecords === 0) {
      console.log('✅ No data to delete - database is already clean!\n');
      return { success: true, deleted: 0 };
    }

    if (!confirm) {
      console.log('💡 Run with --confirm to delete this data\n');
      return { success: true, deleted: 0, dryRun: true };
    }

    // Confirm deletion
    console.log('🚨 DELETING DATA IN 3 SECONDS...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Delete in correct order (child records first)
    console.log('🗑️  Starting deletion...\n');

    // 1. Delete billing events
    if (counts.billingEvents > 0) {
      const deleted = await prisma.billing_events.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} billing events`);
    }

    // 2. Delete PNL snapshots
    if (counts.pnlSnapshots > 0) {
      const deleted = await prisma.pnl_snapshots.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} PNL snapshots`);
    }

    // 3. Delete positions
    if (counts.positions > 0) {
      const deleted = await prisma.positions.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} positions`);
    }

    // 4. Delete signals
    if (counts.signals > 0) {
      const deleted = await prisma.signals.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} signals`);
    }

    // 5. Delete telegram posts
    if (counts.telegramPosts > 0) {
      const deleted = await prisma.telegram_posts.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} telegram posts`);
    }

    // 6. Delete agent link tables
    if (counts.agentAccounts > 0) {
      const deleted = await prisma.agent_accounts.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} agent-CT account links`);
    }

    if (counts.agentTelegramUsers > 0) {
      const deleted = await prisma.agent_telegram_users.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} agent-Telegram user links`);
    }

    if (counts.agentResearchInstitutes > 0) {
      const deleted = await prisma.agent_research_institutes.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} agent-Research institute links`);
    }

    // 7. Delete deployments
    if (counts.deployments > 0) {
      const deleted = await prisma.agent_deployments.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} agent deployments`);
    }

    // 8. Delete agents
    if (counts.agents > 0) {
      const deleted = await prisma.agents.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} agents`);
    }

    // 9. Delete user agent addresses
    if (counts.userAddresses > 0) {
      const deleted = await prisma.user_agent_addresses.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} user agent addresses`);
    }

    // 10. Delete user trading preferences
    if (counts.userPreferences > 0) {
      const deleted = await prisma.user_trading_preferences.deleteMany({});
      console.log(`✅ Deleted ${deleted.count} user trading preferences`);
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║              ✅ CLEANUP COMPLETE                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('✅ All agent data cleared successfully!\n');
    console.log('📋 Preserved Data:');
    console.log('  ✅ Telegram alpha users');
    console.log('  ✅ CT accounts');
    console.log('  ✅ Research institutes');
    console.log('  ✅ Token registry');
    console.log('  ✅ Venue status\n');

    console.log('💡 Ready to start fresh:');
    console.log('  1. Create new agents via UI');
    console.log('  2. Link to Telegram users / CT accounts');
    console.log('  3. Deploy agents');
    console.log('  4. Test Telegram flow\n');

    return { success: true, deleted: totalRecords };
  } catch (error: any) {
    console.error('\n❌ Error during cleanup:', error.message);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const confirm = args.includes('--confirm');

// Run cleanup
if (require.main === module) {
  clearAgentData(confirm)
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

export { clearAgentData };

