import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { z } from 'zod';
import { DeploymentStatusEnum } from '@shared/schema';

const updateDeploymentSchema = z.object({
  status: DeploymentStatusEnum.optional(),
  subActive: z.boolean().optional(),
  enabledVenues: z.array(z.string()).optional(),
  riskTolerance: z.number().min(1).max(100).optional(),
  tradeFrequency: z.number().min(1).max(100).optional(),
  socialSentimentWeight: z.number().min(1).max(100).optional(),
  priceMomentumFocus: z.number().min(1).max(100).optional(),
  marketRankPriority: z.number().min(1).max(100).optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Agent ID is required' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, req, res);
      case 'PATCH':
        return await handlePatch(id, req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error(`[API /agents/${id}/deployments] Error:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(agentId: string, req: NextApiRequest, res: NextApiResponse) {
  const { userWallet } = req.query;
  
  if (!userWallet || typeof userWallet !== 'string') {
    return res.status(400).json({ error: 'User wallet is required' });
  }

  const deployment = await prisma.agent_deployments.findFirst({
    where: {
      agent_id: agentId,
      user_wallet: userWallet.toLowerCase(),
    },
    select: {
      sub_active: true,
      enabled_venues: true,
      risk_tolerance: true,
      trade_frequency: true,
      social_sentiment_weight: true,
      price_momentum_focus: true,
      market_rank_priority: true,
    },
  });

  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // Format the response to match what the frontend expects
  const formattedDeployment = {
    subActive: deployment.sub_active,
    enabledVenues: deployment.enabled_venues || [],
    riskTolerance: deployment.risk_tolerance,
    tradeFrequency: deployment.trade_frequency,
    socialSentimentWeight: deployment.social_sentiment_weight,
    priceMomentumFocus: deployment.price_momentum_focus,
    marketRankPriority: deployment.market_rank_priority,
  };

  return res.status(200).json(formattedDeployment);
}

async function handlePatch(agentId: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userWallet } = req.query;
    
    if (!userWallet || typeof userWallet !== 'string') {
      return res.status(400).json({ error: 'User wallet is required' });
    }

    const validated = updateDeploymentSchema.parse(req.body);

    const existingDeployment = await prisma.agent_deployments.findFirst({
      where: {
        agent_id: agentId,
        user_wallet: userWallet.toLowerCase(),
      },
      select: {
        id: true,
      },
    });

    if (!existingDeployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const updateData: any = {};
    
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.subActive !== undefined) updateData.sub_active = validated.subActive;
    if (validated.enabledVenues !== undefined) updateData.enabled_venues = validated.enabledVenues;
    if (validated.riskTolerance !== undefined) updateData.risk_tolerance = validated.riskTolerance;
    if (validated.tradeFrequency !== undefined) updateData.trade_frequency = validated.tradeFrequency;
    if (validated.socialSentimentWeight !== undefined) updateData.social_sentiment_weight = validated.socialSentimentWeight;
    if (validated.priceMomentumFocus !== undefined) updateData.price_momentum_focus = validated.priceMomentumFocus;
    if (validated.marketRankPriority !== undefined) updateData.market_rank_priority = validated.marketRankPriority;

    // Update the deployment
    const deployment = await prisma.agent_deployments.update({
      where: { id: existingDeployment.id },
      data: updateData,
      select: {
        sub_active: true,
        enabled_venues: true,
        risk_tolerance: true,
        trade_frequency: true,
        social_sentiment_weight: true,
        price_momentum_focus: true,
        market_rank_priority: true,
      },
    });

    const formattedDeployment = {
      subActive: deployment.sub_active,
      enabledVenues: deployment.enabled_venues || [],
      riskTolerance: deployment.risk_tolerance,
      tradeFrequency: deployment.trade_frequency,
      socialSentimentWeight: deployment.social_sentiment_weight,
      priceMomentumFocus: deployment.price_momentum_focus,
      marketRankPriority: deployment.market_rank_priority,
    };

    return res.status(200).json(formattedDeployment);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors,
      });
    }
    throw error;
  }
}
