import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { bucket6hUtc } from '../../../lib/time-utils';
import { serializePrisma } from '../../../lib/prisma-serializer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agentId, tokenSymbol, from, to } = req.query;

    const where: any = {};
    if (agentId) where.agentId = agentId;
    if (tokenSymbol) where.tokenSymbol = tokenSymbol;
    
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from as string);
      if (to) where.createdAt.lte = new Date(to as string);
    }

    const signals = await prisma.signal.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: 100, // Limit to 100 most recent
    });

    // Add 6h bucket to each signal and serialize to ensure JSON-safe response
    const signalsWithBucket = signals.map(signal => {
      const bucket6h = bucket6hUtc(signal.createdAt);
      const serialized = serializePrisma(signal);
      return {
        ...serialized,
        bucket6h: bucket6h.toISOString(),
      };
    });

    return res.status(200).json(signalsWithBucket);
  } catch (error: any) {
    console.error('[API /signals] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
