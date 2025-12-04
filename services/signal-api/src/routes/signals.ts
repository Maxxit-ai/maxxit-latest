import { Router, Request, Response } from 'express';
import { prisma } from "@maxxit/database";

const router = Router();

// Utility function to bucket time into 6-hour intervals
function bucket6hUtc(date: Date): Date {
  const hours = date.getUTCHours();
  const bucketHour = Math.floor(hours / 6) * 6;
  const bucket = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    bucketHour,
    0,
    0,
    0
  ));
  return bucket;
}

// Serialize Prisma objects to ensure JSON-safe response
function serializePrisma(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializePrisma);
  
  const result: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      if (typeof value === 'bigint') {
        result[key] = value.toString();
      } else if (value instanceof Date) {
        result[key] = value.toISOString();
      } else if (typeof value === 'object' && value !== null) {
        result[key] = serializePrisma(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * GET /api/signals
 * List signals with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { agentId, tokenSymbol, from, to, venue, limit = '100' } = req.query;

    const where: any = {};
    if (agentId && typeof agentId === 'string') {
      where.agent_id = agentId;
    }
    if (tokenSymbol && typeof tokenSymbol === 'string') {
      where.token_symbol = tokenSymbol;
    }
    if (venue && typeof venue === 'string') {
      where.venue = venue;
    }
    
    if (from || to) {
      where.created_at = {};
      if (from && typeof from === 'string') {
        where.created_at.gte = new Date(from);
      }
      if (to && typeof to === 'string') {
        where.created_at.lte = new Date(to);
      }
    }

    const signals = await prisma.signals.findMany({
      where,
      orderBy: {
        created_at: 'desc',
      },
      take: parseInt(limit as string),
    });

    // Add 6h bucket to each signal and serialize
    const signalsWithBucket = signals.map((signal: any) => {
      const bucket6h = bucket6hUtc(signal.created_at);
      const serialized = serializePrisma(signal);
      return {
        ...serialized,
        bucket6h: bucket6h.toISOString(),
      };
    });

    return res.status(200).json(signalsWithBucket);
  } catch (error: any) {
    console.error('[Signal API] GET / error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch signals' });
  }
});

/**
 * GET /api/signals/:id
 * Get a single signal by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const signal = await prisma.signals.findUnique({
      where: { id },
      include: {
        agents: true,
      },
    });

    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    const serialized = serializePrisma(signal);
    const bucket6h = bucket6hUtc(signal.created_at);

    return res.status(200).json({
      ...serialized,
      bucket6h: bucket6h.toISOString(),
    });
  } catch (error: any) {
    console.error('[Signal API] GET /:id error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch signal' });
  }
});

/**
 * GET /api/signals/agent/:agentId/stats
 * Get signal statistics for an agent
 */
router.get('/agent/:agentId/stats', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    // Get total signal count
    const totalSignals = await prisma.signals.count({
      where: { agent_id: agentId },
    });

    // Get signal counts by venue (for multi-venue agents)
    const venueCounts = await prisma.signals.groupBy({
      by: ['venue'],
      where: { agent_id: agentId },
      _count: true,
    });

    // Get recent signals
    const recentSignals = await prisma.signals.findMany({
      where: { agent_id: agentId },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    return res.status(200).json({
      totalSignals,
      venueCounts: venueCounts.map((vc: any) => ({
        venue: vc.venue,
        count: vc._count,
      })),
      recentSignals: recentSignals.map((s: any) => serializePrisma(s)),
    });
  } catch (error: any) {
    console.error('[Signal API] GET /agent/:agentId/stats error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch signal stats' });
  }
});

export default router;

