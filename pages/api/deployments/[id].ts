import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { z } from 'zod';
import { DeploymentStatusEnum } from '@shared/schema';

const updateDeploymentSchema = z.object({
  status: DeploymentStatusEnum.optional(),
  subActive: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Deployment ID is required' });
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
    console.error(`[API /deployments/${id}] Error:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(id: string, req: NextApiRequest, res: NextApiResponse) {
  const deployment = await prisma.agentDeployment.findUnique({
    where: { id },
    include: {
      agent: true,
    },
  });

  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  return res.status(200).json(deployment);
}

async function handlePatch(id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const validated = updateDeploymentSchema.parse(req.body);

    const existing = await prisma.agentDeployment.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const deployment = await prisma.agentDeployment.update({
      where: { id },
      data: validated,
      include: {
        agent: true,
      },
    });

    return res.status(200).json(deployment);
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
