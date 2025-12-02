import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSchema() {
  console.log('🔍 Checking database schema...\n');
  
  try {
    // Get a sample agent deployment to see the structure
    const deployment = await prisma.agent_deployments.findFirst({
      where: {
        hyperliquidAgentAddress: { not: null },
      },
    });
    
    if (deployment) {
      console.log('✅ Found existing deployment:');
      console.log(JSON.stringify(deployment, null, 2));
    } else {
      console.log('⚠️  No deployments with agent addresses found');
    }
    
    // Check agents
    const agents = await prisma.agents.findMany({
      take: 1,
    });
    
    if (agents.length > 0) {
      console.log('\n✅ Sample agent:');
      console.log(JSON.stringify(agents[0], null, 2));
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();

