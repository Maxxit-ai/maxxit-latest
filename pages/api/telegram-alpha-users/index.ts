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
    const alphaUsers = await prisma.telegram_alpha_users.findMany({
      where: {
        is_active: true, // Only show active users
      },
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
            telegram_posts: true, // Total messages
            agent_telegram_users: true, // How many agents follow this user
          }
        }
      },
      orderBy: [
        { last_message_at: 'desc' },
        { created_at: 'desc' }
      ]
    });

    return res.status(200).json({
      success: true,
      alphaUsers,
    });
  } catch (error: any) {
    console.error('[API] Error fetching telegram alpha users:', error);
    return res.status(500).json({ error: error.message });
  }
}

