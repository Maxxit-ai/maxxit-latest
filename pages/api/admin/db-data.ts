import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { table } = req.query;

  if (!table || typeof table !== 'string') {
    return res.status(400).json({ error: 'Table name required' });
  }

  try {
    let data: any[] = [];

    switch (table) {
      case 'Agent':
        data = await prisma.agent.findMany({
          take: 100,
          orderBy: { createdAt: 'desc' }
        });
        break;

      case 'CTAccount':
        data = await prisma.ctAccount.findMany({
          take: 100,
          orderBy: { createdAt: 'desc' }
        });
        break;

      case 'CTPost':
        data = await prisma.ctPost.findMany({
          take: 100,
          orderBy: { tweetCreatedAt: 'desc' },
          include: {
            ctAccount: {
              select: {
                username: true
              }
            }
          }
        });
        break;

      case 'Signal':
        data = await prisma.signal.findMany({
          take: 100,
          orderBy: { createdAt: 'desc' },
          include: {
            agent: {
              select: {
                name: true
              }
            }
          }
        });
        break;

      case 'Position':
        data = await prisma.position.findMany({
          take: 100,
          orderBy: { opened_at: 'desc' },
          include: {
            signal: {
              select: {
                side: true,
                tokenSymbol: true
              }
            }
          }
        });
        break;

      case 'AgentDeployment':
        data = await prisma.agentDeployment.findMany({
          take: 100,
          orderBy: { createdAt: 'desc' },
          include: {
            agent: {
              select: {
                name: true
              }
            }
          }
        });
        break;

      case 'AgentAccount':
        data = await prisma.agentAccount.findMany({
          take: 100,
          include: {
            agent: {
              select: {
                name: true
              }
            },
            ctAccount: {
              select: {
                username: true,
                xAccountId: true
              }
            }
          }
        });
        break;

      default:
        return res.status(400).json({ error: 'Invalid table name' });
    }

    // Serialize data (convert BigInt, Date, etc.)
    const serialized = JSON.parse(
      JSON.stringify(data, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    );

    res.status(200).json({ data: serialized });
  } catch (error) {
    console.error('Error fetching table data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
}

