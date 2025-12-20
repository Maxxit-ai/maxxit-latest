/**
 * Vprime Venue Router
 * Agent Where: Intelligent venue routing for multi-venue deployments
 */


import { prisma } from '../lib/prisma';

export interface VenueRouterInput {
  tokenSymbol: string;
  enabledVenues: string[]; // ['HYPERLIQUID', 'OSTIUM']
  signalId?: string;
}

export interface VenueRouterResult {
  selectedVenue: string | null;
  routingReason: string;
  checkedVenues: string[];
  venueAvailability: Record<string, boolean>;
  routingDurationMs: number;
}

/**
 * Route signal to best available venue
 * Priority: Ostium → Hyperliquid → GMX → SPOT
 */
export async function routeToVenue(input: VenueRouterInput): Promise<VenueRouterResult> {
  const startTime = Date.now();
  const { tokenSymbol, enabledVenues, signalId } = input;

  console.log(`[VenueRouter] Routing ${tokenSymbol} across venues: ${enabledVenues.join(', ')}`);

  const checkedVenues: string[] = [];
  const venueAvailability: Record<string, boolean> = {};

  // Priority: Check OSTIUM first, then HYPERLIQUID
  // Reorder enabledVenues to prioritize OSTIUM
  const prioritizedVenues = [...enabledVenues].sort((a, b) => {
    if (a === 'OSTIUM') return -1;
    if (b === 'OSTIUM') return 1;
    if (a === 'HYPERLIQUID') return -1;
    if (b === 'HYPERLIQUID') return 1;
    return 0;
  });

  // Try venues in priority order (OSTIUM first)
  for (const venue of prioritizedVenues) {
    checkedVenues.push(venue);

    if (venue === 'OSTIUM') {
      const available = await checkOstiumMarket(tokenSymbol);
      venueAvailability['OSTIUM'] = available;
      
      if (available) {
        const duration = Date.now() - startTime;
        const result: VenueRouterResult = {
          selectedVenue: 'OSTIUM',
          routingReason: `Ostium: ${tokenSymbol} available (41 synthetic pairs) - Priority venue`,
          checkedVenues,
          venueAvailability,
          routingDurationMs: duration,
        };

        // Log routing decision
        if (signalId) {
          await logRoutingDecision(signalId, result);
        }

        return result;
      }
    }

    if (venue === 'HYPERLIQUID') {
      const available = await checkHyperliquidMarket(tokenSymbol);
      venueAvailability['HYPERLIQUID'] = available;
      
      if (available) {
        const duration = Date.now() - startTime;
        const result: VenueRouterResult = {
          selectedVenue: 'HYPERLIQUID',
          routingReason: `Hyperliquid: ${tokenSymbol}-USD available (220 pairs, low fees) - Fallback (not on Ostium)`,
          checkedVenues,
          venueAvailability,
          routingDurationMs: duration,
        };

        // Log routing decision
        if (signalId) {
          await logRoutingDecision(signalId, result);
        }

        return result;
      }
    }

    if (venue === 'GMX') {
      const available = await checkGMXMarket(tokenSymbol);
      venueAvailability['GMX'] = available;
      
      if (available) {
        const duration = Date.now() - startTime;
        const result: VenueRouterResult = {
          selectedVenue: 'GMX',
          routingReason: `GMX: ${tokenSymbol} perpetual available`,
          checkedVenues,
          venueAvailability,
          routingDurationMs: duration,
        };

        // Log routing decision
        if (signalId) {
          await logRoutingDecision(signalId, result);
        }

        return result;
      }
    }

    if (venue === 'SPOT') {
      const available = await checkSpotMarket(tokenSymbol);
      venueAvailability['SPOT'] = available;
      
      if (available) {
        const duration = Date.now() - startTime;
        const result: VenueRouterResult = {
          selectedVenue: 'SPOT',
          routingReason: `Spot: ${tokenSymbol} available on Uniswap/DEX`,
          checkedVenues,
          venueAvailability,
          routingDurationMs: duration,
        };

        // Log routing decision
        if (signalId) {
          await logRoutingDecision(signalId, result);
        }

        return result;
      }
    }
  }

  // No venue available
  const duration = Date.now() - startTime;
  const result: VenueRouterResult = {
    selectedVenue: null,
    routingReason: `${tokenSymbol} not available on any enabled venue: ${enabledVenues.join(', ')}`,
    checkedVenues,
    venueAvailability,
    routingDurationMs: duration,
  };

  // Log failed routing
  if (signalId) {
    await logRoutingDecision(signalId, result);
  }

  return result;
}

/**
 * Check if token is available on Hyperliquid
 */
async function checkHyperliquidMarket(tokenSymbol: string): Promise<boolean> {
  try {
    const HYPERLIQUID_SERVICE_URL = process.env.HYPERLIQUID_SERVICE_URL || 'https://hyperliquid-service.onrender.com';
    
    // Check database first (cached markets)
    const cachedMarket = await prisma.venue_markets.findFirst({
      where: {
        venue: 'HYPERLIQUID',
        symbol: tokenSymbol,
        is_active: true,
      },
    });

    if (cachedMarket) {
      console.log(`  ✅ Hyperliquid: ${tokenSymbol} available (cached)`);
      return true;
    }

    // Fallback: Call Hyperliquid service directly
    const response = await fetch(`${HYPERLIQUID_SERVICE_URL}/api/markets`);
    const markets = await response.json();
    
    const available = markets.some((m: any) => m.name === tokenSymbol || m.name === `${tokenSymbol}-USD`);
    
    if (available) {
      console.log(`  ✅ Hyperliquid: ${tokenSymbol} available`);
    } else {
      console.log(`  ❌ Hyperliquid: ${tokenSymbol} not available`);
    }
    
    return available;
  } catch (error) {
    console.error(`  ⚠️  Hyperliquid check failed for ${tokenSymbol}:`, error);
    return false;
  }
}

/**
 * Check if token is available on Ostium
 */
async function checkOstiumMarket(tokenSymbol: string): Promise<boolean> {
  try {
    const OSTIUM_SERVICE_URL = process.env.OSTIUM_SERVICE_URL || 'https://maxxit-1.onrender.com';
    
    // Check database first (cached markets)
    const cachedMarket = await prisma.venue_markets.findFirst({
      where: {
        venue: 'OSTIUM',
        symbol: tokenSymbol,
        is_active: true,
      },
    });

    if (cachedMarket) {
      console.log(`  ✅ Ostium: ${tokenSymbol} available (cached)`);
      return true;
    }

    // Fallback: Call Ostium service directly
    const response = await fetch(`${OSTIUM_SERVICE_URL}/api/markets`);
    const markets = await response.json();
    
    const available = markets.some((m: any) => m.symbol === tokenSymbol || m.name === tokenSymbol);
    
    if (available) {
      console.log(`  ✅ Ostium: ${tokenSymbol} available`);
    } else {
      console.log(`  ❌ Ostium: ${tokenSymbol} not available`);
    }
    
    return available;
  } catch (error) {
    console.error(`  ⚠️  Ostium check failed for ${tokenSymbol}:`, error);
    return false;
  }
}

/**
 * Check if token is available on GMX
 */
async function checkGMXMarket(tokenSymbol: string): Promise<boolean> {
  try {
    // Check database first
    const cachedMarket = await prisma.venue_markets.findFirst({
      where: {
        venue: 'GMX',
        symbol: tokenSymbol,
        is_active: true,
      },
    });

    if (cachedMarket) {
      console.log(`  ✅ GMX: ${tokenSymbol} available (cached)`);
      return true;
    }

    console.log(`  ❌ GMX: ${tokenSymbol} not available`);
    return false;
  } catch (error) {
    console.error(`  ⚠️  GMX check failed for ${tokenSymbol}:`, error);
    return false;
  }
}

/**
 * Check if token is available on SPOT (Uniswap/DEX)
 */
async function checkSpotMarket(tokenSymbol: string): Promise<boolean> {
  try {
    // Check database first
    const cachedMarket = await prisma.venue_markets.findFirst({
      where: {
        venue: 'SPOT',
        symbol: tokenSymbol,
        is_active: true,
      },
    });

    if (cachedMarket) {
      console.log(`  ✅ SPOT: ${tokenSymbol} available (cached)`);
      return true;
    }

    console.log(`  ❌ SPOT: ${tokenSymbol} not available`);
    return false;
  } catch (error) {
    console.error(`  ⚠️  SPOT check failed for ${tokenSymbol}:`, error);
    return false;
  }
}

/**
 * Log routing decision to database
 */
async function logRoutingDecision(signalId: string, result: VenueRouterResult): Promise<void> {
  try {
    // Store in agent_routing_history table
    await prisma.$executeRaw`
      INSERT INTO agent_routing_history (
        signal_id,
        requested_venues,
        selected_venue,
        routing_reason,
        checked_venues,
        venue_availability,
        routing_duration_ms
      ) VALUES (
        ${signalId}::uuid,
        ${result.checkedVenues}::text[],
        ${result.selectedVenue}::venue_t,
        ${result.routingReason},
        ${result.checkedVenues}::text[],
        ${JSON.stringify(result.venueAvailability)}::jsonb,
        ${result.routingDurationMs}
      );
    `;

    // Also store in signals.routing_history JSONB field
    await prisma.signals.update({
      where: { id: signalId },
      data: {
        routing_history: result as any,
      },
    });

    console.log(`  📝 Routing decision logged for signal ${signalId.substring(0, 8)}...`);
  } catch (error) {
    console.error('  ⚠️  Failed to log routing decision:', error);
    // Don't throw - routing logging is non-critical
  }
}

/**
 * Get routing stats for an agent
 */
export async function getAgentRoutingStats(agentId: string) {
  try {
    const stats = await prisma.$queryRaw<Array<{ venue: string; count: bigint }>>`
      SELECT 
        arh.selected_venue as venue,
        COUNT(*) as count
      FROM agent_routing_history arh
      JOIN signals s ON s.id = arh.signal_id
      WHERE s.agent_id = ${agentId}::uuid
      AND arh.selected_venue IS NOT NULL
      GROUP BY arh.selected_venue
      ORDER BY count DESC;
    `;

    return stats.map(s => ({
      venue: s.venue,
      count: Number(s.count),
    }));
  } catch (error) {
    console.error('Failed to get routing stats:', error);
    return [];
  }
}

