/**
 * Create or update deployment for Hyperliquid agent
 * 
 * Flow:
 * 1. User calls /api/agents/[id]/generate-deployment-address to get/create user's address
 * 2. User whitelists the address on Hyperliquid
 * 3. User calls this API to create deployment
 * 
 * Note: Address is stored in user_agent_addresses (one per user)
 *       Deployment just links to user_wallet
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agentId, userWallet } = req.body;

    if (!agentId || !userWallet) {
      return res.status(400).json({ 
        error: 'Missing required fields: agentId, userWallet' 
      });
    }

    console.log('[CreateDeployment] Creating deployment:', {
      agentId,
      userWallet,
    });

    // Check if agent exists
    const agent = await prisma.agents.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify user has an agent address (should be created by generate-deployment-address)
    const userAddress = await prisma.user_agent_addresses.findUnique({
      where: { user_wallet: userWallet.toLowerCase() },
      select: {
        hyperliquid_agent_address: true,
      },
    });

    if (!userAddress || !userAddress.hyperliquid_agent_address) {
      return res.status(400).json({ 
        error: 'User agent address not found. Please generate address first.' 
      });
    }

    // Check if deployment already exists for this agent and user
    const existingDeployment = await prisma.agent_deployments.findFirst({
      where: {
        agent_id: agentId,
        user_wallet: userWallet.toLowerCase(),
      },
    });

    // CRITICAL FIX: Only add Hyperliquid to enabled_venues
    // Don't auto-add Ostium just because agent venue is MULTI
    // Ostium gets added when user whitelists it separately
    let enabledVenues = ['HYPERLIQUID'];
    
    if (existingDeployment) {
      // If deployment exists, append Hyperliquid to existing venues (avoid duplicates)
      const currentVenues = existingDeployment.enabled_venues || [];
      enabledVenues = Array.from(new Set([...currentVenues, 'HYPERLIQUID']));
      console.log('[CreateDeployment] Appending HYPERLIQUID to existing venues:', enabledVenues);
    }

    const deploymentData = {
      safe_wallet: userWallet.toLowerCase(),
      enabled_venues: enabledVenues, // Only the venue being whitelisted
      status: 'ACTIVE' as const,
      sub_active: true,
    };

    let deployment;

    if (existingDeployment) {
      // Update existing deployment
      console.log('[CreateDeployment] Updating existing deployment:', existingDeployment.id);
      deployment = await prisma.agent_deployments.update({
        where: { id: existingDeployment.id },
        data: deploymentData,
      });
    } else {
      // Create new deployment
      console.log('[CreateDeployment] Creating new deployment');
      deployment = await prisma.agent_deployments.create({
        data: {
          agent_id: agentId,
          user_wallet: userWallet.toLowerCase(),
          ...deploymentData,
        },
      });
    }

    console.log('[CreateDeployment] ✅ Deployment created/updated:', deployment.id);
    console.log('[CreateDeployment] Using user agent address:', userAddress.hyperliquid_agent_address);

    return res.status(200).json({
      success: true,
      deployment: {
        id: deployment.id,
        agentId: deployment.agent_id,
        userWallet: deployment.user_wallet,
        agentAddress: userAddress.hyperliquid_agent_address, // From user_agent_addresses
        status: deployment.status,
      },
      message: existingDeployment ? 'Deployment updated' : 'Deployment created',
    });
  } catch (error: any) {
    console.error('[CreateDeployment] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
  // Note: Don't disconnect - using singleton
}

