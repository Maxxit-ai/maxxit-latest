import { Router, Request, Response } from 'express';
import { prisma } from "@maxxit/database";

const router = Router();

/**
 * POST /api/hyperliquid/create-deployment
 * Create or update deployment for Hyperliquid agent
 */
router.post('/create-deployment', async (req: Request, res: Response) => {
  try {
    const { agentId, userWallet, agentAddress } = req.body;

    if (!agentId || !userWallet || !agentAddress) {
      return res.status(400).json({ 
        error: 'Missing required fields: agentId, userWallet, agentAddress' 
      });
    }

    console.log('[Hyperliquid Deployment] Creating deployment:', {
      agentId,
      userWallet,
      agentAddress,
    });

    // Check if agent exists
    const agent = await prisma.agents.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get encrypted key from user_hyperliquid_wallets
    const userWalletRecord = await prisma.user_hyperliquid_wallets.findFirst({
      where: {
        user_wallet: userWallet.toLowerCase(),
        agent_address: agentAddress,
      },
    });

    if (!userWalletRecord) {
      console.error('[Hyperliquid Deployment] User wallet record not found');
      return res.status(404).json({ 
        error: 'User wallet record not found. Please reconnect Hyperliquid.' 
      });
    }

    // Vprime: For MULTI venue agents, enable both Hyperliquid and Ostium
    // For single-venue agents, only enable that venue
    const enabledVenues = agent.venue === 'MULTI' 
      ? ['HYPERLIQUID', 'OSTIUM'] 
      : ['HYPERLIQUID'];

    const deploymentData = {
      safe_wallet: userWallet.toLowerCase(),
      hyperliquid_agent_address: agentAddress,
      hyperliquid_agent_key_encrypted: userWalletRecord.agent_private_key_encrypted,
      hyperliquid_agent_key_iv: userWalletRecord.agent_key_iv,
      hyperliquid_agent_key_tag: userWalletRecord.agent_key_tag,
      enabled_venues: enabledVenues,
      status: 'ACTIVE' as const,
      sub_active: true,
    };

    // Check if deployment already exists
    const existingDeployment = await prisma.agent_deployments.findFirst({
      where: {
        agent_id: agentId,
        user_wallet: userWallet.toLowerCase(),
      },
    });

    let deployment;

    if (existingDeployment) {
      console.log('[Hyperliquid Deployment] Updating existing deployment:', existingDeployment.id);
      deployment = await prisma.agent_deployments.update({
        where: { id: existingDeployment.id },
        data: deploymentData,
      });
    } else {
      console.log('[Hyperliquid Deployment] Creating new deployment');
      deployment = await prisma.agent_deployments.create({
        data: {
          agent_id: agentId,
          user_wallet: userWallet.toLowerCase(),
          ...deploymentData,
        },
      });
    }

    console.log('[Hyperliquid Deployment] ✅ Deployment created/updated:', deployment.id);

    return res.status(200).json({
      success: true,
      deployment: {
        id: deployment.id,
        agentId: deployment.agent_id,
        userWallet: deployment.user_wallet,
        agentAddress: deployment?.module_address || '',
        status: deployment.status,
      },
      message: existingDeployment ? 'Deployment updated' : 'Deployment created',
    });
  } catch (error: any) {
    console.error('[Hyperliquid Deployment] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

export default router;

