/**
 * Check User Setup Status
 * 
 * Checks if user has already completed initial setup for a specific agent:
 * - Has agent addresses (Hyperliquid/Ostium)
 * - Has trading preferences stored in agent_deployments table (per-agent, not per-user)
 * - Has active deployments for this agent
 * 
 * Trading preferences are now stored per-deployment in agent_deployments table,
 * not in user_trading_preferences table.
 * 
 * Used by frontend to skip setup steps for subsequent agent deployments
 * 
 * Run: GET /api/user/check-setup-status?userWallet=0x...&agentId=...
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

    const hasHyperliquidAddress = !!(userAddress?.hyperliquid_agent_address);
    const hasOstiumAddress = !!(userAddress?.ostium_agent_address);

    // Check if deployments exist for THIS agent (not just addresses)
    // Having an address doesn't mean user whitelisted it - they need to complete the flow
    let hasHyperliquidDeployment = false;
    let hasOstiumDeployment = false;
    let hasPreferences = false;

    if (agentId && typeof agentId === 'string') {
      // Check if user has deployments for this specific agent
      // Trading preferences are stored per-deployment in agent_deployments table
      const deployments = await prisma.agent_deployments.findMany({
        where: {
          user_wallet: normalizedWallet,
          agent_id: agentId,
          status: 'ACTIVE',
        },
        select: {
          enabled_venues: true,
          // Note: Trading preferences are stored in agent_deployments table
          // but we don't need to fetch them for this check - if deployment exists, preferences exist
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

      // Trading preferences are stored per-deployment in agent_deployments table
      // If a deployment exists for this agent, preferences are part of that deployment
      // (Preferences are no longer in user_trading_preferences - they're per-agent now)
      hasPreferences = deployments.length > 0;
    }

    // User has completed setup if they have addresses AND preferences for this agent
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

