/**
 * Get First Deployment Preferences
 * 
 * Retrieves the trading preferences from the user's FIRST deployment for a given agent.
 * This is used when deploying subsequent agents - we want to pre-populate with values from first deployment.
 * 
 * If no previous deployment exists (first-time user), returns null.
 * 
 * GET /api/user/first-deployment-preferences?userWallet=0x...&agentId=...
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

export interface FirstDeploymentPreferencesResponse {
  success: boolean;
  preferences?: {
    risk_tolerance: number;
    trade_frequency: number;
    social_sentiment_weight: number;
    price_momentum_focus: number;
    market_rank_priority: number;
  };
  isFirstDeployment: boolean;
  message: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FirstDeploymentPreferencesResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      isFirstDeployment: true,
      message: 'Method not allowed',
    });
  }

  try {
    const { userWallet, agentId } = req.query;

    if (!userWallet || typeof userWallet !== 'string') {
      return res.status(400).json({
        success: false,
        isFirstDeployment: true,
        message: 'User wallet required',
      });
    }

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        isFirstDeployment: true,
        message: 'Agent ID required',
      });
    }

    const normalizedWallet = userWallet.toLowerCase();

    // Find the OLDEST deployment for this user (first deployment)
    const firstDeployment = await prisma.agent_deployments.findFirst({
      where: {
        user_wallet: normalizedWallet,
      },
      orderBy: {
        sub_started_at: 'asc', // Get oldest = first deployment
      },
    });

    if (!firstDeployment) {
      // No previous deployment - this is the first deployment
      console.log(
        '[FirstDeploymentPreferences] No previous deployments for wallet:',
        normalizedWallet
      );
      return res.status(200).json({
        success: true,
        isFirstDeployment: true,
        message: 'First deployment for this user - using default preferences',
      });
    }

    // Return preferences from first deployment
    console.log(
      '[FirstDeploymentPreferences] Found first deployment preferences for wallet:',
      normalizedWallet
    );

    return res.status(200).json({
      success: true,
      isFirstDeployment: false,
      preferences: {
        risk_tolerance: (firstDeployment as any).risk_tolerance || 50,
        trade_frequency: (firstDeployment as any).trade_frequency || 50,
        social_sentiment_weight: (firstDeployment as any).social_sentiment_weight || 50,
        price_momentum_focus: (firstDeployment as any).price_momentum_focus || 50,
        market_rank_priority: (firstDeployment as any).market_rank_priority || 50,
      },
      message: 'Using preferences from first deployment',
    });
  } catch (error: any) {
    console.error('[FirstDeploymentPreferences] Error:', error);
    return res.status(500).json({
      success: false,
      isFirstDeployment: true,
      message: error.message || 'Failed to fetch first deployment preferences',
    });
  }
}
