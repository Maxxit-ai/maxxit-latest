import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { venue, tokenSymbol, minSize, slippageLimitBps } = req.body;

    if (!venue || !tokenSymbol) {
      return res.status(400).json({ 
        error: 'venue and tokenSymbol are required' 
      });
    }

    console.log(`[AddVenueToken] Adding ${tokenSymbol} to ${venue} venue`);

    // Check if already exists
    const existing = await prisma.venueStatus.findUnique({
      where: {
        venue_tokenSymbol: {
          venue,
          tokenSymbol,
        },
      },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Token already exists in venue',
        venueStatus: existing,
        alreadyExists: true,
      });
    }

    // Create new venue status
    const newVenueStatus = await prisma.venueStatus.create({
      data: {
        venue,
        tokenSymbol,
        minSize: minSize || 1, // Default 1 USDC
        slippageLimitBps: slippageLimitBps || 50, // Default 50 bps (0.5%)
      },
    });

    console.log(`[AddVenueToken] Successfully added ${tokenSymbol} to ${venue}`);

    return res.status(201).json({
      success: true,
      message: 'Token added to venue successfully',
      venueStatus: newVenueStatus,
    });
  } catch (error: any) {
    console.error('[AddVenueToken] Error adding venue token:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to add venue token',
    });
  }
  // Note: Don't disconnect - using singleton
}
