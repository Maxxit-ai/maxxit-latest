/**
 * List Users and Their Agents
 * 
 * Shows:
 * - Total number of users
 * - Each user's wallet address
 * - Number of agent deployments per user
 * - Details of each deployment (agent name, venue, status)
 * 
 * Run: npx tsx scripts/list-users-and-agents.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface UserInfo {
  user_wallet: string;
  deployment_count: number;
  deployments: Array<{
    id: string;
    agent_id: string;
    agent_name: string;
    agent_venue: string;
    status: string;
    enabled_venues: string[];
    created_at: Date;
  }>;
  has_addresses: boolean;
  hyperliquid_address: string | null;
  ostium_address: string | null;
}

async function listUsersAndAgents() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║      📊 USERS AND AGENTS REPORT                          ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Get all deployments with agent details
    const deployments = await prisma.agent_deployments.findMany({
      select: {
        id: true,
        user_wallet: true,
        agent_id: true,
        status: true,
        enabled_venues: true,
        sub_started_at: true,
        agents: {
          select: {
            id: true,
            name: true,
            venue: true,
            creator_wallet: true,
          },
        },
      },
      orderBy: {
        sub_started_at: 'desc',
      },
    });

    // Get all users with addresses
    const userAddresses = await prisma.user_agent_addresses.findMany({
      select: {
        user_wallet: true,
        hyperliquid_agent_address: true,
        ostium_agent_address: true,
      },
    });

    const addressMap = new Map(
      userAddresses.map((addr) => [
        addr.user_wallet.toLowerCase(),
        {
          hyperliquid: addr.hyperliquid_agent_address,
          ostium: addr.ostium_agent_address,
        },
      ])
    );

    // Group deployments by user
    const usersMap = new Map<string, UserInfo>();

    for (const deployment of deployments) {
      const normalizedWallet = deployment.user_wallet.toLowerCase();
      
      if (!usersMap.has(normalizedWallet)) {
        const addresses = addressMap.get(normalizedWallet);
        usersMap.set(normalizedWallet, {
          user_wallet: deployment.user_wallet,
          deployment_count: 0,
          deployments: [],
          has_addresses: !!addresses,
          hyperliquid_address: addresses?.hyperliquid || null,
          ostium_address: addresses?.ostium || null,
        });
      }

      const userInfo = usersMap.get(normalizedWallet)!;
      userInfo.deployment_count++;
      userInfo.deployments.push({
        id: deployment.id,
        agent_id: deployment.agent_id,
        agent_name: deployment.agents.name,
        agent_venue: deployment.agents.venue,
        status: deployment.status,
        enabled_venues: deployment.enabled_venues,
        created_at: deployment.sub_started_at,
      });
    }

    const users = Array.from(usersMap.values());

    // Summary
    console.log('📊 SUMMARY\n');
    console.log(`Total Users: ${users.length}`);
    console.log(`Total Deployments: ${deployments.length}`);
    console.log(`Users with Agent Addresses: ${userAddresses.length}`);
    console.log(`Average Deployments per User: ${(
      deployments.length / Math.max(users.length, 1)
    ).toFixed(2)}\n`);

    // Detailed breakdown
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              👤 USER DETAILS                             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    if (users.length === 0) {
      console.log('⚠️  No users found in the database.\n');
      return;
    }

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`${i + 1}. User: ${user.user_wallet}`);
      console.log(`   Deployments: ${user.deployment_count}`);
      
      if (user.has_addresses) {
        console.log(`   ✅ Has Agent Addresses:`);
        if (user.hyperliquid_address) {
          console.log(`      Hyperliquid: ${user.hyperliquid_address}`);
        }
        if (user.ostium_address) {
          console.log(`      Ostium: ${user.ostium_address}`);
        }
      } else {
        console.log(`   ⚠️  No agent addresses configured`);
      }

      console.log(`\n   Agent Deployments:`);
      for (const dep of user.deployments) {
        console.log(`      📦 ${dep.agent_name}`);
        console.log(`         Deployment ID: ${dep.id.substring(0, 8)}...`);
        console.log(`         Agent ID: ${dep.agent_id.substring(0, 8)}...`);
        console.log(`         Agent Venue: ${dep.agent_venue}`);
        console.log(`         Enabled Venues: ${dep.enabled_venues.join(', ') || 'None'}`);
        console.log(`         Status: ${dep.status}`);
        console.log(`         Created: ${dep.created_at.toISOString().split('T')[0]}`);
        console.log(``);
      }
      console.log(``);
    }

    // Statistics by venue
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              📈 STATISTICS BY VENUE                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const venueStats = new Map<string, number>();
    const enabledVenueStats = new Map<string, number>();

    for (const deployment of deployments) {
      // Agent venue
      const agentVenue = deployment.agents.venue;
      venueStats.set(agentVenue, (venueStats.get(agentVenue) || 0) + 1);

      // Enabled venues
      for (const venue of deployment.enabled_venues) {
        enabledVenueStats.set(venue, (enabledVenueStats.get(venue) || 0) + 1);
      }
    }

    console.log('Agent Venues (by agent type):');
    for (const [venue, count] of Array.from(venueStats.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${venue}: ${count} deployment(s)`);
    }

    console.log('\nEnabled Venues (by deployment):');
    for (const [venue, count] of Array.from(enabledVenueStats.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${venue}: ${count} deployment(s)`);
    }

    // Status breakdown
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║              📊 STATUS BREAKDOWN                         ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const statusStats = new Map<string, number>();
    for (const deployment of deployments) {
      statusStats.set(deployment.status, (statusStats.get(deployment.status) || 0) + 1);
    }

    for (const [status, count] of Array.from(statusStats.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${status}: ${count} deployment(s)`);
    }

    console.log('\n');

    return {
      totalUsers: users.length,
      totalDeployments: deployments.length,
      usersWithAddresses: userAddresses.length,
      users,
    };
  } catch (error: any) {
    console.error('\n❌ Error listing users and agents:', error.message);
    console.error(error.stack);
    return { error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Run report
if (require.main === module) {
  listUsersAndAgents()
    .then((result) => {
      if (result?.error) {
        console.log('\n❌ Report failed. See errors above.\n');
        process.exit(1);
      } else {
        console.log('✅ Report complete!\n');
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { listUsersAndAgents };

