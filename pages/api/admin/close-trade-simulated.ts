import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Admin endpoint to simulate closing a trade with specified PnL
 * 
 * Flow:
 * 1. Set closedAt, exitPrice, pnl on position
 * 2. Create billing events (INFRA_FEE, PROFIT_SHARE if pnl > 0)
 * 3. Upsert pnl_snapshots for the day
 * 4. Update impact_factor_history
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { positionId, pnl } = req.query;

    if (!positionId || typeof positionId !== 'string') {
      return res.status(400).json({ error: 'positionId query param required' });
    }

    const pnlValue = parseFloat(pnl as string || '0');

    console.log(`[ADMIN] Closing position ${positionId} with PnL ${pnlValue}`);

    // Get position
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: {
        deployment: { include: { agent: true } },
        signal: true,
      },
    });

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    if (position.closedAt) {
      return res.status(400).json({ error: 'Position already closed' });
    }

    const entryPrice = parseFloat(position.entryPrice.toString());
    const exitPrice = entryPrice + (pnlValue / parseFloat(position.qty.toString()));

    // Close position
    const updatedPosition = await prisma.position.update({
      where: { id: positionId },
      data: {
        closedAt: new Date(),
        exitPrice: exitPrice.toString(),
        pnl: pnlValue.toString(),
      },
    });

    // Create billing events
    const billingEvents = [];

    // 1. INFRA_FEE ($0.20)
    const infraFee = await prisma.billingEvent.create({
      data: {
        positionId: position.id,
        deploymentId: position.deploymentId,
        kind: 'INFRA_FEE',
        amount: '0.20',
        asset: 'USDC',
        status: 'CHARGED',
      },
    });
    billingEvents.push(infraFee);

    // 2. PROFIT_SHARE (10% if pnl > 0)
    if (pnlValue > 0) {
      const profitShare = await prisma.billingEvent.create({
        data: {
          positionId: position.id,
          deploymentId: position.deploymentId,
          kind: 'PROFIT_SHARE',
          amount: (pnlValue * 0.10).toFixed(8),
          asset: 'USDC',
          status: 'CHARGED',
        },
      });
      billingEvents.push(profitShare);
    }

    // 3. Upsert PnL snapshot for today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const pnlSnapshot = await prisma.pnlSnapshot.upsert({
      where: {
        deploymentId_day: {
          deploymentId: position.deploymentId,
          day: today,
        },
      },
      update: {
        pnl: {
          increment: pnlValue,
        },
      },
      create: {
        agentId: position.deployment.agentId,
        deploymentId: position.deploymentId,
        day: today,
        pnl: pnlValue.toString(),
        returnPct: null,
      },
    });

    // 4. Update impact_factor_history (link signal → CT accounts)
    // Get the CT account from the source tweet
    let impactHistory = null;
    if (position.signal.sourceTweets && position.signal.sourceTweets.length > 0) {
      const sourcePost = await prisma.ctPost.findUnique({
        where: { id: position.signal.sourceTweets[0] },
        select: { ctAccountId: true },
      });
      
      if (sourcePost) {
        impactHistory = await prisma.impactFactorHistory.create({
          data: {
            ctAccountId: sourcePost.ctAccountId,
            signalId: position.signalId,
            positionId: position.id,
            agentId: position.deployment.agentId,
            pnlContribution: pnlValue.toString(),
            weight: 1.0,
            modelVersion: 'v1',
          },
        });
      }
    }

    return res.status(200).json({
      message: 'Position closed successfully',
      position: updatedPosition,
      billingEvents,
      pnlSnapshot,
      impactHistory,
    });
  } catch (error: any) {
    console.error('[ADMIN] Close trade error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
