import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecentSignalExecution() {
  console.log('\n🔍 Checking Recent Signal Execution Status\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Get signals from last 48 hours
    const recentSignals = await prisma.signals.findMany({
      where: {
        created_at: {
          gte: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      },
      include: {
        agents: {
          select: {
            name: true,
            venue: true,
          },
        },
        positions: {
          select: {
            id: true,
            status: true,
            opened_at: true,
            venue: true,
          },
        },
        agent_routing_history: {
          select: {
            selected_venue: true,
            routing_reason: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 50,
    });

    console.log(`📊 Found ${recentSignals.length} signals in last 48 hours\n`);

    if (recentSignals.length === 0) {
      console.log('   ⚠️  No recent signals found\n');
      await prisma.$disconnect();
      return;
    }

    // Categorize signals
    const executed = recentSignals.filter(s => s.positions.length > 0);
    const pending = recentSignals.filter(s => s.positions.length === 0);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ EXECUTED Signals (Have Positions):\n');
    
    if (executed.length === 0) {
      console.log('   ⚠️  No signals have been executed as trades\n');
    } else {
      for (const signal of executed) {
        const position = signal.positions[0];
        console.log(`   ✅ ${signal.token_symbol} ${signal.side} - ${signal.agents?.name || 'Unknown'}`);
        console.log(`      Signal: ${signal.id.substring(0, 8)}...`);
        console.log(`      Position: ${position.id.substring(0, 8)}... (${position.status})`);
        console.log(`      Venue: ${signal.venue}`);
        console.log(`      Created: ${signal.created_at.toISOString()}`);
        console.log(`      Opened: ${position.opened_at?.toISOString() || 'N/A'}`);
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⏳ PENDING Signals (No Positions Yet):\n');
    
    if (pending.length === 0) {
      console.log('   ✅ All signals have been executed!\n');
    } else {
      console.log(`   Found ${pending.length} pending signal(s):\n`);
      
      for (const signal of pending.slice(0, 20)) {
        const ageMinutes = Math.floor((Date.now() - signal.created_at.getTime()) / 1000 / 60);
        const ageHours = Math.floor(ageMinutes / 60);
        const ageDisplay = ageHours > 0 ? `${ageHours}h ${ageMinutes % 60}m` : `${ageMinutes}m`;
        
        console.log(`   ⏳ ${signal.token_symbol} ${signal.side} - ${signal.agents?.name || 'Unknown'}`);
        console.log(`      Signal ID: ${signal.id.substring(0, 8)}...`);
        console.log(`      Venue: ${signal.venue}`);
        console.log(`      Age: ${ageDisplay} ago`);
        console.log(`      Created: ${signal.created_at.toISOString()}`);
        
        // Check if there are active deployments for this agent
        const deployments = await prisma.agent_deployments.count({
          where: {
            agent_id: signal.agent_id,
            status: 'ACTIVE',
            sub_active: true,
          },
        });
        
        if (deployments === 0) {
          console.log(`      ⚠️  No active deployments for this agent`);
        } else {
          console.log(`      ✅ ${deployments} active deployment(s) - should be processed`);
        }
        console.log('');
      }
      
      if (pending.length > 20) {
        console.log(`   ... and ${pending.length - 20} more pending signals\n`);
      }
    }

    // Check trade executor activity
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📈 Execution Statistics:\n');
    
    const totalSignals = recentSignals.length;
    const executionRate = totalSignals > 0 ? (executed.length / totalSignals * 100).toFixed(1) : 0;
    
    console.log(`   Total Signals: ${totalSignals}`);
    console.log(`   ✅ Executed: ${executed.length} (${executionRate}%)`);
    console.log(`   ⏳ Pending: ${pending.length} (${(100 - parseFloat(executionRate)).toFixed(1)}%)`);
    console.log('');

    // Check for signals that are very old but still pending
    const oldPending = pending.filter(s => {
      const ageHours = (Date.now() - s.created_at.getTime()) / 1000 / 60 / 60;
      return ageHours > 2; // Older than 2 hours
    });

    if (oldPending.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('⚠️  OLD PENDING Signals (>2 hours):\n');
      console.log(`   Found ${oldPending.length} signal(s) that should have been executed:\n`);
      
      for (const signal of oldPending.slice(0, 10)) {
        const ageHours = Math.floor((Date.now() - signal.created_at.getTime()) / 1000 / 60 / 60);
        console.log(`   ⚠️  ${signal.token_symbol} ${signal.side} - ${signal.agents?.name || 'Unknown'}`);
        console.log(`      Age: ${ageHours} hours`);
        console.log(`      Venue: ${signal.venue}`);
        console.log(`      Signal ID: ${signal.id.substring(0, 8)}...`);
        console.log('');
      }
      
      console.log('   💡 These signals may indicate trade executor issues\n');
    }

    // Check recent positions
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💰 Recent Positions (Last 48 Hours):\n');
    
    const recentPositions = await prisma.positions.findMany({
      where: {
        opened_at: {
          gte: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      },
      include: {
        signals: {
          select: {
            id: true,
            token_symbol: true,
            side: true,
            created_at: true,
          },
        },
        agent_deployments: {
          include: {
            agents: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        opened_at: 'desc',
      },
      take: 20,
    });

    if (recentPositions.length === 0) {
      console.log('   ⚠️  No positions opened in last 48 hours\n');
    } else {
      console.log(`   Found ${recentPositions.length} position(s):\n`);
      
      for (const position of recentPositions) {
        const signal = position.signals;
        const agent = position.agent_deployments?.agents?.name || 'Unknown';
        const timeDiff = signal 
          ? Math.floor((position.opened_at.getTime() - signal.created_at.getTime()) / 1000 / 60)
          : null;
        
        console.log(`   📈 ${signal?.token_symbol || 'N/A'} ${signal?.side || 'N/A'} - ${agent}`);
        console.log(`      Position: ${position.id.substring(0, 8)}... (${position.status})`);
        console.log(`      Venue: ${position.venue}`);
        if (signal && timeDiff !== null) {
          console.log(`      Signal → Trade: ${timeDiff} minutes`);
        }
        console.log(`      Opened: ${position.opened_at.toISOString()}`);
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Analysis Complete\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentSignalExecution().catch(console.error);









