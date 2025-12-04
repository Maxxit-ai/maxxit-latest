import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnosePendingSignals() {
  console.log('\n🔍 Diagnosing Why Signals Are Not Being Executed\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Get pending signals (same query as trade executor)
    const pendingSignals = await prisma.signals.findMany({
      where: {
        positions: {
          none: {},
        },
        skipped_reason: null,
        agents: {
          status: 'PUBLIC',
          agent_deployments: {
            some: {
              status: 'ACTIVE',
            },
          },
        },
      },
      include: {
        agents: {
          include: {
            agent_deployments: {
              where: {
                status: 'ACTIVE',
              },
            },
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 20,
    });

    console.log(`📊 Found ${pendingSignals.length} pending signals (matching trade executor query)\n`);

    if (pendingSignals.length === 0) {
      console.log('⚠️  Trade executor query returns 0 signals, but we know there are pending ones.\n');
      console.log('   Checking why query might be filtering them out...\n');
      
      // Check signals without positions
      const allSignalsWithoutPositions = await prisma.signals.findMany({
        where: {
          positions: { none: {} },
        },
        include: {
          agents: {
            include: {
              agent_deployments: true,
            },
          },
        },
        take: 10,
      });

      console.log(`   Total signals without positions: ${allSignalsWithoutPositions.length}\n`);

      for (const signal of allSignalsWithoutPositions) {
        console.log(`   Signal: ${signal.token_symbol} ${signal.side} - ${signal.agents?.name || 'Unknown'}`);
        console.log(`      ID: ${signal.id.substring(0, 8)}...`);
        console.log(`      Agent Status: ${signal.agents?.status || 'N/A'}`);
        console.log(`      Skipped: ${signal.skipped_reason || 'No'}`);
        console.log(`      Deployments: ${signal.agents?.agent_deployments?.length || 0}`);
        
        if (signal.agents?.agent_deployments) {
          for (const dep of signal.agents.agent_deployments) {
            console.log(`         - ${dep.id.substring(0, 8)}... Status: ${dep.status}, Sub Active: ${dep.sub_active}`);
          }
        }
        console.log('');
      }
    } else {
      console.log('✅ Trade executor should be processing these signals:\n');

      for (const signal of pendingSignals) {
        const deployment = signal.agents?.agent_deployments?.[0];
        
        console.log(`   📊 ${signal.token_symbol} ${signal.side} - ${signal.agents?.name || 'Unknown'}`);
        console.log(`      Signal ID: ${signal.id.substring(0, 8)}...`);
        console.log(`      Venue: ${signal.venue}`);
        console.log(`      Created: ${signal.created_at.toISOString()}`);
        console.log(`      Agent Status: ${signal.agents?.status}`);
        console.log(`      Deployment: ${deployment ? deployment.id.substring(0, 8) + '...' : 'NONE'}`);
        
        if (deployment) {
          console.log(`         Status: ${deployment.status}`);
          console.log(`         Sub Active: ${deployment.sub_active}`);
          console.log(`         Enabled Venues: ${deployment.enabled_venues?.join(', ') || 'N/A'}`);
          
          // Check if user has agent addresses
          const userAddresses = await prisma.user_agent_addresses.findUnique({
            where: { user_wallet: deployment.user_wallet.toLowerCase() },
            select: {
              hyperliquid_agent_address: true,
              ostium_agent_address: true,
            },
          });
          
          console.log(`         User Addresses:`);
          console.log(`            Hyperliquid: ${userAddresses?.hyperliquid_agent_address ? '✅' : '❌'}`);
          console.log(`            Ostium: ${userAddresses?.ostium_agent_address ? '✅' : '❌'}`);
        }
        console.log('');
      }
    }

    // Check if trade executor worker is running
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Recommendations:\n');
    
    if (pendingSignals.length > 0) {
      console.log('   ✅ Signals are being found by trade executor query');
      console.log('   ⚠️  Check Railway logs for trade-executor-worker');
      console.log('   ⚠️  Look for execution errors or service crashes');
      console.log('   ⚠️  Verify trade executor service is running');
    } else {
      console.log('   ⚠️  Trade executor query is filtering out signals');
      console.log('   ⚠️  Check agent status (should be PUBLIC)');
      console.log('   ⚠️  Check deployment status (should be ACTIVE)');
      console.log('   ⚠️  Check if signals are marked as skipped');
    }

    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

diagnosePendingSignals().catch(console.error);









