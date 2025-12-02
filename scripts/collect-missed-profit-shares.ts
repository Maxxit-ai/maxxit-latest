/**
 * Retroactively collect profit shares from past profitable trades
 * Run this after setting HYPERLIQUID_PLATFORM_WALLET
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function collectMissedProfitShares() {
  console.log('🔧 COLLECTING MISSED PROFIT SHARES\n');
  console.log('═══════════════════════════════════════════════════\n');

  // Check if platform wallet is configured
  const platformWallet = process.env.HYPERLIQUID_PLATFORM_WALLET || process.env.PLATFORM_FEE_RECEIVER;
  
  if (!platformWallet) {
    console.error('❌ ERROR: HYPERLIQUID_PLATFORM_WALLET not set!');
    console.log('\nPlease set it first:');
    console.log('export HYPERLIQUID_PLATFORM_WALLET=0xYourWalletAddress\n');
    process.exit(1);
  }

  console.log(`✅ Platform wallet: ${platformWallet.slice(0, 10)}...${platformWallet.slice(-8)}\n`);

  // Find closed positions with profit that don't have billing events
  const profitablePositions = await prisma.positions.findMany({
    where: {
      closed_at: { not: null },
      pnl: { gt: 0 },
      venue: 'HYPERLIQUID',
    },
    include: {
      agent_deployments: {
        select: {
          id: true,
          user_wallet: true,
          hyperliquid_agent_address: true,
          agents: { select: { name: true } },
        },
      },
      billing_events: {
        where: { kind: 'PROFIT_SHARE' },
      },
    },
    orderBy: { closed_at: 'desc' },
  });

  console.log(`📊 Found ${profitablePositions.length} profitable positions\n`);

  let totalToCollect = 0;
  let collected = 0;
  let failed = 0;
  let skipped = 0;

  for (const position of profitablePositions) {
    const pnl = parseFloat(position.pnl?.toString() || '0');
    const profitShare = pnl * 0.10; // 10%

    // Skip if already collected
    if (position.billing_events.length > 0) {
      console.log(`⏭️  ${position.agent_deployments.agents.name} - ${position.token_symbol}`);
      console.log(`   Already collected: $${profitShare.toFixed(2)}`);
      console.log('');
      skipped++;
      continue;
    }

    // Skip if amount too small
    if (profitShare < 0.01) {
      console.log(`⏭️  ${position.agent_deployments.agents.name} - ${position.token_symbol}`);
      console.log(`   Too small: $${profitShare.toFixed(4)}`);
      console.log('');
      skipped++;
      continue;
    }

    totalToCollect += profitShare;

    console.log(`💰 ${position.agent_deployments.agents.name} - ${position.token_symbol}`);
    console.log(`   PnL: $${pnl.toFixed(2)}`);
    console.log(`   Profit Share (10%): $${profitShare.toFixed(2)}`);
    console.log(`   User: ${position.agent_deployments.user_wallet.slice(0, 10)}...`);

    try {
      // Get agent private key from wallet pool
      const { getPrivateKeyForAddress } = await import('../lib/wallet-pool');
      const agentAddress = position.agent_deployments.hyperliquid_agent_address;
      
      if (!agentAddress) {
        console.log(`   ❌ No agent address\n`);
        failed++;
        continue;
      }

      const agentPrivateKey = await getPrivateKeyForAddress(agentAddress);
      
      if (!agentPrivateKey) {
        console.log(`   ❌ Agent key not found\n`);
        failed++;
        continue;
      }

      // Transfer USDC from user to platform
      const HYPERLIQUID_SERVICE_URL = process.env.HYPERLIQUID_SERVICE_URL || 'http://localhost:5001';
      
      console.log(`   🔄 Transferring...`);
      
      const response = await fetch(`${HYPERLIQUID_SERVICE_URL}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentPrivateKey,
          toAddress: platformWallet,
          amount: profitShare,
          vaultAddress: position.agent_deployments.user_wallet,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.log(`   ❌ Transfer failed: ${error.error}\n`);
        failed++;
        continue;
      }

      const result = await response.json();
      console.log(`   ✅ Collected! TX: ${result.result?.status || 'success'}`);

      // Record in billing events
      await prisma.billing_events.create({
        data: {
          deployment_id: position.deployment_id,
          kind: 'PROFIT_SHARE',
          amount: profitShare.toString(),
          asset: 'USDC',
          status: 'COMPLETED',
          occurred_at: new Date(),
        },
      });

      console.log(`   📝 Recorded in billing_events\n`);
      collected++;

    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}\n`);
      failed++;
    }
  }

  console.log('═══════════════════════════════════════════════════\n');
  console.log('📊 SUMMARY:\n');
  console.log(`Total Positions: ${profitablePositions.length}`);
  console.log(`✅ Collected: ${collected}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`💰 Total Amount: $${totalToCollect.toFixed(2)}\n`);

  await prisma.$disconnect();
}

collectMissedProfitShares().catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});

