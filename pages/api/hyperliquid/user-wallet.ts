/**
 * Hyperliquid User Wallet API
 * Manages one agent wallet per user
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserAgentWallet } from '../../../lib/hyperliquid-user-wallet';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check encryption key is configured
    if (!process.env.AGENT_WALLET_ENCRYPTION_KEY) {
      return res.status(500).json({
        error: 'Hyperliquid wallet service not configured. AGENT_WALLET_ENCRYPTION_KEY missing.',
      });
    }

    // GET - Retrieve user's agent wallet
    if (req.method === 'GET') {
      const { userAddress } = req.query;

      if (!userAddress || typeof userAddress !== 'string') {
        return res.status(400).json({ error: 'userAddress query param required' });
      }

      const userWallet = await prisma.user_hyperliquid_wallets.findUnique({
        where: { user_wallet: userAddress.toLowerCase() },
      });

      if (!userWallet) {
        return res.status(404).json({ error: 'No agent wallet found for this user' });
      }

      return res.status(200).json({
        agentAddress: userWallet.agent_address,
        isApproved: userWallet.is_approved || false,
        createdAt: userWallet.created_at,
        lastUsedAt: userWallet.last_used_at,
      });
    }

    // POST - Create or get user's agent wallet
    if (req.method === 'POST') {
      const { userAddress } = req.body;

      if (!userAddress) {
        return res.status(400).json({ error: 'userAddress required' });
      }

      const agentAddress = await getUserAgentWallet(userAddress.toLowerCase());
      
      const userWallet = await prisma.user_hyperliquid_wallets.findUnique({
        where: { user_wallet: userAddress.toLowerCase() },
      });

      if (!userWallet) {
        return res.status(500).json({ error: 'Failed to create wallet' });
      }

      return res.status(200).json({
        agentAddress: userWallet.agent_address,
        isApproved: userWallet.is_approved || false,
        createdAt: userWallet.created_at,
      });
    }

    // PATCH - Update approval status
    if (req.method === 'PATCH') {
      const { userAddress, isApproved } = req.body;

      if (!userAddress) {
        return res.status(400).json({ error: 'userAddress required' });
      }

      // Check if wallet exists first
      const existingWallet = await prisma.user_hyperliquid_wallets.findUnique({
        where: { user_wallet: userAddress.toLowerCase() },
      });

      if (!existingWallet) {
        return res.status(404).json({ 
          error: 'Wallet not found. Please create the wallet first.' 
        });
      }

      const userWallet = await prisma.user_hyperliquid_wallets.update({
        where: { user_wallet: userAddress.toLowerCase() },
        data: { 
          is_approved: isApproved,
          last_used_at: new Date(),
        },
      });

      return res.status(200).json({
        agentAddress: userWallet.agent_address,
        isApproved: userWallet.is_approved,
      });
    }

    // DELETE - Remove user's agent wallet (for reset/regenerate)
    if (req.method === 'DELETE') {
      const { userAddress } = req.body;

      if (!userAddress) {
        return res.status(400).json({ error: 'userAddress required' });
      }

      const normalizedAddress = userAddress.toLowerCase();

      // Delete from user_hyperliquid_wallets
      await prisma.user_hyperliquid_wallets.deleteMany({
        where: { user_wallet: normalizedAddress },
      });

      // Clear from wallet_pool
      await prisma.$executeRaw`
        DELETE FROM wallet_pool WHERE assigned_to_user_wallet = ${normalizedAddress}
      `;

      // Clear agent address from deployments
      await prisma.agent_deployments.updateMany({
        where: { user_wallet: normalizedAddress },
        data: { hyperliquid_agent_address: null },
      });

      return res.status(200).json({ 
        success: true,
        message: 'Agent wallet deleted successfully' 
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[HyperliquidUserWallet] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
  // Note: Don't disconnect - using singleton
}

