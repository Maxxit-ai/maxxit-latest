import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
/**
 * Admin API for managing Telegram sources
 * 
 * GET /api/admin/telegram-sources - List all sources
 * POST /api/admin/telegram-sources - Create new source
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    try {
      const sources = await prisma.telegram_sources.findMany({
        include: {
          research_institutes: true,
          _count: {
            select: { telegram_posts: true }
          }
        },
        orderBy: { created_at: 'desc' },
      });

      return res.status(200).json({ success: true, sources });
    } catch (error: any) {
      console.error('[ADMIN] Get Telegram sources error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const {
        source_name,
        telegram_id,
        telegram_username,
        source_type,
        institute_id,
        description,
      } = req.body;

      if (!source_name) {
        return res.status(400).json({ error: 'source_name is required' });
      }

      if (!telegram_id && !telegram_username) {
        return res.status(400).json({ 
          error: 'Either telegram_id or telegram_username is required' 
        });
      }

      // Validate source_type
      const validTypes = ['CHANNEL', 'GROUP', 'USER'];
      if (source_type && !validTypes.includes(source_type)) {
        return res.status(400).json({ 
          error: `source_type must be one of: ${validTypes.join(', ')}` 
        });
      }

      // If institute_id provided, verify it exists
      if (institute_id) {
        const institute = await prisma.research_institutes.findUnique({
          where: { id: institute_id },
        });

        if (!institute) {
          return res.status(404).json({ error: 'Institute not found' });
        }
      }

      const source = await prisma.telegram_sources.create({
        data: {
          source_name,
          telegram_id,
          telegram_username,
          source_type: source_type || 'CHANNEL',
          institute_id: institute_id || null,
          description,
        },
        include: {
          research_institutes: true,
        },
      });

      console.log('[ADMIN] Created Telegram source:', source.source_name);

      return res.status(201).json({ success: true, source });
    } catch (error: any) {
      console.error('[ADMIN] Create Telegram source error:', error);
      
      // Handle unique constraint violations
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0];
        return res.status(400).json({ 
          error: `A source with this ${field} already exists` 
        });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

