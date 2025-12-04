/**
 * Check how many users have deployed Crux and their configuration
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCruxDeployments() {
  try {
    // Find Crux agent
    const cruxAgent = await prisma.agents.findFirst({
      where: {
        name: 'Crux',
      },
    });

    if (!cruxAgent) {
      console.log('❌ Crux agent not found');
      return;
    }

    console.log(`\n🔍 Agent: ${cruxAgent.name} (${cruxAgent.id})`);
    console.log(`   Venue: ${cruxAgent.venue}\n`);

    // Get all active deployments for Crux
    const allDeployments = await prisma.agent_deployments.findMany({
      where: {
        agent_id: cruxAgent.id,
        status: 'ACTIVE',
        sub_active: true,
      },
      include: {
        positions: {
          where: {
            status: 'OPEN',
          },
          take: 1,
        },
      },
    });

    console.log(`📊 Total Active Deployments: ${allDeployments.length}\n`);

    if (allDeployments.length === 0) {
      console.log('⚠️  No active deployments found');
      return;
    }

    // Get user wallets
    const userWallets = allDeployments.map(d => d.user_wallet);

    // Get user agent addresses
    const userAgentAddresses = await prisma.user_agent_addresses.findMany({
      where: {
        user_wallet: { in: userWallets },
      },
    });

    // Create a map for quick lookup
    const agentAddressMap = new Map(
      userAgentAddresses.map(u => [u.user_wallet, u])
    );

    console.log('📋 Deployment Details:\n');
    console.log('─'.repeat(100));

    let ostiumReadyCount = 0;
    let hyperliquidReadyCount = 0;
    let moduleEnabledCount = 0;

    for (const deployment of allDeployments) {
      const agentAddress = agentAddressMap.get(deployment.user_wallet);
      
      const hasOstium = !!agentAddress?.ostium_agent_address;
      const hasHyperliquid = !!agentAddress?.hyperliquid_agent_address;
      const hasModule = deployment.module_enabled;
      const openPositions = deployment.positions.length;

      if (hasOstium) ostiumReadyCount++;
      if (hasHyperliquid) hyperliquidReadyCount++;
      if (hasModule) moduleEnabledCount++;

      console.log(`\n🔹 Deployment: ${deployment.id.substring(0, 8)}...`);
      console.log(`   User Wallet: ${deployment.user_wallet}`);
      console.log(`   Safe Wallet: ${deployment.safe_wallet}`);
      console.log(`   Status: ${deployment.status} | Sub Active: ${deployment.sub_active}`);
      console.log(`   Module Enabled: ${hasModule ? '✅' : '❌'}`);
      console.log(`   OSTIUM Agent: ${hasOstium ? '✅ ' + agentAddress!.ostium_agent_address : '❌ Not configured'}`);
      console.log(`   HYPERLIQUID Agent: ${hasHyperliquid ? '✅ ' + agentAddress!.hyperliquid_agent_address : '❌ Not configured'}`);
      console.log(`   Open Positions: ${openPositions}`);
    }

    console.log('\n' + '─'.repeat(100));
    console.log('\n📈 Summary:');
    console.log(`   Total Deployments: ${allDeployments.length}`);
    console.log(`   OSTIUM Ready: ${ostiumReadyCount} (${((ostiumReadyCount / allDeployments.length) * 100).toFixed(1)}%)`);
    console.log(`   HYPERLIQUID Ready: ${hyperliquidReadyCount} (${((hyperliquidReadyCount / allDeployments.length) * 100).toFixed(1)}%)`);
    console.log(`   Module Enabled: ${moduleEnabledCount} (${((moduleEnabledCount / allDeployments.length) * 100).toFixed(1)}%)`);

    // Check which deployments would be eligible for OSTIUM trades
    console.log('\n🎯 OSTIUM Trade Eligibility:');
    const ostiumEligible = allDeployments.filter(d => {
      const agentAddress = agentAddressMap.get(d.user_wallet);
      return !!agentAddress?.ostium_agent_address;
    });

    console.log(`   Eligible: ${ostiumEligible.length} deployments`);
    ostiumEligible.forEach(d => {
      console.log(`   ✅ ${d.user_wallet} (Deployment: ${d.id.substring(0, 8)}...)`);
    });

    if (ostiumEligible.length === 0) {
      console.log('\n⚠️  WARNING: No deployments are eligible for OSTIUM trades!');
      console.log('   Users need to configure their OSTIUM agent address.');
    } else if (ostiumEligible.length === 1) {
      console.log('\n⚠️  WARNING: Only 1 deployment is eligible for OSTIUM trades!');
      console.log('   This explains why only one user is getting trades.');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCruxDeployments();

