import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
/**
 * API for managing agent's research institute subscriptions
 * 
 * GET    /api/agents/[id]/research-institutes  - List agent's institutes
 * POST   /api/agents/[id]/research-institutes  - Link institute to agent
 * DELETE /api/agents/[id]/research-institutes  - Unlink institute (via body)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { id: agentId } = req.query;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Verify agent exists
    const agent = await prisma.agents.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (req.method === 'GET') {
      return await handleGet(agentId, req, res);
    } else if (req.method === 'POST') {
      return await handlePost(agentId, req, res);
    } else if (req.method === 'DELETE') {
      return await handleDelete(agentId, req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('[API] Agent research institutes error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(agentId: string, req: NextApiRequest, res: NextApiResponse) {
  const links = await prisma.agent_research_institutes.findMany({
    where: {
      agent_id: agentId,
    },
    include: {
      research_institutes: {
        select: {
          id: true,
          name: true,
          description: true,
          logo_url: true,
          website_url: true,
          x_handle: true,
          is_active: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  const institutes = links.map(link => link.research_institutes);

  return res.status(200).json({
    success: true,
    institutes,
  });
}

async function handlePost(agentId: string, req: NextApiRequest, res: NextApiResponse) {
  const { institute_id } = req.body;

  if (!institute_id) {
    return res.status(400).json({ error: 'institute_id is required' });
  }

  // Verify institute exists and is active
  const institute = await prisma.research_institutes.findUnique({
    where: { id: institute_id },
  });

  if (!institute) {
    return res.status(404).json({ error: 'Institute not found' });
  }

  if (!institute.is_active) {
    return res.status(400).json({ error: 'Institute is not active' });
  }

  // Check if already linked
  const existing = await prisma.agent_research_institutes.findUnique({
    where: {
      agent_id_institute_id: {
        agent_id: agentId,
        institute_id,
      },
    },
  });

  if (existing) {
    return res.status(400).json({ error: 'Agent already subscribed to this institute' });
  }

  // Create link
  const link = await prisma.agent_research_institutes.create({
    data: {
      agent_id: agentId,
      institute_id,
    },
    include: {
      research_institutes: true,
    },
  });

  console.log(`[API] Linked agent ${agentId} to institute ${institute.name}`);

  return res.status(201).json({
    success: true,
    message: 'Institute linked to agent',
    institute: link.research_institutes,
  });
}

async function handleDelete(agentId: string, req: NextApiRequest, res: NextApiResponse) {
  const { institute_id } = req.body;

  if (!institute_id) {
    return res.status(400).json({ error: 'institute_id is required' });
  }

  // Delete link
  await prisma.agent_research_institutes.delete({
    where: {
      agent_id_institute_id: {
        agent_id: agentId,
        institute_id,
      },
    },
  });

  console.log(`[API] Unlinked agent ${agentId} from institute ${institute_id}`);

  return res.status(200).json({
    success: true,
    message: 'Institute unlinked from agent',
  });
}

