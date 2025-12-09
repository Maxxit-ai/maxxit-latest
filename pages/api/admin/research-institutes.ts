import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
/**
 * Admin API for managing research institutes
 * 
 * GET    /api/admin/research-institutes       - List all institutes
 * POST   /api/admin/research-institutes       - Create new institute
 */
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
    console.error('[ADMIN] Research institutes error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { active_only } = req.query;

  const institutes = await prisma.research_institutes.findMany({
    where: active_only === 'true' ? { is_active: true } : undefined,
    include: {
      _count: {
        select: {
          agent_research_institutes: true,
          research_signals: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  return res.status(200).json({
    success: true,
    institutes,
  });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { name, description, logo_url, website_url, x_handle } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  // Check if name already exists
  const existing = await prisma.research_institutes.findUnique({
    where: { name },
  });

  if (existing) {
    return res.status(400).json({ error: 'Institute with this name already exists' });
  }

  const institute = await prisma.research_institutes.create({
    data: {
      name,
      description: description || null,
      logo_url: logo_url || null,
      website_url: website_url || null,
      x_handle: x_handle || null,
      is_active: true,
    },
  });

  console.log(`[ADMIN] Created research institute: ${name}`);

  return res.status(201).json({
    success: true,
    institute,
  });
}

