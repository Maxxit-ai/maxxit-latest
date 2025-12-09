import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { ethers } from 'ethers';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, agentId } = req.body;

    if (!userId || !agentId) {
      return res.status(400).json({ error: 'userId and agentId are required' });
    }

    // Generate new agent wallet
    const agentWallet = ethers.Wallet.createRandom();
    const agentAddress = agentWallet.address;
    const agentPrivateKey = agentWallet.privateKey;

    // Register in wallet pool (encrypted)
    const { registerPrivateKey } = await import('../../../lib/wallet-pool');
    await registerPrivateKey(agentAddress, agentPrivateKey, userId);

    console.log('[Ostium Generate Agent] Created agent wallet:', agentAddress);

    return res.status(200).json({
      success: true,
      agentAddress,
    });
  } catch (error: any) {
    console.error('[Ostium Generate Agent API] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate agent wallet',
    });
  }
}

