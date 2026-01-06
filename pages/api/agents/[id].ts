import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { z } from 'zod';
import { AgentStatusEnum } from '@shared/schema';

// Partial update schema for agents
const updateAgentSchema = z.object({
  status: AgentStatusEnum.optional(),
  weights: z.array(z.number().int().min(0).max(100)).length(8).optional(),
  name: z.string().min(1).max(100).optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Agent ID is required' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, req, res);
      case 'PATCH':
        return await handlePatch(id, req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error(`[API /agents/${id}] Error:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(id: string, req: NextApiRequest, res: NextApiResponse) {
  const agent = await prisma.agents.findUnique({
    where: { id },
    include: {
      agent_telegram_users: {
        include: {
          telegram_alpha_users: true
        }
      }
    }
  });

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  return res.status(200).json(agent);
}

async function handlePatch(id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const validated = updateAgentSchema.parse(req.body);

    // Check if agent exists
    const existing = await prisma.agents.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Update agent
    const agent = await prisma.agents.update({
      where: { id },
      data: validated,
    });

    return res.status(200).json(agent);
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
