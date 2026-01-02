import type { NextApiRequest, NextApiResponse } from 'next';
import { getOstiumBalance } from '../../../lib/adapters/ostium-adapter';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const normalizedAddress = address.toLowerCase();

    // Check if Ostium service is configured
    if (!process.env.OSTIUM_SERVICE_URL) {
      console.warn('[Ostium Balance API] OSTIUM_SERVICE_URL not configured, returning default balance');
      return res.status(200).json({
        address: normalizedAddress,
        usdcBalance: '0',
        ethBalance: '0',
        serviceAvailable: false,
      });
    }

    const balance = await getOstiumBalance(normalizedAddress);

    return res.status(200).json({
      ...balance,
      serviceAvailable: true,
    });
  } catch (error: any) {
    console.error('[Ostium Balance API] Error:', error);

    // If service is unavailable, return default balance instead of error
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch failed')) {
      console.warn('[Ostium Balance API] Service unavailable, returning default balance');
      return res.status(200).json({
        address: req.body.address,
        usdcBalance: '0',
        ethBalance: '0',
        serviceAvailable: false,
      });
    }

    return res.status(500).json({
      error: error.message || 'Failed to get balance',
    });
  }
}

