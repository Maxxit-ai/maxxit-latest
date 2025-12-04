/**
 * Verify all agents are accessible and show their venues
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyAgents() {
  console.log('🔍 Verifying agents in database...\n');

  try {
    // Get all agents
    const allAgents = await prisma.agents.findMany({
      select: {
        id: true,
        name: true,
        venue: true,
        status: true,
        creator_wallet: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    console.log(`📊 Total agents: ${allAgents.length}\n`);

    if (allAgents.length === 0) {
      console.log('⚠️  No agents found in database');
      return;
    }

    // Group by venue
    const byVenue = allAgents.reduce((acc, agent) => {
      if (!acc[agent.venue]) {
        acc[agent.venue] = [];
      }
      acc[agent.venue].push(agent);
      return {};
    }, {});

    // Display by venue
    console.log('📍 Agents by venue:\n');
    ['SPOT', 'GMX', 'HYPERLIQUID', 'OSTIUM'].forEach(venue => {
      const agents = allAgents.filter(a => a.venue === venue);
      console.log(`  ${venue}: ${agents.length} agent(s)`);
      agents.forEach(agent => {
        console.log(`    - ${agent.name} [${agent.status}]`);
      });
    });

    console.log('\n📋 All agents:');
    console.table(allAgents.map(a => ({
      name: a.name,
      venue: a.venue,
      status: a.status,
      creator: a.creator_wallet.slice(0, 10) + '...',
    })));

    // Check for active agents
    const activeAgents = allAgents.filter(a => a.status === 'ACTIVE');
    console.log(`\n✅ Active agents: ${activeAgents.length}`);
    
    if (activeAgents.length === 0) {
      console.log('⚠️  No active agents found. Make sure you have some ACTIVE agents to display on the homepage.');
    }

    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyAgents()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

