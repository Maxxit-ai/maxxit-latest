/**
 * Backfill Script: Update missing PnL for closed Hyperliquid positions
 * 
 * Problem: Positions were marked as closed but exit_price and pnl were not recorded
 * Solution: Fetch historical fills from Hyperliquid and update positions with actual PnL
 */

import { PrismaClient } from '@prisma/client';
import { getHyperliquidUserFills } from '../lib/hyperliquid-utils';

const prisma = new PrismaClient();

interface Fill {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  closedPnl: string;
  fee: string;
  tid: string;
  oid: string;
}

async function backfillHyperliquidPnL() {
  console.log('🔧 BACKFILLING HYPERLIQUID PnL FOR CLOSED POSITIONS\n');

  // Get all Hyperliquid deployments
  const deployments = await prisma.agent_deployments.findMany({
    where: {
      hyperliquid_agent_address: { not: null },
    },
    include: {
      agents: {
        select: { name: true }
      }
    }
  });

  console.log(`Found ${deployments.length} Hyperliquid deployments\n`);

  let totalUpdated = 0;

  for (const deployment of deployments) {
    console.log(`═══════════════════════════════════════════════════════`);
    console.log(`📊 Deployment: ${deployment.agents.name}`);
    console.log(`   User Wallet: ${deployment.user_wallet}`);
    console.log(`═══════════════════════════════════════════════════════\n`);

    // Get positions with missing PnL (closed but exit_price is null or pnl is 0)
    const positionsNeedingUpdate = await prisma.positions.findMany({
      where: {
        deployment_id: deployment.id,
        closed_at: { not: null },
        OR: [
          { exit_price: null },
          { pnl: '0' },
        ]
      },
      orderBy: { closed_at: 'desc' }
    });

    if (positionsNeedingUpdate.length === 0) {
      console.log('✅ No positions need PnL backfill\n');
      continue;
    }

    console.log(`Found ${positionsNeedingUpdate.length} positions needing PnL update\n`);

    // Fetch historical fills from Hyperliquid
    try {
      console.log('Fetching historical fills from Hyperliquid...');
      const fills = await getHyperliquidUserFills(deployment.user_wallet);
      console.log(`Retrieved ${fills.length} historical fills\n`);

      if (fills.length === 0) {
        console.log('⚠️  No fills found from Hyperliquid\n');
        continue;
      }

      // Group fills by coin and find closing fills (those with closedPnl > 0)
      const closingFills = fills.filter(f => parseFloat(f.closedPnl) !== 0);
      console.log(`Found ${closingFills.length} fills with realized PnL\n`);

      // Match positions to fills
      for (const position of positionsNeedingUpdate) {
        const coin = position.token_symbol;
        const closedAt = position.closed_at;

        // Find fills for this coin around the closed time (within 5 minutes)
        const timeWindow = 5 * 60 * 1000; // 5 minutes in ms
        const matchingFills = closingFills.filter(fill => {
          const fillTime = new Date(fill.time);
          const timeDiff = Math.abs(fillTime.getTime() - closedAt!.getTime());
          return fill.coin === coin && timeDiff < timeWindow;
        });

        if (matchingFills.length === 0) {
          console.log(`⚠️  ${coin}: No matching fills found near close time ${closedAt?.toISOString()}`);
          continue;
        }

        // Use the fill with the largest closedPnl (most likely the closing fill)
        const closingFill = matchingFills.reduce((max, fill) => 
          Math.abs(parseFloat(fill.closedPnl)) > Math.abs(parseFloat(max.closedPnl)) ? fill : max
        );

        const pnl = parseFloat(closingFill.closedPnl);
        const exitPrice = parseFloat(closingFill.px);

        console.log(`✅ ${coin}: Found closing fill`);
        console.log(`   Exit Price: $${exitPrice.toFixed(4)}`);
        console.log(`   PnL: $${pnl.toFixed(2)}`);
        console.log(`   Fill Time: ${new Date(closingFill.time).toISOString()}`);

        // Update position in database
        await prisma.positions.update({
          where: { id: position.id },
          data: {
            exit_price: exitPrice.toString(),
            pnl: pnl.toString(),
            exit_reason: 'backfilled_from_hyperliquid',
          }
        });

        totalUpdated++;
        console.log(`   ✅ Position updated\n`);
      }

    } catch (error: any) {
      console.error(`❌ Error fetching fills: ${error.message}\n`);
    }
  }

  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`✅ BACKFILL COMPLETE`);
  console.log(`   Positions updated: ${totalUpdated}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  await prisma.$disconnect();
}

// Run if executed directly
if (require.main === module) {
  backfillHyperliquidPnL()
    .then(() => {
      console.log('✅ Backfill script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Backfill script failed:', error);
      process.exit(1);
    });
}

export { backfillHyperliquidPnL };

