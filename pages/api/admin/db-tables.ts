import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get counts for all tables
    const [
      agentCount,
      ctAccountCount,
      ctPostCount,
      signalCount,
      positionCount,
      deploymentCount,
      agentAccountCount
    ] = await Promise.all([
      prisma.agent.count(),
      prisma.ctAccount.count(),
      prisma.ctPost.count(),
      prisma.signal.count(),
      prisma.position.count(),
      prisma.agentDeployment.count(),
      prisma.agentAccount.count()
    ]);

    const tables = [
      { name: 'Agent', count: agentCount },
      { name: 'CTAccount', count: ctAccountCount },
      { name: 'CTPost', count: ctPostCount },
      { name: 'Signal', count: signalCount },
      { name: 'Position', count: positionCount },
      { name: 'AgentDeployment', count: deploymentCount },
      { name: 'AgentAccount', count: agentAccountCount }
    ];

    res.status(200).json({ tables });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
}

