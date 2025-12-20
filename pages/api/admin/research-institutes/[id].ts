import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
/**
 * Admin API for managing individual research institute
 * 
 * GET    /api/admin/research-institutes/[id]  - Get institute details
 * PUT    /api/admin/research-institutes/[id]  - Update institute
 * DELETE /api/admin/research-institutes/[id]  - Deactivate institute
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid institute ID' });
    }

    if (req.method === 'GET') {
      return await handleGet(id, req, res);
    } else if (req.method === 'PUT') {
      return await handlePut(id, req, res);
    } else if (req.method === 'DELETE') {
      return await handleDelete(id, req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('[ADMIN] Research institute error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(id: string, req: NextApiRequest, res: NextApiResponse) {
  const institute = await prisma.research_institutes.findUnique({
    where: { id },
    include: {
      agent_research_institutes: {
        include: {
          agents: {
            select: {
              id: true,
              name: true,
              venue: true,
              status: true,
            },
          },
        },
      },
      research_signals: {
        orderBy: { created_at: 'desc' },
        take: 10,
      },
      _count: {
        select: {
          agent_research_institutes: true,
          research_signals: true,
        },
      },
    },
  });

  if (!institute) {
    return res.status(404).json({ error: 'Institute not found' });
  }

  return res.status(200).json({
    success: true,
    institute,
  });
}

async function handlePut(id: string, req: NextApiRequest, res: NextApiResponse) {
  const { name, description, logo_url, website_url, x_handle, is_active } = req.body;

  const institute = await prisma.research_institutes.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(logo_url !== undefined && { logo_url }),
      ...(website_url !== undefined && { website_url }),
      ...(x_handle !== undefined && { x_handle }),
      ...(is_active !== undefined && { is_active }),
    },
  });

  console.log(`[ADMIN] Updated research institute: ${institute.name}`);

  return res.status(200).json({
    success: true,
    institute,
  });
}

async function handleDelete(id: string, req: NextApiRequest, res: NextApiResponse) {
  // Soft delete by setting is_active to false
  const institute = await prisma.research_institutes.update({
    where: { id },
    data: {
      is_active: false,
    },
  });

  console.log(`[ADMIN] Deactivated research institute: ${institute.name}`);

  return res.status(200).json({
    success: true,
    message: 'Institute deactivated',
    institute,
  });
}

