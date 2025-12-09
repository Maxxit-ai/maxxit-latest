/**
 * Check User Setup Status
 * 
 * Checks if user has already completed initial setup:
 * - Has agent addresses (Hyperliquid/Ostium)
 * - Has trading preferences
 * 
 * Used by frontend to skip setup steps for subsequent agent deployments
 * 
 * Run: GET /api/user/check-setup-status?userWallet=0x...
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userWallet, agentId } = req.query;

    if (!userWallet || typeof userWallet !== 'string') {
      return res.status(400).json({ error: 'User wallet required' });
    }

    const normalizedWallet = userWallet.toLowerCase();

    // Check for agent addresses
    const userAddress = await prisma.user_agent_addresses.findUnique({
      where: { user_wallet: normalizedWallet },
      select: {
        hyperliquid_agent_address: true,
        ostium_agent_address: true,
        last_used_at: true,
      },
    });

    // Check for trading preferences
    const preferences = await prisma.user_trading_preferences.findUnique({
      where: { user_wallet: normalizedWallet },
      select: {
        id: true,
        risk_tolerance: true,
        trade_frequency: true,
      },
    });

    const hasHyperliquidAddress = !!(userAddress?.hyperliquid_agent_address);
    const hasOstiumAddress = !!(userAddress?.ostium_agent_address);
    const hasPreferences = !!preferences;

    // CRITICAL FIX: Check if deployments exist for THIS agent (not just addresses)
    // Having an address doesn't mean user whitelisted it - they need to complete the flow
    let hasHyperliquidDeployment = false;
    let hasOstiumDeployment = false;

    if (agentId && typeof agentId === 'string') {
      // Check if user has deployments for this specific agent
      const deployments = await prisma.agent_deployments.findMany({
        where: {
          user_wallet: normalizedWallet,
          agent_id: agentId,
          status: 'ACTIVE',
        },
        select: {
          enabled_venues: true,
        },
      });

      // Check if any deployment has Hyperliquid enabled
      hasHyperliquidDeployment = deployments.some(d => 
        d.enabled_venues.includes('HYPERLIQUID')
      );

      // Check if any deployment has Ostium enabled
      hasOstiumDeployment = deployments.some(d => 
        d.enabled_venues.includes('OSTIUM')
      );
    }

    // User has completed setup if they have addresses AND preferences
    // But for venue-specific checks, use deployment status (actual whitelisting)
    const setupComplete = hasHyperliquidAddress && hasOstiumAddress && hasPreferences;

    return res.status(200).json({
      success: true,
      setupComplete,
      hasHyperliquidAddress,
      hasOstiumAddress,
      hasHyperliquidDeployment, // NEW: Actual deployment status
      hasOstiumDeployment, // NEW: Actual deployment status
      hasPreferences,
      addresses: {
        hyperliquid: userAddress?.hyperliquid_agent_address || null,
        ostium: userAddress?.ostium_agent_address || null,
      },
      message: setupComplete
        ? 'User has completed setup'
        : 'User needs to complete initial setup',
    });
  } catch (error: any) {
    console.error('[CheckSetupStatus] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to check setup status',
    });
  }
  // Note: Don't disconnect - using singleton
}

