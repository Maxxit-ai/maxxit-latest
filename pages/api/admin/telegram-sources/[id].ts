import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
/**
 * Admin API for managing individual Telegram sources
 * 
 * GET /api/admin/telegram-sources/[id] - Get source details
 * PATCH /api/admin/telegram-sources/[id] - Update source
 * DELETE /api/admin/telegram-sources/[id] - Delete source
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid source ID' });
  }

  if (req.method === 'GET') {
    try {
      const source = await prisma.telegram_sources.findUnique({
        where: { id },
        include: {
          research_institutes: {
            include: {
              agent_research_institutes: {
                include: {
                  agents: {
                    select: {
                      id: true,
                      name: true,
                      venue: true,
                      status: true,
                    }
                  }
                }
              }
            }
          },
          telegram_posts: {
            orderBy: { message_created_at: 'desc' },
            take: 20,
          },
          _count: {
            select: { 
              telegram_posts: true,
            }
          }
        },
      });

      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }

      return res.status(200).json({ success: true, source });
    } catch (error: any) {
      console.error('[ADMIN] Get Telegram source error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const {
        source_name,
        telegram_id,
        telegram_username,
        source_type,
        institute_id,
        description,
        is_active,
      } = req.body;

      // Build update data object
      const updateData: any = {};
      if (source_name !== undefined) updateData.source_name = source_name;
      if (telegram_id !== undefined) updateData.telegram_id = telegram_id;
      if (telegram_username !== undefined) updateData.telegram_username = telegram_username;
      if (source_type !== undefined) updateData.source_type = source_type;
      if (institute_id !== undefined) updateData.institute_id = institute_id;
      if (description !== undefined) updateData.description = description;
      if (is_active !== undefined) updateData.is_active = is_active;

      const source = await prisma.telegram_sources.update({
        where: { id },
        data: updateData,
        include: {
          research_institutes: true,
        },
      });

      console.log('[ADMIN] Updated Telegram source:', source.source_name);

      return res.status(200).json({ success: true, source });
    } catch (error: any) {
      console.error('[ADMIN] Update Telegram source error:', error);
      
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0];
        return res.status(400).json({ 
          error: `A source with this ${field} already exists` 
        });
      }

      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Source not found' });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.telegram_sources.delete({
        where: { id },
      });

      console.log('[ADMIN] Deleted Telegram source:', id);

      return res.status(200).json({ 
        success: true, 
        message: 'Source deleted successfully' 
      });
    } catch (error: any) {
      console.error('[ADMIN] Delete Telegram source error:', error);
      
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Source not found' });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

