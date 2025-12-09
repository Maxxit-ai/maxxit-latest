/**
 * Get or Generate User Agent Address
 * 
 * ONE address per USER (not per deployment)
 * 
 * Flow:
 * 1. User clicks "Deploy Agent" (first time)
 * 2. This API checks if user already has an address
 * 3. If not, generates new address and stores it
 * 4. Returns address for user to whitelist
 * 5. User whitelists on Hyperliquid/Ostium
 * 6. User confirms → create-deployment API is called
 * 
 * Subsequent deployments:
 * - Same user deploys another agent → Uses existing address
 * - No need to whitelist again
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { 
  getOrCreateHyperliquidAgentAddress,
  getOrCreateOstiumAgentAddress 
} from '../../../../lib/deployment-agent-address';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id: agentId } = req.query;
    const { userWallet, venue } = req.body;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    if (!userWallet) {
      return res.status(400).json({ error: 'User wallet required' });
    }

    if (!venue || !['HYPERLIQUID', 'OSTIUM', 'MULTI'].includes(venue)) {
      return res.status(400).json({ error: 'Valid venue required (HYPERLIQUID, OSTIUM, or MULTI)' });
    }

    console.log('[GenerateUserAgentAddress] Getting/creating address for user:', {
      agentId,
      userWallet,
      venue,
    });

    // Check if agent exists
    const agent = await prisma.agents.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        name: true,
        venue: true,
      },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // For MULTI venue agents, get/create addresses for both venues
    if (agent.venue === 'MULTI' || venue === 'MULTI') {
      const hyperliquidResult = await getOrCreateHyperliquidAgentAddress({ userWallet });
      const ostiumResult = await getOrCreateOstiumAgentAddress({ userWallet });

      console.log('[GenerateUserAgentAddress] ✅ Got/created MULTI venue addresses');
      console.log('  Hyperliquid:', hyperliquidResult.address);
      console.log('  Ostium:', ostiumResult.address);

      return res.status(200).json({
        success: true,
        venue: 'MULTI',
        addresses: {
          hyperliquid: {
            address: hyperliquidResult.address,
            encrypted: hyperliquidResult.encrypted,
          },
          ostium: {
            address: ostiumResult.address,
            encrypted: ostiumResult.encrypted,
          },
        },
        message: 'Please whitelist both addresses (if not already done)',
      });
    }

    // Single venue agent
    if (venue === 'HYPERLIQUID') {
      const result = await getOrCreateHyperliquidAgentAddress({ userWallet });
      console.log('[GenerateUserAgentAddress] ✅ Got/created Hyperliquid address:', result.address);
      
      return res.status(200).json({
        success: true,
        venue: 'HYPERLIQUID',
        address: result.address,
        encrypted: result.encrypted,
        message: 'Please whitelist this address on Hyperliquid (if not already done)',
      });
    }

    if (venue === 'OSTIUM') {
      const result = await getOrCreateOstiumAgentAddress({ userWallet });
      console.log('[GenerateUserAgentAddress] ✅ Got/created Ostium address:', result.address);
      
      return res.status(200).json({
        success: true,
        venue: 'OSTIUM',
        address: result.address,
        encrypted: result.encrypted,
        message: 'Please whitelist this address on Ostium (if not already done)',
      });
    }

    return res.status(400).json({ error: 'Invalid venue' });
  } catch (error: any) {
    console.error('[GenerateUserAgentAddress] Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
  // Note: Don't disconnect - using singleton
}

