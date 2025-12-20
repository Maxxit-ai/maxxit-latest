import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const venueStatus = await prisma.venueStatus.findMany({
      orderBy: [
        { venue: 'asc' },
        { tokenSymbol: 'asc' }
      ]
    });

    return res.status(200).json({
      success: true,
      venueStatus,
      count: venueStatus.length
    });
  } catch (error: any) {
    console.error('[CheckVenueStatus] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check venue status',
    });
  }
  // Note: Don't disconnect - using singleton
}
