import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from "@maxxit/database";

const router = Router();

// Schemas
const DeploymentStatusEnum = z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']);

const updateDeploymentSchema = z.object({
  status: DeploymentStatusEnum.optional(),
  sub_active: z.boolean().optional(),
});

/**
 * GET /api/deployments
 * List all deployments with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { agentId, userWallet } = req.query;

    const where: any = {};
    if (agentId && typeof agentId === 'string') {
      where.agent_id = agentId;
    }
    if (userWallet && typeof userWallet === 'string') {
      where.user_wallet = userWallet.toLowerCase();
    }

    const deployments = await prisma.agent_deployments.findMany({
      where,
      include: {
        agents: true,
      },
      orderBy: {
        sub_started_at: 'desc',
      },
    });

    return res.status(200).json(deployments);
  } catch (error: any) {
    console.error('[Deployments API] GET / error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch deployments' });
  }
});

/**
 * GET /api/deployments/:id
 * Get a single deployment by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deployment = await prisma.agent_deployments.findUnique({
      where: { id },
      include: {
        agents: true,
      },
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    return res.status(200).json(deployment);
  } catch (error: any) {
    console.error('[Deployments API] GET /:id error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch deployment' });
  }
});

/**
 * PATCH /api/deployments/:id
 * Update a deployment (status, sub_active)
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = updateDeploymentSchema.parse(req.body);

    const existing = await prisma.agent_deployments.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const deployment = await prisma.agent_deployments.update({
      where: { id },
      data: validated,
      include: {
        agents: true,
      },
    });

    console.log('[Deployments API] ✅ Updated deployment:', deployment.id);

    return res.status(200).json(deployment);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors,
      });
    }
    console.error('[Deployments API] PATCH /:id error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update deployment' });
  }
});

/**
 * DELETE /api/deployments/:id
 * Delete a deployment
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.agent_deployments.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    await prisma.agent_deployments.delete({
      where: { id },
    });

    console.log('[Deployments API] ✅ Deleted deployment:', id);

    return res.status(200).json({ message: 'Deployment deleted successfully' });
  } catch (error: any) {
    console.error('[Deployments API] DELETE /:id error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete deployment' });
  }
});

export default router;

