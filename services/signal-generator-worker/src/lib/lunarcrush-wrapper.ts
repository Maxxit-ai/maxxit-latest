/**
 * LunarCrush Wrapper - Simplified interface for workers
 */

import { createLunarCrushScorer, LunarCrushScorer } from './lunarcrush-score';

let scorer: LunarCrushScorer | null = null;

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

