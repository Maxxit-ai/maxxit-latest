import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
/**
 * API to list telegram alpha users (individual DM sources)
 * GET /api/telegram-alpha-users
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { includeAll } = req.query;
    const shouldIncludeAll = includeAll === "true";

    const where: any = {
      is_active: true,
    };

    if (!shouldIncludeAll) {
      where.public_source = true;
    }

    const alphaUsers = await prisma.telegram_alpha_users.findMany({
      where,
      select: {
        id: true,
        telegram_user_id: true,
        telegram_username: true,
        first_name: true,
        last_name: true,
        impact_factor: true,
        last_message_at: true,
        created_at: true,
        credit_price: true,
        _count: {
          select: {
            telegram_posts: true,
            agent_telegram_users: true,
          }
        }
      },
      orderBy: [
        { last_message_at: 'desc' },
        { telegram_username: 'asc' }
      ]
    });

    return res.status(200).json({
      success: true,
      alphaUsers,
    });
  } catch (error: any) {
    console.error('[API] Error fetching telegram alpha users:', error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch telegram alpha users"
    });
  }
}

