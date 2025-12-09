import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';
/**
 * Public API for listing active research institutes
 * 
 * GET /api/research-institutes - List all active institutes
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const institutes = await prisma.research_institutes.findMany({
      where: {
        is_active: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        logo_url: true,
        website_url: true,
        x_handle: true,
        _count: {
          select: {
            agent_research_institutes: true, // How many agents follow this
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return res.status(200).json({
      success: true,
      institutes,
    });
  } catch (error: any) {
    console.error('[API] Research institutes error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

