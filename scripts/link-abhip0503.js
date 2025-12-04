/**
 * Quick fix: Link abhip0503 to all public agents
 * Usage: node scripts/link-abhip0503.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function linkAbhip0503() {
  try {
    console.log('\n🔍 Finding abhip0503 and public agents...\n');
    
    // Find abhip0503
    const alphaUser = await prisma.telegram_alpha_users.findFirst({
      where: { telegram_username: 'abhip0503' },
    });

    if (!alphaUser) {
      console.error('❌ abhip0503 not found in telegram_alpha_users');
      process.exit(1);
    }

    console.log(`✅ Found: @${alphaUser.telegram_username}`);
    console.log(`   Active: ${alphaUser.is_active}`);
    console.log(`   Impact Factor: ${alphaUser.impact_factor}\n`);

    // Find all public agents
    const agents = await prisma.agents.findMany({
      where: { status: 'PUBLIC' },
    });

    console.log(`📊 Found ${agents.length} public agent(s):\n`);
    agents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.venue})`);
    });
    console.log('');

    // Link to all public agents
    let linkedCount = 0;
    let skippedCount = 0;

    for (const agent of agents) {
      try {
        await prisma.agent_telegram_users.create({
          data: {
            agent_id: agent.id,
            telegram_alpha_user_id: alphaUser.id,
          },
        });
        console.log(`   ✅ Linked to: ${agent.name}`);
        linkedCount++;
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`   ⏭️  Already linked to: ${agent.name}`);
          skippedCount++;
        } else {
          console.error(`   ❌ Error linking ${agent.name}:`, error.message);
        }
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   New links created: ${linkedCount}`);
    console.log(`   Already existed: ${skippedCount}`);
    console.log(`   Total agents: ${agents.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (linkedCount > 0) {
      console.log('✅ SUCCESS! Your Telegram messages will now generate signals.\n');
      console.log('⏱️  Wait 5 minutes for next Signal Generator cycle');
      console.log('   Or restart signal-generator-worker to process immediately.\n');
    } else if (skippedCount === agents.length) {
      console.log('ℹ️  All agents were already linked. Configuration is correct!\n');
      console.log('🔍 If signals still not generating, check:');
      console.log('   1. Is signal-generator-worker running?');
      console.log('   2. Run: bash check-telegram-status.sh');
      console.log('   3. Send a new Telegram message to trigger processing\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

linkAbhip0503();

