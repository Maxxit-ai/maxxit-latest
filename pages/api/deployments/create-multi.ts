import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
/**
 * Create deployment for MULTI venue agent
 * User can then set up individual venues from My Deployments page
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agentId, userWallet, enabledVenues } = req.body;

    if (!agentId || !userWallet) {
      return res.status(400).json({ 
        error: 'Missing required fields: agentId, userWallet' 
      });
    }

    console.log('[Create Multi Deployment] Creating deployment:', {
      agentId,
      userWallet,
      enabledVenues,
    });

    // Check if agent exists and is MULTI venue
    const agent = await prisma.agents.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (agent.venue !== 'MULTI') {
      return res.status(400).json({ error: 'This endpoint is only for MULTI venue agents' });
    }

    // Check if deployment already exists
    const existingDeployment = await prisma.agent_deployments.findFirst({
      where: {
        agent_id: agentId,
        user_wallet: userWallet.toLowerCase(),
      },
    });

    if (existingDeployment) {
      console.log('[Create Multi Deployment] Deployment already exists:', existingDeployment.id);
      return res.status(200).json({
        success: true,
        deployment: {
          id: existingDeployment.id,
          agentId: existingDeployment.agent_id,
          userWallet: existingDeployment.user_wallet,
          status: existingDeployment.status,
        },
        message: 'Deployment already exists',
      });
    }

    // Create new deployment with all venues enabled
    const deployment = await prisma.agent_deployments.create({
      data: {
        agent_id: agentId,
        user_wallet: userWallet.toLowerCase(),
        safe_wallet: userWallet.toLowerCase(),
        status: 'ACTIVE',
        enabled_venues: enabledVenues || ['HYPERLIQUID', 'OSTIUM', 'SPOT'],
        module_enabled: false,
      },
    });

    console.log('[Create Multi Deployment] ✅ Deployment created:', deployment.id);

    return res.status(200).json({
      success: true,
      deployment: {
        id: deployment.id,
        agentId: deployment.agent_id,
        userWallet: deployment.user_wallet,
        status: deployment.status,
        enabledVenues: deployment.enabled_venues,
      },
      message: 'Deployment created successfully',
    });
  } catch (error: any) {
    console.error('[Create Multi Deployment] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to create deployment' 
    });
  }
  // Note: Don't disconnect - using singleton
}

