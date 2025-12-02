import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { chain, tokenSymbol, tokenAddress, preferredRouter } = req.body;

    if (!chain || !tokenSymbol || !tokenAddress) {
      return res.status(400).json({ 
        error: 'chain, tokenSymbol, and tokenAddress are required' 
      });
    }

    console.log(`[AddTokenRegistry] Adding ${tokenSymbol} to ${chain} registry`);

    // Check if already exists
    const existing = await prisma.tokenRegistry.findUnique({
      where: {
        chain_tokenSymbol: {
          chain,
          tokenSymbol,
        },
      },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Token already exists in registry',
        tokenRegistry: existing,
        alreadyExists: true,
      });
    }

    // Create new token registry entry
    const newTokenRegistry = await prisma.tokenRegistry.create({
      data: {
        chain,
        tokenSymbol,
        tokenAddress,
        preferredRouter: preferredRouter || null,
      },
    });

    console.log(`[AddTokenRegistry] Successfully added ${tokenSymbol} to ${chain}`);

    return res.status(201).json({
      success: true,
      message: 'Token added to registry successfully',
      tokenRegistry: newTokenRegistry,
    });
  } catch (error: any) {
    console.error('[AddTokenRegistry] Error adding token to registry:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to add token to registry',
    });
  } finally {
    await prisma.$disconnect();
  }
}
