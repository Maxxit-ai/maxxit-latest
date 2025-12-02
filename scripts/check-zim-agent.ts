import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkZimAgent() {
  console.log('🔍 Checking Zim Agent Deployment\n');

  // Find agent named "Zim"
  const agents = await prisma.agents.findMany({
    where: {
      name: {
        contains: 'Zim',
        mode: 'insensitive'
      }
    }
  });

  if (agents.length === 0) {
    console.log('❌ No agent named "Zim" found');
    console.log('\nSearching for recently created agents...\n');
    
    const recentAgents = await prisma.agents.findMany({
      orderBy: {
        id: 'desc'
      },
      take: 5
    });
    
    console.log('Recent agents:');
    recentAgents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.venue}) - ID: ${agent.id}`);
    });
    return;
  }

  console.log('✅ Found Zim Agent:');
  const zimAgent = agents[0];
  console.log(`   ID: ${zimAgent.id}`);
  console.log(`   Name: ${zimAgent.name}`);
  console.log(`   Venue: ${zimAgent.venue}`);
  console.log(`   Status: ${zimAgent.status}`);
  console.log(`   Creator: ${zimAgent.creator_wallet}\n`);

  // Find deployment
  const deployments = await prisma.agent_deployments.findMany({
    where: {
      agent_id: zimAgent.id
    },
    orderBy: {
      sub_started_at: 'desc'
    }
  });

  if (deployments.length === 0) {
    console.log('❌ No deployment found for Zim agent');
    console.log('   The agent exists but has not been deployed yet.\n');
    return;
  }

  console.log('✅ Found Deployment:');
  const deployment = deployments[0];
  console.log(`   Deployment ID: ${deployment.id}`);
  console.log(`   User Wallet: ${deployment.user_wallet}`);
  console.log(`   Safe Wallet: ${deployment.safe_wallet}`);
  console.log(`   Agent Address: ${deployment.hyperliquid_agent_address}`);
  console.log(`   Status: ${deployment.status}`);
  console.log(`   Module Enabled: ${deployment.module_enabled}\n`);

  // Check if positions exist
  const positions = await prisma.positions.findMany({
    where: {
      deployment_id: deployment.id
    }
  });

  console.log(`📊 Positions: ${positions.length} found`);
  if (positions.length > 0) {
    positions.forEach(pos => {
      console.log(`   - ${pos.token_symbol} ${pos.side} (${pos.status})`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 VERIFICATION DATA FOR ON-CHAIN CHECK:');
  console.log('='.repeat(60));
  console.log(`User Wallet: ${deployment.user_wallet || deployment.safe_wallet}`);
  console.log(`Agent Address: ${deployment.hyperliquid_agent_address}`);
  console.log('\nUse these addresses for on-chain verification ↓\n');
  
  await prisma.$disconnect();
}

checkZimAgent().catch(console.error);

