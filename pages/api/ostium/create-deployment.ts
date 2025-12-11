/**
 * Create or update deployment for Ostium agent
 * 
 * Flow:
 * 1. User calls /api/agents/[id]/generate-deployment-address to get/create user's address
 * 2. User delegates the address on Ostium
 * 3. User calls this API to create deployment
 * 
 * Note: Address is stored in user_agent_addresses (one per user)
 *       Deployment just links to user_wallet
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

interface TradingPreferences {
  risk_tolerance: number;
  trade_frequency: number;
  social_sentiment_weight: number;
  price_momentum_focus: number;
  market_rank_priority: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agentId, userWallet, tradingPreferences } = req.body as {
      agentId: string;
      userWallet: string;
      tradingPreferences?: TradingPreferences;
    };

    if (!agentId || !userWallet) {
      return res.status(400).json({
        error: 'Missing required fields: agentId, userWallet',
      });
    }

    console.log('[Ostium Create Deployment] Creating deployment:', {
      agentId,
      userWallet,
      hasPreferences: !!tradingPreferences,
    });

    // Get agent to check venue
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
        ostium_agent_address: true,
      },
    });

    if (!userAddress || !userAddress.ostium_agent_address) {
      return res.status(400).json({ 
        error: 'User agent address not found. Please generate address first.' 
      });
    }

    const normalizedWallet = userWallet.toLowerCase();
    
    // Check if deployment already exists for this agent and user
    const existingDeployment = await prisma.agent_deployments.findFirst({
      where: {
        agent_id: agentId,
        user_wallet: normalizedWallet,
      },
    });

    // If deployment already exists, update with preferences and return
    if (existingDeployment) {
      // Append Ostium to existing venues if not already there
      const currentVenues = existingDeployment.enabled_venues || [];
      const needsVenueUpdate = !currentVenues.includes('OSTIUM');
      
      const updatedDeployment = await prisma.agent_deployments.update({
        where: { id: existingDeployment.id },
        data: {
          status: 'ACTIVE',
          sub_active: true,
          module_enabled: true,
          ...(needsVenueUpdate && { enabled_venues: [...currentVenues, 'OSTIUM'] }),
          // Include trading preferences if provided
          ...(tradingPreferences && {
            risk_tolerance: tradingPreferences.risk_tolerance,
            trade_frequency: tradingPreferences.trade_frequency,
            social_sentiment_weight: tradingPreferences.social_sentiment_weight,
            price_momentum_focus: tradingPreferences.price_momentum_focus,
            market_rank_priority: tradingPreferences.market_rank_priority,
          }),
        },
      });
      
      console.log('[Ostium Create Deployment] Updated existing deployment:', updatedDeployment.id, 
        tradingPreferences ? 'with preferences' : 'without preferences');
      
      return res.status(200).json({
        success: true,
        deployment: {
          id: updatedDeployment.id,
          agentId: updatedDeployment.agent_id,
          userWallet: updatedDeployment.user_wallet,
          agentAddress: userAddress.ostium_agent_address,
          status: updatedDeployment.status,
        },
        message: 'Deployment updated',
      });
    }

    // Create new deployment with race condition handling
    let deployment;
    try {
      console.log('[Ostium Create Deployment] Creating new deployment');
      
      deployment = await prisma.agent_deployments.create({
        data: {
          agent_id: agentId,
          user_wallet: normalizedWallet,
          safe_wallet: normalizedWallet,
          enabled_venues: ['OSTIUM'],
          status: 'ACTIVE',
          sub_active: true,
          module_enabled: true,
          // Include trading preferences if provided
          ...(tradingPreferences && {
            risk_tolerance: tradingPreferences.risk_tolerance,
            trade_frequency: tradingPreferences.trade_frequency,
            social_sentiment_weight: tradingPreferences.social_sentiment_weight,
            price_momentum_focus: tradingPreferences.price_momentum_focus,
            market_rank_priority: tradingPreferences.market_rank_priority,
          }),
        },
      });
      
      if (tradingPreferences) {
        console.log('[Ostium Create Deployment] Created with trading preferences');
      }
    } catch (error: any) {
      // Handle race condition - another request may have created it
      if (error.code === 'P2002') {
        console.log('[Ostium Create Deployment] Race condition detected, fetching existing deployment');
        const racedDeployment = await prisma.agent_deployments.findFirst({
          where: {
            agent_id: agentId,
            user_wallet: normalizedWallet,
          },
        });
        
        if (racedDeployment) {
          return res.status(200).json({
            success: true,
            deployment: {
              id: racedDeployment.id,
              agentId: racedDeployment.agent_id,
              userWallet: racedDeployment.user_wallet,
              agentAddress: userAddress.ostium_agent_address,
              status: racedDeployment.status,
            },
            message: 'Deployment created (concurrent)',
          });
        }
      }
      throw error;
    }

    console.log('[Ostium Create Deployment] ✅ Deployment created/updated:', deployment.id);
    console.log('[Ostium Create Deployment] Using user agent address:', userAddress.ostium_agent_address);

    return res.status(200).json({
      success: true,
      deployment: {
        id: deployment.id,
        agentId: deployment.agent_id,
        userWallet: deployment.user_wallet,
        agentAddress: userAddress.ostium_agent_address, // From user_agent_addresses
        status: deployment.status,
      },
      message: existingDeployment ? 'Deployment updated' : 'Deployment created',
    });
  } catch (error: any) {
    console.error('[Ostium Create Deployment API] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create deployment',
    });
  }
  // Note: Don't disconnect - using singleton
}

