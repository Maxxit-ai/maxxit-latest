import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSignalsToTrades() {
  console.log('\n🔍 Checking Recent Signals → Trades\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Get recent signals (last 24 hours)
    console.log('📊 Recent Signals (Last 24 Hours):\n');
    const recentSignals = await prisma.signals.findMany({
      where: {
        created_at: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      include: {
        agents: {
          select: {
            name: true,
            venue: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 20,
    });

    if (recentSignals.length === 0) {
      console.log('   ⚠️  No signals found in last 24 hours\n');
    } else {
      console.log(`   Found ${recentSignals.length} signal(s):\n`);
      
      for (const signal of recentSignals) {
        // Check if signal has positions (executed)
      const hasPosition = await prisma.positions.count({
        where: { signal_id: signal.id },
      });
      const status = hasPosition > 0 ? 'EXECUTED' : 'PENDING';
      const statusIcon = status === 'EXECUTED' ? '✅' : '⏳';
        
        console.log(`   ${statusIcon} Signal ${signal.id.substring(0, 8)}...`);
        console.log(`      Agent: ${signal.agents?.name || 'Unknown'} (${signal.venue})`);
        console.log(`      Token: ${signal.token_symbol} ${signal.side}`);
        console.log(`      Size: ${signal.size_model?.value || 'N/A'}%`);
        console.log(`      Status: ${status}`);
        console.log(`      Created: ${signal.created_at.toISOString()}`);
        
        console.log('');
      }
    }

    // Check for positions opened from these signals
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💰 Positions Opened (Last 24 Hours):\n');
    
    const recentPositions = await prisma.positions.findMany({
      where: {
        opened_at: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
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
      console.log('   ⚠️  No positions opened in last 24 hours\n');
    } else {
      console.log(`   Found ${recentPositions.length} position(s):\n`);
      
      for (const position of recentPositions) {
        const signal = position.signals;
        const agent = position.agent_deployments?.agents?.name || 'Unknown';
        
        console.log(`   📈 Position ${position.id.substring(0, 8)}...`);
        console.log(`      Agent: ${agent}`);
        console.log(`      Token: ${signal?.token_symbol || 'N/A'} ${signal?.side || 'N/A'}`);
        console.log(`      Venue: ${position.venue}`);
        console.log(`      Size: ${position.size || 'N/A'}`);
        console.log(`      Entry Price: ${position.entry_price || 'N/A'}`);
        console.log(`      Status: ${position.status}`);
        console.log(`      Opened: ${position.opened_at.toISOString()}`);
        if (signal) {
          console.log(`      Signal: ${signal.id.substring(0, 8)}...`);
        }
        console.log('');
      }
    }

    // Statistics
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📈 Statistics (Last 24 Hours):\n');

    const totalSignals = recentSignals.length;
    // Check which signals have positions
    const signalsWithPositions = await Promise.all(
      recentSignals.map(async (s) => {
        const positionCount = await prisma.positions.count({
          where: { signal_id: s.id },
        });
        return { signal: s, hasPosition: positionCount > 0 };
      })
    );
    
    const executedSignals = signalsWithPositions.filter(s => s.hasPosition).length;
    const pendingSignals = signalsWithPositions.filter(s => !s.hasPosition).length;
    const failedSignals = 0; // No execution_status field
    const totalPositions = recentPositions.length;
    const openPositions = recentPositions.filter(p => p.status === 'OPEN').length;
    const closedPositions = recentPositions.filter(p => p.status === 'CLOSED').length;

    console.log(`   Signals:`);
    console.log(`      Total: ${totalSignals}`);
    console.log(`      ✅ Executed: ${executedSignals}`);
    console.log(`      ❌ Failed: ${failedSignals}`);
    console.log(`      ⏳ Pending: ${pendingSignals}`);
    console.log('');
    console.log(`   Positions:`);
    console.log(`      Total Opened: ${totalPositions}`);
    console.log(`      📈 Open: ${openPositions}`);
    console.log(`      ✅ Closed: ${closedPositions}`);
    console.log('');

    // Check signal-to-position mapping
    if (recentSignals.length > 0 && recentPositions.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🔗 Signal → Trade Mapping:\n');
      
      const signalIds = recentPositions.map(p => p.signal_id).filter(Boolean) as string[];
      const signalsWithPositions = await prisma.signals.findMany({
        where: {
          id: {
            in: signalIds,
          },
        },
        select: {
          id: true,
          token_symbol: true,
          side: true,
          created_at: true,
        },
      });

      for (const signal of signalsWithPositions) {
        const position = recentPositions.find(p => p.signal_id === signal.id);
        if (position) {
          console.log(`   ✅ Signal ${signal.id.substring(0, 8)}... → Position ${position.id.substring(0, 8)}...`);
          console.log(`      ${signal.token_symbol} ${signal.side} → ${position.status} position on ${position.venue}`);
          console.log('');
        }
      }
    }

    // Check for signals without positions (not executed)
    const signalsWithoutPositions = recentSignals.filter(s => {
      return !recentPositions.some(p => p.signal_id === s.id);
    });

    if (signalsWithoutPositions.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('⚠️  Signals NOT Executed (No Positions):\n');
      
      for (const signal of signalsWithoutPositions.slice(0, 10)) {
        console.log(`   ⏳ Signal ${signal.id.substring(0, 8)}...`);
        console.log(`      ${signal.token_symbol} ${signal.side} on ${signal.venue}`);
        const hasPosition = await prisma.positions.count({
          where: { signal_id: signal.id },
        });
        console.log(`      Status: ${hasPosition > 0 ? 'EXECUTED' : 'PENDING'}`);
        console.log('');
      }
      
      if (signalsWithoutPositions.length > 10) {
        console.log(`   ... and ${signalsWithoutPositions.length - 10} more\n`);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Check Complete\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkSignalsToTrades().catch(console.error);

