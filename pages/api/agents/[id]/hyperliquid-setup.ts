import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
/**
 * API endpoint to handle Hyperliquid setup for an agent
 * 
 * GET: Retrieve user's Hyperliquid address and approval status
 * POST: Save user's Hyperliquid address
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id: agentId } = req.query;

  if (typeof agentId !== 'string') {
    return res.status(400).json({ error: 'Invalid agent ID' });
  }

  try {
    if (req.method === 'GET') {
      // Get the agent to check for saved Hyperliquid address
      const agent = await prisma.agents.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          name: true,
          venue: true,
          creator_wallet: true,
          // We'll use profit_receiver_address to temporarily store the user's Hyperliquid address
          // In production, you'd want a dedicated field in the schema
          profit_receiver_address: true,
        },
      });

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // For now, we'll return the profit_receiver_address as the userHyperliquidAddress
      // This is a temporary solution - ideally, you'd have a separate field
      return res.status(200).json({
        userHyperliquidAddress: agent.profit_receiver_address,
        isApproved: false, // We'll check this via the Python service later
      });
    }

    if (req.method === 'POST') {
      const { userHyperliquidAddress, isApproved } = req.body;

      if (!userHyperliquidAddress) {
        return res.status(400).json({ error: 'Missing userHyperliquidAddress' });
      }

      // Validate Ethereum address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(userHyperliquidAddress)) {
        return res.status(400).json({ error: 'Invalid Ethereum address format' });
      }

      // Update the agent with the user's Hyperliquid address
      // For now, we'll store it in a JSON metadata field or use an existing field
      // In a real implementation, you'd add a dedicated `user_hyperliquid_address` field
      
      const agent = await prisma.agents.findUnique({
        where: { id: agentId },
      });

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Store the Hyperliquid address as a metadata JSON field
      // We'll use a simple approach: store in the database in a way that can be retrieved later
      // For now, let's create or update a record in a separate table or use agent_deployments

      // Let's check if there's a deployment for this agent and user
      const deployment = await prisma.agent_deployments.findFirst({
        where: {
          agent_id: agentId,
          // Assuming user_wallet is the user's wallet from MetaMask
          user_wallet: userHyperliquidAddress,
        },
      });

      if (deployment) {
        // Update the safe_wallet field to store the Hyperliquid address
        // (In a real implementation, add a dedicated field)
        await prisma.agent_deployments.update({
          where: { id: deployment.id },
          data: {
            safe_wallet: userHyperliquidAddress,
            // You could also store approval status if you add a field
          },
        });
      } else {
        // Create a new deployment record for Hyperliquid
        await prisma.agent_deployments.create({
          data: {
            agent_id: agentId,
            user_wallet: userHyperliquidAddress,
            safe_wallet: userHyperliquidAddress, // Store Hyperliquid address
            status: 'ACTIVE',
            sub_active: true,
          },
        });
      }

      return res.status(200).json({ 
        success: true,
        message: 'Hyperliquid address saved',
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Hyperliquid setup error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

