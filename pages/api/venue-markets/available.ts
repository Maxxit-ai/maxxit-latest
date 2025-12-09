import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
/**
 * GET /api/venue-markets/available
 * Query params: venue (OSTIUM | HYPERLIQUID | GMX | SPOT)
 * Returns: List of available markets for the specified venue
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { venue } = req.query;

    if (!venue || typeof venue !== 'string') {
      return res.status(400).json({ error: 'Venue parameter is required' });
    }

    const venueUpper = venue.toUpperCase();
    if (!['OSTIUM', 'HYPERLIQUID', 'GMX', 'SPOT'].includes(venueUpper)) {
      return res.status(400).json({ error: 'Invalid venue' });
    }

    // Fetch markets from database
    const markets = await prisma.venue_markets.findMany({
      where: {
        venue: venueUpper as any,
        is_active: true,
      },
      orderBy: {
        market_index: 'asc',
      },
    });

    // Format response
    const formattedMarkets: Record<string, any> = {};
    for (const market of markets) {
      formattedMarkets[market.token_symbol] = {
        index: market.market_index,
        name: market.market_name,
        available: market.is_active,
        minPosition: market.min_position ? parseFloat(market.min_position.toString()) : null,
        maxLeverage: market.max_leverage,
        group: market.group,
        currentPrice: market.current_price ? parseFloat(market.current_price.toString()) : null,
      };
    }

    return res.status(200).json({
      success: true,
      venue: venueUpper,
      count: markets.length,
      markets: formattedMarkets,
      lastSynced: markets.length > 0 ? markets[0].last_synced : null,
    });
  } catch (error: any) {
    console.error('[VenueMarkets] Error:', error);
    return res.status(500).json({ error: error.message });
  }
  // Note: Don't disconnect - using singleton
}

