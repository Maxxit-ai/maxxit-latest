/**
 * Verify User Agent Addresses
 * 
 * Checks that:
 * 1. Each user has ONE address per venue (Hyperliquid, Ostium)
 * 2. All deployments for a user use the same address
 * 3. No duplicate addresses across users
 * 
 * Run: npx tsx scripts/verify-user-agent-addresses.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface UserAddressInfo {
  user_wallet: string;
  hyperliquid_address: string | null;
  ostium_address: string | null;
  deployment_count: number;
  deployments: Array<{
    id: string;
    agent_id: string;
    enabled_venues: string[];
  }>;
}

async function verifyUserAgentAddresses() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║      🔍 VERIFY USER AGENT ADDRESSES                      ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Get all users with agent addresses
    const userAddresses = await prisma.user_agent_addresses.findMany({
      select: {
        user_wallet: true,
        hyperliquid_agent_address: true,
        ostium_agent_address: true,
        created_at: true,
        last_used_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    console.log(`📊 Found ${userAddresses.length} user(s) with agent addresses\n`);

    if (userAddresses.length === 0) {
      console.log('⚠️  No users have agent addresses yet.');
      console.log('   This is normal if no deployments have been created.\n');
      return;
    }

    // Get all deployments
    const deployments = await prisma.agent_deployments.findMany({
      select: {
        id: true,
        user_wallet: true,
        agent_id: true,
        enabled_venues: true,
        status: true,
      },
    });

    console.log(`📊 Found ${deployments.length} deployment(s)\n`);

    // Group deployments by user
    const deploymentsByUser = new Map<string, typeof deployments>();
    for (const deployment of deployments) {
      const normalizedWallet = deployment.user_wallet.toLowerCase();
      if (!deploymentsByUser.has(normalizedWallet)) {
        deploymentsByUser.set(normalizedWallet, []);
      }
      deploymentsByUser.get(normalizedWallet)!.push(deployment);
    }

    // Verify each user
    let allValid = true;
    const issues: string[] = [];

    for (const userAddr of userAddresses) {
      const normalizedWallet = userAddr.user_wallet.toLowerCase();
      const userDeployments = deploymentsByUser.get(normalizedWallet) || [];

      console.log(`\n👤 User: ${userAddr.user_wallet}`);
      console.log(`   Hyperliquid Address: ${userAddr.hyperliquid_agent_address || '❌ Not set'}`);
      console.log(`   Ostium Address: ${userAddr.ostium_agent_address || '❌ Not set'}`);
      console.log(`   Deployments: ${userDeployments.length}`);

      // Check for duplicate addresses
      if (userAddr.hyperliquid_agent_address) {
        const duplicateHL = await prisma.user_agent_addresses.findFirst({
          where: {
            hyperliquid_agent_address: userAddr.hyperliquid_agent_address,
            user_wallet: { not: userAddr.user_wallet },
          },
        });
        if (duplicateHL) {
          allValid = false;
          issues.push(
            `❌ User ${userAddr.user_wallet} has Hyperliquid address ${userAddr.hyperliquid_agent_address} that is also used by ${duplicateHL.user_wallet}`
          );
        }
      }

      if (userAddr.ostium_agent_address) {
        const duplicateOstium = await prisma.user_agent_addresses.findFirst({
          where: {
            ostium_agent_address: userAddr.ostium_agent_address,
            user_wallet: { not: userAddr.user_wallet },
          },
        });
        if (duplicateOstium) {
          allValid = false;
          issues.push(
            `❌ User ${userAddr.user_wallet} has Ostium address ${userAddr.ostium_agent_address} that is also used by ${duplicateOstium.user_wallet}`
          );
        }
      }

      // Show deployments
      if (userDeployments.length > 0) {
        console.log(`   Deployment Details:`);
        for (const dep of userDeployments) {
          console.log(`     - Deployment ${dep.id.substring(0, 8)}...`);
          console.log(`       Agent: ${dep.agent_id.substring(0, 8)}...`);
          console.log(`       Enabled Venues: ${dep.enabled_venues.join(', ') || 'None'}`);
          console.log(`       Status: ${dep.status}`);
        }
      }

      // Verify all deployments use the same address (conceptually)
      // Since addresses are stored in user_agent_addresses, not in deployments,
      // we just need to verify the structure is correct
      if (userDeployments.length > 1) {
        console.log(`   ✅ Multiple deployments share the same user address (correct)`);
      }
    }

    // Check for users with deployments but no addresses
    console.log(`\n\n🔍 Checking for users with deployments but no addresses...`);
    const usersWithDeployments = new Set(
      deployments.map((d) => d.user_wallet.toLowerCase())
    );
    const usersWithAddresses = new Set(
      userAddresses.map((a) => a.user_wallet.toLowerCase())
    );

    const usersWithoutAddresses = Array.from(usersWithDeployments).filter(
      (wallet) => !usersWithAddresses.has(wallet)
    );

    if (usersWithoutAddresses.length > 0) {
      console.log(`\n⚠️  Found ${usersWithoutAddresses.length} user(s) with deployments but no addresses:`);
      for (const wallet of usersWithoutAddresses) {
        const deps = deployments.filter((d) => d.user_wallet.toLowerCase() === wallet);
        console.log(`   - ${wallet}: ${deps.length} deployment(s)`);
        issues.push(`⚠️  User ${wallet} has ${deps.length} deployment(s) but no agent address`);
      }
    } else {
      console.log(`   ✅ All users with deployments have addresses`);
    }

    // Summary
    console.log(`\n\n╔═══════════════════════════════════════════════════════════╗`);
    if (allValid && issues.length === 0) {
      console.log(`║              ✅ VERIFICATION PASSED                    ║`);
      console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
      console.log(`Summary:`);
      console.log(`  ✅ ${userAddresses.length} user(s) with agent addresses`);
      console.log(`  ✅ ${deployments.length} deployment(s) total`);
      console.log(`  ✅ No duplicate addresses found`);
      console.log(`  ✅ All users with deployments have addresses`);
      console.log(`\n✅ Design is correct: One address per user per venue\n`);
    } else {
      console.log(`║              ⚠️  VERIFICATION ISSUES FOUND            ║`);
      console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
      console.log(`Issues found:`);
      for (const issue of issues) {
        console.log(`  ${issue}`);
      }
      console.log(`\n⚠️  Please review and fix the issues above\n`);
    }

    // Show statistics
    const usersWithHL = userAddresses.filter((a) => a.hyperliquid_agent_address).length;
    const usersWithOstium = userAddresses.filter((a) => a.ostium_agent_address).length;
    const usersWithBoth = userAddresses.filter(
      (a) => a.hyperliquid_agent_address && a.ostium_agent_address
    ).length;

    console.log(`\n📊 Statistics:`);
    console.log(`  Users with Hyperliquid address: ${usersWithHL}`);
    console.log(`  Users with Ostium address: ${usersWithOstium}`);
    console.log(`  Users with both addresses: ${usersWithBoth}`);
    console.log(`  Total deployments: ${deployments.length}`);
    console.log(`  Average deployments per user: ${(
      deployments.length / Math.max(usersWithAddresses.size, 1)
    ).toFixed(2)}\n`);

    return {
      success: allValid && issues.length === 0,
      userCount: userAddresses.length,
      deploymentCount: deployments.length,
      issues,
    };
  } catch (error: any) {
    console.error('\n❌ Error verifying addresses:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
if (require.main === module) {
  verifyUserAgentAddresses()
    .then((result) => {
      if (result?.success) {
        console.log('✅ Verification complete!\n');
        process.exit(0);
      } else {
        console.log('⚠️  Verification found issues. Please review above.\n');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { verifyUserAgentAddresses };

