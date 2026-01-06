/**
 * LunarCrush Wrapper - Simplified interface for workers
 */

import { createLunarCrushScorer, LunarCrushScorer } from './lunarcrush-score';
import { prisma } from '@maxxit/database';

let scorer: LunarCrushScorer | null = null;

// Cache age limit: 24 hours (in milliseconds)
const CACHE_AGE_LIMIT_MS = 24 * 60 * 60 * 1000;

/**
 * Check if LunarCrush can be used
 */
export function canUseLunarCrush(): boolean {
  return !!process.env.LUNARCRUSH_API_KEY;
}

/**
 * Get LunarCrush score for a token
 */
export async function getLunarCrushScore(
  token: string,
  tweetConfidence: number = 0.5
): Promise<{
  success: boolean;
  score: number | null;
  reasoning: string | null;
  breakdown: any | null;
}> {
  try {
    if (!scorer) {
      scorer = createLunarCrushScorer();
    }

    if (!scorer) {
      return {
        success: false,
        score: null,
        reasoning: 'LunarCrush API key not configured',
        breakdown: null,
      };
    }

    const result = await scorer.getTokenScore(token, tweetConfidence);

    return {
      success: true,
      score: result.combinedScore,
      reasoning: result.reasoning,
      breakdown: result.breakdown,
    };
  } catch (error: any) {
    return {
      success: false,
      score: null,
      reasoning: `LunarCrush error: ${error.message}`,
      breakdown: null,
    };
  }
}

/**
 * Get cached LunarCrush data from database (ostium_available_pairs table)
 * Returns cached data if available and less than 24 hours old
 */
async function getCachedLunarCrushData(
  token: string
): Promise<{
  success: boolean;
  data: Record<string, any> | null;
  descriptions: Record<string, string> | null;
  fromCache: boolean;
}> {
  try {
    const upperToken = token.toUpperCase();
    // Find pair by symbol prefix (e.g., "BTC" matches "BTC/USD")
    const cachedData = await prisma.ostium_available_pairs.findFirst({
      where: {
        symbol: {
          startsWith: upperToken,
        },
      },
    });

    if (!cachedData) {
      return {
        success: false,
        data: null,
        descriptions: null,
        fromCache: false,
      };
    }

    // Check if cache is fresh (less than 24 hours old)
    const ageMs = Date.now() - cachedData.updated_at.getTime();
    if (ageMs > CACHE_AGE_LIMIT_MS) {
      console.log(`    ℹ️  Cache expired for ${token} (${(ageMs / 1000 / 60 / 60).toFixed(1)}h old)`);
      return {
        success: false,
        data: null,
        descriptions: null,
        fromCache: false,
      };
    }

    // Reconstruct data structure from database fields
    const data: Record<string, any> = {
      galaxy_score: cachedData.galaxy_score,
      alt_rank: cachedData.alt_rank,
      social_volume_24h: cachedData.social_volume_24h,
      sentiment: cachedData.sentiment,
      percent_change_24h: cachedData.percent_change_24h,
      volatility: cachedData.volatility,
      price: cachedData.price ? Number(cachedData.price) : null,
      volume_24h: cachedData.volume_24h ? Number(cachedData.volume_24h) : null,
      market_cap: cachedData.market_cap ? Number(cachedData.market_cap) : null,
      market_cap_rank: cachedData.market_cap_rank,
      social_dominance: cachedData.social_dominance,
      market_dominance: cachedData.market_dominance,
      interactions_24h: cachedData.interactions_24h,
      galaxy_score_previous: cachedData.galaxy_score_previous,
      alt_rank_previous: cachedData.alt_rank_previous,
    };

    const descriptions: Record<string, string> = {
      galaxy_score: "Overall coin quality score (0-100) combining social, market, and developer activity",
      alt_rank: "Rank among all cryptocurrencies (lower is better)",
      social_volume_24h: "Social media mentions in last 24 hours",
      sentiment: "Market sentiment score (0-100, 50 is neutral)",
      percent_change_24h: "Price change in last 24 hours",
      volatility: "Price volatility score (0-100)",
      price: "Current price in USD",
      volume_24h: "Trading volume in last 24 hours",
      market_cap: "Market capitalization",
      market_cap_rank: "Rank by market cap (lower is better)",
      social_dominance: "Social volume relative to total market",
      market_dominance: "Market cap relative to total market",
      interactions_24h: "Social media interactions in last 24 hours",
      galaxy_score_previous: "Previous galaxy score (for trend analysis)",
      alt_rank_previous: "Previous alt rank (for trend analysis)",
    };

    console.log(`    ✅ Using cached data for ${token} (${(ageMs / 1000 / 60).toFixed(0)}m old)`);

    return {
      success: true,
      data,
      descriptions,
      fromCache: true,
    };
  } catch (error: any) {
    console.error(`    ❌ Error fetching cached data for ${token}:`, error.message);
    return {
      success: false,
      data: null,
      descriptions: null,
      fromCache: false,
    };
  }
}

/**
 * Get raw LunarCrush data for a token without any modifications
 * Returns data exactly as received from the API with descriptions
 * FIRST checks cache, then falls back to API
 */
export async function getLunarCrushRawData(
  token: string
): Promise<{
  success: boolean;
  data: Record<string, any> | null;
  descriptions: Record<string, string> | null;
  error: string | null;
}> {
  try {
    // First, try to get cached data from database
    const cachedResult = await getCachedLunarCrushData(token);
    if (cachedResult.success && cachedResult.data) {
      return {
        success: true,
        data: cachedResult.data,
        descriptions: cachedResult.descriptions,
        error: null,
      };
    }

    // If no cache or cache expired, call API
    if (!scorer) {
      scorer = createLunarCrushScorer();
    }

    if (!scorer) {
      return {
        success: false,
        data: null,
        descriptions: null,
        error: 'LunarCrush API key not configured',
      };
    }

    const result = await scorer.fetchRawMetrics(token);

    return {
      success: true,
      data: result.data,
      descriptions: result.descriptions,
      error: null,
    };
  } catch (error: any) {
    return {
      success: false,
      data: null,
      descriptions: null,
      error: `LunarCrush error: ${error.message}`,
    };
  }
}

