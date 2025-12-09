import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Get all deployments
    const deployments = await prisma.agentDeployment.findMany({
      include: {
        agent: true,
      },
      orderBy: {
        subStartedAt: 'desc',
      },
    });

    // Get positions to see which Safe was actually used for trades
    const positions = await prisma.position.findMany({
      where: {
        deploymentId: '35c4f2d1-318c-420a-b3b0-abbd8bf847ff',
      },
      orderBy: {
        opened_at: 'desc',
      },
      take: 5,
    });

    return res.status(200).json({
      deployments: deployments.map(d => ({
        id: d.id,
        agent: d.agent.name,
        userWallet: d.userWallet,
        safeWallet: d.safeWallet,
        moduleAddress: d.moduleAddress,
        moduleEnabled: d.moduleEnabled,
        status: d.status,
        createdAt: d.subStartedAt,
      })),
      recentPositions: positions.map(p => ({
        id: p.id,
        deploymentId: p.deploymentId,
        tokenSymbol: p.tokenSymbol,
        side: p.side,
        openedAt: p.openedAt,
        entryTxHash: p.entryTxHash,
      })),
      correctSafe: '0x9A85f7140776477F1A79Ea29b7A32495636f5e20',
      wrongSafe: '0xE9ECBddB6308036f5470826A1fdfc734cFE866b1',
    });
  } catch (error: any) {
    console.error('[API] Check deployments error:', error);
    return res.status(500).json({ error: error.message });
  }
  // Note: Don't disconnect - using singleton
}

