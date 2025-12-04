import { Router, Request, Response } from 'express';
import { prisma } from "@maxxit/database";

const router = Router();

/**
 * POST /api/ostium/create-deployment
 * Create deployment for Ostium agent
 */
router.post('/create-deployment', async (req: Request, res: Response) => {
  try {
    const { agentId, userWallet, agentAddress } = req.body;

    if (!agentId || !userWallet || !agentAddress) {
      return res.status(400).json({
        error: 'agentId, userWallet, and agentAddress are required',
      });
    }

    console.log('[Ostium Deployment] Creating deployment:', {
      agentId,
      userWallet,
      agentAddress,
    });

    // Check if deployment already exists
    const existingDeployment = await prisma.agent_deployments.findFirst({
      where: {
        agent_id: agentId,
        user_wallet: userWallet,
      },
    });

    if (existingDeployment) {
      console.log('[Ostium Deployment] Deployment already exists:', existingDeployment.id);
      return res.status(200).json({
        success: true,
        deployment: existingDeployment,
        message: 'Deployment already exists',
      });
    }

    // Get agent to check venue
    const agent = await prisma.agents.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Create new deployment
    const deployment = await prisma.agent_deployments.create({
      data: {
        agent_id: agentId,
        user_wallet: userWallet,
        safe_wallet: userWallet, // For Ostium, safe_wallet = user's Arbitrum wallet
        status: 'ACTIVE',
        module_enabled: true, // Ostium doesn't need Safe module
      },
    });

    console.log('[Ostium Deployment] ✅ Created deployment:', deployment.id);

    return res.status(200).json({
      success: true,
      deployment,
      message: 'Deployment created successfully',
    });
  } catch (error: any) {
    console.error('[Ostium Deployment] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create deployment',
    });
  }
});

export default router;

