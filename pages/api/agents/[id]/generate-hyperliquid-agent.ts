import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { assignWalletToUser, getAssignedWallet } from '../../../../lib/wallet-pool';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: agentId } = req.query;
  const { deploymentId } = req.body;

  if (typeof agentId !== 'string') {
    return res.status(400).json({ error: 'Invalid agent ID' });
  }

  if (!deploymentId) {
    return res.status(400).json({ error: 'Deployment ID required' });
  }

  try {
    // Check if deployment already has an agent
    const deployment = await prisma.agent_deployments.findUnique({
      where: { id: deploymentId }
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    if (deployment.hyperliquid_agent_address) {
      // Agent already exists for this deployment
      return res.status(200).json({
        agentAddress: deployment.hyperliquid_agent_address,
        alreadyExists: true
      });
    }

    // Check if user already has an assigned wallet
    let wallet = await getAssignedWallet(deployment.user_wallet);
    
    if (!wallet) {
      // Assign a new wallet from the pool
      wallet = await assignWalletToUser(deployment.user_wallet);
      
      if (!wallet) {
        return res.status(500).json({ 
          error: 'No available wallets in pool. Contact admin to add more wallets.' 
        });
      }
    }

    // Save agent address to deployment (NO encryption needed!)
    await prisma.agent_deployments.update({
      where: { id: deploymentId },
      data: {
        hyperliquid_agent_address: wallet.address,
        // No encrypted key fields needed!
      }
    });

    console.log(`[WalletPool] Assigned wallet ${wallet.address} to deployment ${deploymentId}`);

    return res.status(200).json({
      agentAddress: wallet.address,
      alreadyExists: false
    });
  } catch (error: any) {
    console.error(`[HyperliquidAgent] Error assigning wallet:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
  // Note: Don't disconnect - using singleton
}

