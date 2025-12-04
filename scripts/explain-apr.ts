import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function explainAPRCalculation() {
  console.log('📊 APR CALCULATION BREAKDOWN\n');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const agent = await prisma.agents.findFirst({
    where: { name: 'Lisp' },
    select: { 
      id: true, 
      name: true,
      apr_30d: true,
      apr_90d: true,
      apr_si: true,
    }
  });
  
  if (!agent) {
    console.log('Agent not found');
    await prisma.$disconnect();
    return;
  }
  
  // Get deployments
  const deployments = await prisma.agent_deployments.findMany({
    where: { agent_id: agent.id },
    select: { id: true }
  });
  
  const deploymentIds = deployments.map(d => d.id);
  
  // Get all closed positions
  const positions = await prisma.positions.findMany({
    where: {
      deployment_id: { in: deploymentIds },
      closed_at: { not: null }
    },
    orderBy: { closed_at: 'desc' }
  });
  
  console.log('🔢 CURRENT METRICS:');
  console.log('   APR 30d: ' + (agent.apr_30d ? agent.apr_30d.toFixed(2) + '%' : 'N/A'));
  console.log('   APR 90d: ' + (agent.apr_90d ? agent.apr_90d.toFixed(2) + '%' : 'N/A'));
  console.log('   APR SI:  ' + (agent.apr_si ? agent.apr_si.toFixed(2) + '%' : 'N/A'));
  console.log('');
  
  // Calculate breakdown
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const positions30d = positions.filter(p => p.closed_at && p.closed_at >= thirtyDaysAgo);
  
  const totalPnl30d = positions30d.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
  const totalPnlSi = positions.reduce((sum, p) => sum + parseFloat(p.pnl?.toString() || '0'), 0);
  
  const firstPosition = positions[positions.length - 1];
  const daysSinceInception = firstPosition.closed_at 
    ? Math.max(1, (now.getTime() - firstPosition.closed_at.getTime()) / (24 * 60 * 60 * 1000))
    : 1;
  
  console.log('📈 HOW APR IS CALCULATED (OVERALL, NOT PER TRADE):\n');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('Formula: APR = (Total PnL / Initial Capital) × (365 / Days) × 100\n');
  console.log('Step-by-step for APR 30d:\n');
  console.log('  1. Sum ALL PnL from positions closed in last 30 days:');
  positions30d.forEach(p => {
    const pnl = parseFloat(p.pnl?.toString() || '0');
    const date = p.closed_at ? p.closed_at.toISOString().split('T')[0] : 'N/A';
    console.log('     ' + p.token_symbol.padEnd(6) + ' | ' + date + ' | $' + pnl.toFixed(2));
  });
  console.log('');
  console.log('  2. Total PnL (last 30 days): $' + totalPnl30d.toFixed(2));
  console.log('  3. Assumed Initial Capital: $1,000');
  console.log('  4. Return % over 30 days: ' + ((totalPnl30d / 1000) * 100).toFixed(2) + '%');
  console.log('  5. Annualized (× 365/30): ' + ((totalPnl30d / 1000) * (365 / 30) * 100).toFixed(2) + '%');
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('Step-by-step for APR SI (Since Inception):\n');
  console.log('  1. Total PnL (all time): $' + totalPnlSi.toFixed(2));
  console.log('  2. Days since first position: ' + daysSinceInception.toFixed(1) + ' days');
  console.log('  3. Return % over ' + daysSinceInception.toFixed(1) + ' days: ' + ((totalPnlSi / 1000) * 100).toFixed(2) + '%');
  console.log('  4. Annualized (× 365/' + daysSinceInception.toFixed(1) + '): ' + ((totalPnlSi / 1000) * (365 / daysSinceInception) * 100).toFixed(2) + '%');
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('💡 KEY POINTS:\n');
  console.log('✅ APR is calculated OVERALL (not per individual trade)');
  console.log('✅ It sums up ALL realized PnL from closed positions');
  console.log('✅ Assumes $1,000 starting capital (hardcoded in metrics-updater.ts)');
  console.log('✅ Annualizes the return (projects to yearly rate)');
  console.log('✅ Updates automatically after each position closes');
  console.log('');
  console.log('Example: If you made $4.52 in ' + daysSinceInception.toFixed(1) + ' day(s) with $1,000:');
  console.log('  Daily return: ' + ((totalPnlSi / 1000) * 100).toFixed(3) + '%');
  console.log('  Annualized: ' + ((totalPnlSi / 1000) * 100).toFixed(3) + '% × ' + (365 / daysSinceInception).toFixed(1) + ' = ' + agent.apr_si?.toFixed(2) + '% APR');
  console.log('');
  console.log('⚠️  Note: APR SI is very high (' + agent.apr_si?.toFixed(0) + '%) because it is based on');
  console.log('   only ' + daysSinceInception.toFixed(1) + ' day(s) of trading. This will normalize over time.');
  console.log('');
  console.log('   As you trade more over weeks/months, the APR will stabilize.');
  
  await prisma.$disconnect();
}

// Run
explainAPRCalculation()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

