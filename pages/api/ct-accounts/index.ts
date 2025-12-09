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
          { xUsername: { contains: search as string, mode: 'insensitive' as const } },
          { displayName: { contains: search as string, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const ctAccounts = await prisma.ctAccount.findMany({
    where,
    take: parseInt(limit as string),
    orderBy: [
      { impactFactor: 'desc' },
      { followersCount: 'desc' },
    ],
    select: {
      id: true,
      xUsername: true,
      displayName: true,
      followersCount: true,
      impactFactor: true,
      lastSeenAt: true,
      _count: {
        select: {
          ctPosts: true,
          agentAccounts: true,
        },
      },
    },
  });

  return res.status(200).json(ctAccounts);
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const validated = createCtAccountSchema.parse(req.body);

    // Check if account already exists
    const existing = await prisma.ctAccount.findUnique({
      where: { xUsername: validated.xUsername },
    });

    if (existing) {
      return res.status(400).json({ 
        error: 'CT account with this username already exists',
        account: existing,
      });
    }

    // Create new CT account
    const ctAccount = await prisma.ctAccount.create({
      data: {
        xUsername: validated.xUsername,
        displayName: validated.displayName,
        followersCount: validated.followersCount,
        impactFactor: 0,
      },
      select: {
        id: true,
        xUsername: true,
        displayName: true,
        followersCount: true,
        impactFactor: true,
        lastSeenAt: true,
      },
    });

    // TODO: Trigger initial tweet ingestion for this account
    // await tweetIngestQueue.add('ingest-tweets', { ctAccountId: ctAccount.id });

    return res.status(201).json(ctAccount);
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

