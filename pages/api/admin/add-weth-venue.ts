/**
 * API: Add WETH to venueStatus (Fixed v2)
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[API] Adding WETH to venueStatus...');

    // Check if already exists
    const existing = await prisma.venueStatus.findUnique({
      where: {
        venue_tokenSymbol: {
          venue: 'SPOT',
          tokenSymbol: 'WETH',
        },
      },
    });

    if (existing) {
      console.log('[API] WETH already exists in venueStatus');
      
      return res.status(200).json({
        success: true,
        message: 'WETH already in venueStatus',
        action: 'already_exists',
      });
    }

    // Create new entry (venueStatus just needs venue + tokenSymbol)
    await prisma.venueStatus.create({
      data: {
        venue: 'SPOT',
        tokenSymbol: 'WETH',
      },
    });

    console.log('[API] ✅ WETH added to venueStatus');

    return res.status(200).json({
      success: true,
      message: 'WETH added to venueStatus',
      action: 'created',
    });

  } catch (error: any) {
    console.error('[API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
  // Note: Don't disconnect - using singleton
}

