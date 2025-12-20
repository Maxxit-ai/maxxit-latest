import type { NextApiRequest, NextApiResponse } from 'next';
import { syncAllMarkets } from '../../../scripts/sync-all-markets';
import { syncOstiumMarkets } from '../../../scripts/sync-ostium-markets';
import { syncHyperliquidMarkets } from '../../../scripts/sync-hyperliquid-markets';

/**
 * POST /api/admin/sync-venue-markets
 * Body: { venue?: "OSTIUM" | "HYPERLIQUID" | "ALL" }
 * Admin endpoint to sync market data from exchanges to database
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { venue = 'ALL' } = req.body;

    console.log(`[Admin] Syncing venue markets: ${venue}`);

    let result: any;

    switch (venue.toUpperCase()) {
      case 'OSTIUM':
        result = await syncOstiumMarkets();
        break;

      case 'HYPERLIQUID':
        result = await syncHyperliquidMarkets();
        break;

      case 'ALL':
      default:
        result = await syncAllMarkets();
        break;
    }

    return res.status(200).json({
      success: true,
      venue,
      result,
      message: `Markets synced successfully for ${venue}`,
    });
  } catch (error: any) {
    console.error('[Admin] Sync error:', error);
    return res.status(500).json({ error: error.message });
  }
}

