import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { z } from 'zod';

const createCtAccountSchema = z.object({
  xUsername: z.string().min(1).max(50),
  displayName: z.string().optional(),
  followersCount: z.number().int().min(0).optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    } else if (req.method === 'POST') {
      return await handlePost(req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('[CT Accounts API]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { search, limit = '50' } = req.query;

  const where = search
    ? {
        OR: [
          { x_username: { contains: search as string, mode: 'insensitive' as const } },
          { display_name: { contains: search as string, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const ctAccounts = await prisma.ct_accounts.findMany({
    where,
    take: parseInt(limit as string),
    orderBy: [
      { impact_factor: 'desc' },
      { followers_count: 'desc' },
    ],
    select: {
      id: true,
      x_username: true,
      display_name: true,
      followers_count: true,
      impact_factor: true,
      last_seen_at: true,
      _count: {
        select: {
          ct_posts: true,
          agent_accounts: true,
        },
      },
    },
  });

  // Convert to camelCase for frontend
  const formatted = ctAccounts.map(acc => ({
    id: acc.id,
    xUsername: acc.x_username,
    displayName: acc.display_name,
    followersCount: acc.followers_count,
    impactFactor: acc.impact_factor,
    lastSeenAt: acc.last_seen_at,
    _count: acc._count,
  }));

  return res.status(200).json(formatted);
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const validated = createCtAccountSchema.parse(req.body);

    // Check if account already exists
    const existing = await prisma.ct_accounts.findUnique({
      where: { x_username: validated.xUsername },
    });

    if (existing) {
      return res.status(400).json({ 
        error: 'CT account with this username already exists',
        account: {
          id: existing.id,
          xUsername: existing.x_username,
          displayName: existing.display_name,
          followersCount: existing.followers_count,
          impactFactor: existing.impact_factor,
          lastSeenAt: existing.last_seen_at,
        },
      });
    }

    // Create new CT account
    const ctAccount = await prisma.ct_accounts.create({
      data: {
        x_username: validated.xUsername,
        display_name: validated.displayName,
        followers_count: validated.followersCount,
        impact_factor: 0,
      },
      select: {
        id: true,
        x_username: true,
        display_name: true,
        followers_count: true,
        impact_factor: true,
        last_seen_at: true,
      },
    });

    // Convert to camelCase for frontend
    const formatted = {
      id: ctAccount.id,
      xUsername: ctAccount.x_username,
      displayName: ctAccount.display_name,
      followersCount: ctAccount.followers_count,
      impactFactor: ctAccount.impact_factor,
      lastSeenAt: ctAccount.last_seen_at,
    };

    // TODO: Trigger initial tweet ingestion for this account
    // await tweetIngestQueue.add('ingest-tweets', { ctAccountId: ctAccount.id });

    return res.status(201).json(formatted);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors,
      });
    }
    throw error;
  }
}

