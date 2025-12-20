import type { NextApiRequest, NextApiResponse } from 'next';
import { getOstiumPositions } from '../../../lib/adapters/ostium-adapter';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const positions = await getOstiumPositions(address);

    return res.status(200).json({
      success: true,
      positions,
    });
  } catch (error: any) {
    console.error('[Ostium Positions API] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to get positions',
    });
  }
}

