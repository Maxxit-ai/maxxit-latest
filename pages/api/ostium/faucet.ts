import type { NextApiRequest, NextApiResponse } from 'next';
import { requestOstiumFaucet } from '../../../lib/adapters/ostium-adapter';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Check if Ostium service is configured
    if (!process.env.OSTIUM_SERVICE_URL) {
      return res.status(503).json({
        error: 'Ostium service not configured. Please set OSTIUM_SERVICE_URL environment variable.',
      });
    }

    const result = await requestOstiumFaucet(address);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[Ostium Faucet API] Error:', error);
    
    // If service is unavailable, return helpful error
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch failed')) {
      return res.status(503).json({
        error: 'Ostium service unavailable. Please try again later or contact support.',
      });
    }
    
    return res.status(500).json({
      error: error.message || 'Faucet request failed',
    });
  }
}

