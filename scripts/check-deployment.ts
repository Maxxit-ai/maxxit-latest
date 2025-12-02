#!/usr/bin/env tsx
/**
 * Check deployment configuration for ostium_agent_address
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDeployments() {
  console.log('🔍 Checking agent deployments...\n');

  const deployments = await prisma.agent_deployments.findMany({
    where: {
      status: 'ACTIVE',
    },
    include: {
      agents: true,
    },
  });

  console.log(`Found ${deployments.length} active deployment(s)\n`);

  for (const deployment of deployments) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Deployment ID: ${deployment.id}`);
    console.log(`Agent: ${deployment.agents?.name || 'N/A'}`);
    console.log(`Status: ${deployment.status}`);
    console.log(`Safe Wallet: ${deployment.safe_wallet || 'NOT SET ❌'}`);
    console.log(`Hyperliquid Agent: ${deployment.hyperliquid_agent_address || 'NOT SET ❌'}`);
    console.log(`Ostium Agent: ${deployment.ostium_agent_address || 'NOT SET ❌'}`);
    console.log(`Enabled Venues: ${deployment.enabled_venues || 'NOT SET ❌'}`);
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n⚠️  DIAGNOSIS:');
  
  const missingOstium = deployments.filter(d => !d.ostium_agent_address);
  if (missingOstium.length > 0) {
    console.log(`\n❌ ${missingOstium.length} deployment(s) missing ostium_agent_address:`);
    for (const d of missingOstium) {
      console.log(`   - ${d.agents?.name || 'Unknown'} (ID: ${d.id.substring(0, 8)}...)`);
    }
    console.log('\n💡 SOLUTION:');
    console.log('   You need to set ostium_agent_address for these deployments.');
    console.log('   Run: UPDATE agent_deployments SET ostium_agent_address = \'0xYourAgentAddress\' WHERE id = \'deployment_id\';');
    console.log('   OR use the /api/ostium/create-deployment endpoint to create a new deployment.');
  } else {
    console.log('✅ All active deployments have ostium_agent_address set!');
  }

  await prisma.$disconnect();
}

checkDeployments().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

