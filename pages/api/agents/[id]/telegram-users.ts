import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
/**
 * Link/unlink telegram alpha users to an agent
 * 
 * POST /api/agents/:id/telegram-users - Link telegram alpha user to agent
 * DELETE /api/agents/:id/telegram-users?telegram_alpha_user_id=xxx - Unlink
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id: agentId } = req.query;

  if (typeof agentId !== 'string') {
    return res.status(400).json({ error: 'Invalid agent ID' });
  }

  if (req.method === 'POST') {
    return handleLink(agentId, req, res);
  } else if (req.method === 'DELETE') {
    return handleUnlink(agentId, req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleLink(
  agentId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { telegram_alpha_user_id } = req.body;

    if (!telegram_alpha_user_id) {
      return res.status(400).json({ error: 'telegram_alpha_user_id is required' });
    }

    // Verify agent exists
    const agent = await prisma.agents.findUnique({
      where: { id: agentId }
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify telegram alpha user exists
    const alphaUser = await prisma.telegram_alpha_users.findUnique({
      where: { id: telegram_alpha_user_id }
    });

    if (!alphaUser) {
      return res.status(404).json({ error: 'Telegram alpha user not found' });
    }

    // Check if already linked
    const existing = await prisma.agent_telegram_users.findUnique({
      where: {
        agent_id_telegram_alpha_user_id: {
          agent_id: agentId,
          telegram_alpha_user_id,
        }
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Already linked' });
    }

    // Create link
    const link = await prisma.agent_telegram_users.create({
      data: {
        agent_id: agentId,
        telegram_alpha_user_id,
      },
      include: {
        telegram_alpha_users: true
      }
    });

    console.log(`[API] Linked telegram alpha user ${alphaUser.telegram_username || alphaUser.first_name} to agent ${agent.name}`);

    return res.status(200).json({
      success: true,
      link,
    });
  } catch (error: any) {
    console.error('[API] Error linking telegram alpha user:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleUnlink(
  agentId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { telegram_alpha_user_id } = req.query;

    if (typeof telegram_alpha_user_id !== 'string') {
      return res.status(400).json({ error: 'telegram_alpha_user_id is required' });
    }

    // Delete link
    await prisma.agent_telegram_users.delete({
      where: {
        agent_id_telegram_alpha_user_id: {
          agent_id: agentId,
          telegram_alpha_user_id,
        }
      }
    });

    console.log(`[API] Unlinked telegram alpha user from agent ${agentId}`);

    return res.status(200).json({
      success: true,
      message: 'Telegram alpha user unlinked'
    });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Link not found' });
    }
    console.error('[API] Error unlinking telegram alpha user:', error);
    return res.status(500).json({ error: error.message });
  }
}

