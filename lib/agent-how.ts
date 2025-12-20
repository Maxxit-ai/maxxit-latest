/**
 * Agent HOW - Personalized Position Sizing Engine
 * 
 * Takes classified alpha signals (Agent WHAT) and determines:
 * - How much capital to deploy
 * - How aggressive to be
 * - Based on USER preferences + LunarCrush metrics
 * 
 * Two-layer agent system:
 * - Agent WHAT: Aggregates alpha signals with LLM classification
 * - Agent HOW: Decides funding rate based on user's trading personality
 */

import { createLunarCrushScorer } from './lunarcrush-score';
import { prisma } from '../lib/prisma';

export interface UserTradingPreferences {
  risk_tolerance: number;          // 0-100: Conservative → Aggressive
  trade_frequency: number;          // 0-100: Patient → Active  
  social_sentiment_weight: number;  // 0-100: Ignore social → Follow social
  price_momentum_focus: number;     // 0-100: Contrarian → Momentum follower
  market_rank_priority: number;     // 0-100: Any coin → Top coins only
}

export interface AgentHowInput {
  tokenSymbol: string;
  confidence: number;              // From LLM classification (0-1)
  userWallet: string;
  venue: string;
}

export interface AgentHowOutput {
  positionSizePercent: number;     // 0.5% to 10% of balance
  reasoning: string[];              // Explain the decision
  lunarcrushScore: number;         // Aggregated score (0-1)
  userAdjustment: number;          // User preference adjustment (-0.3 to +0.3)
}

/**
 * Get user's trading preferences (with defaults if not set)
 */
export async function getUserTradingPreferences(userWallet: string): Promise<UserTradingPreferences> {
  const prefs = await prisma.user_trading_preferences.findUnique({
    where: { user_wallet: userWallet.toLowerCase() },
  });

  if (!prefs) {
    // Return defaults (neutral 50/50)
    return {
      risk_tolerance: 50,
      trade_frequency: 50,
      social_sentiment_weight: 50,
      price_momentum_focus: 50,
      market_rank_priority: 50,
    };
  }

  return {
    risk_tolerance: prefs.risk_tolerance,
    trade_frequency: prefs.trade_frequency,
    social_sentiment_weight: prefs.social_sentiment_weight,
    price_momentum_focus: prefs.price_momentum_focus,
    market_rank_priority: prefs.market_rank_priority,
  };
}

/**
 * Save or update user's trading preferences
 */
export async function saveUserTradingPreferences(
  userWallet: string,
  preferences: UserTradingPreferences
): Promise<void> {
  await prisma.user_trading_preferences.upsert({
    where: { user_wallet: userWallet.toLowerCase() },
    create: {
      user_wallet: userWallet.toLowerCase(),
      ...preferences,
    },
    update: {
      ...preferences,
    },
  });
}

/**
 * Calculate weighted LunarCrush score based on user preferences
 * 
 * Original LunarCrush metrics (equal weights):
 * - Galaxy Score: 20%
 * - Sentiment: 20%
 * - Social Volume Change: 20%
 * - Price Momentum: 20%
 * - Alt Rank: 20%
 * 
 * User preferences adjust these weights dynamically
 */
function calculateWeightedLunarCrushScore(
  rawMetrics: any,
  userPrefs: UserTradingPreferences
): { score: number; reasoning: string[] } {
  const reasoning: string[] = [];

  // Normalize preferences from 0-100 to weight multipliers (0.5 to 1.5)
  const riskMultiplier = 0.5 + (userPrefs.risk_tolerance / 100);
  const socialWeight = 0.5 + (userPrefs.social_sentiment_weight / 100);
  const momentumWeight = 0.5 + (userPrefs.price_momentum_focus / 100);
  const rankWeight = 0.5 + (userPrefs.market_rank_priority / 100);
  const frequencyMultiplier = 0.5 + (userPrefs.trade_frequency / 100);

  // Extract normalized scores (0-1) from LunarCrush
  const galaxyScore = rawMetrics.galaxyScore || 0.5;
  const sentiment = rawMetrics.sentiment || 0.5;
  const socialVolume = rawMetrics.socialVolumeChange || 0.5;
  const priceMomentum = rawMetrics.priceMomentum || 0.5;
  const altRank = rawMetrics.altRank || 0.5;

  // Calculate base weights (sum = 1.0)
  const totalWeight = 1.0 + socialWeight + momentumWeight + rankWeight;
  
  const weights = {
    galaxy: 0.25 / totalWeight,                          // Base importance
    sentiment: (0.20 * socialWeight) / totalWeight,      // Adjusted by user
    social: (0.20 * socialWeight) / totalWeight,         // Adjusted by user
    momentum: (0.20 * momentumWeight) / totalWeight,     // Adjusted by user
    rank: (0.15 * rankWeight) / totalWeight,             // Adjusted by user
  };

  // Calculate weighted score
  let score = 
    galaxyScore * weights.galaxy +
    sentiment * weights.sentiment +
    socialVolume * weights.social +
    priceMomentum * weights.momentum +
    altRank * weights.rank;

  // Apply risk tolerance (scales final score)
  score = score * riskMultiplier;

  // Apply trade frequency (affects threshold)
  // Higher frequency = more willing to take marginal trades
  if (userPrefs.trade_frequency > 70 && score > 0.4) {
    score += 0.05;
    reasoning.push('Active trader: Boosted marginal signal');
  } else if (userPrefs.trade_frequency < 30 && score < 0.7) {
    score -= 0.05;
    reasoning.push('Patient trader: Reduced marginal signal');
  }

  // Add reasoning
  if (userPrefs.risk_tolerance > 70) {
    reasoning.push(`High risk tolerance: ${Math.round((riskMultiplier - 0.5) * 100)}% position boost`);
  } else if (userPrefs.risk_tolerance < 30) {
    reasoning.push(`Conservative: ${Math.round((0.5 - riskMultiplier) * 100)}% position reduction`);
  }

  if (userPrefs.social_sentiment_weight > 70) {
    reasoning.push(`Strong social focus: Sentiment weight ${Math.round(weights.sentiment * 100)}%`);
  }

  if (userPrefs.price_momentum_focus > 70) {
    reasoning.push(`Momentum follower: Momentum weight ${Math.round(weights.momentum * 100)}%`);
  } else if (userPrefs.price_momentum_focus < 30) {
    reasoning.push(`Contrarian: Reduced momentum weight ${Math.round(weights.momentum * 100)}%`);
  }

  if (userPrefs.market_rank_priority > 70 && altRank < 0.3) {
    score *= 0.7; // Penalize low-ranked coins
    reasoning.push('Top coins only: Penalized low market rank');
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  return { score, reasoning };
}

/**
 * Agent HOW: Calculate personalized position size
 * 
 * Combines:
 * 1. LLM confidence (Agent WHAT output)
 * 2. LunarCrush metrics
 * 3. User trading preferences
 * 
 * Returns position size (0.5% to 10% of balance)
 */
export async function calculatePersonalizedPositionSize(
  input: AgentHowInput
): Promise<AgentHowOutput> {
  const reasoning: string[] = [];

  // Get user preferences
  const userPrefs = await getUserTradingPreferences(input.userWallet);

  // Get LunarCrush metrics
  let lunarcrushScore = 0.5; // Default neutral
  let rawMetrics: any = {};
  
  try {
    const scorer = createLunarCrushScorer();
    if (scorer) {
      const lcResult = await scorer.getTokenScore(input.tokenSymbol, input.confidence);
      lunarcrushScore = lcResult.combinedScore;
      rawMetrics = {
        galaxyScore: lcResult.breakdown.galaxy,
        sentiment: lcResult.breakdown.sentiment,
        socialVolumeChange: lcResult.breakdown.social,
        priceMomentum: lcResult.breakdown.momentum,
        altRank: lcResult.breakdown.rank,
      };
      reasoning.push(`LunarCrush base score: ${(lunarcrushScore * 100).toFixed(0)}%`);
    } else {
      reasoning.push('LunarCrush unavailable: API key not configured');
    }
  } catch (error) {
    console.error('[AgentHow] LunarCrush error:', error);
    reasoning.push('LunarCrush unavailable: Using neutral score');
  }

  // Calculate weighted score with user preferences
  const { score: adjustedScore, reasoning: prefReasons } = calculateWeightedLunarCrushScore(
    rawMetrics,
    userPrefs
  );
  reasoning.push(...prefReasons);

  const userAdjustment = adjustedScore - lunarcrushScore;

  // Combine LLM confidence + adjusted LunarCrush score
  const llmWeight = 0.6; // LLM classification is primary
  const lcWeight = 0.4;  // LunarCrush is secondary

  const finalScore = (input.confidence * llmWeight) + (adjustedScore * lcWeight);
  
  reasoning.push(`LLM confidence: ${(input.confidence * 100).toFixed(0)}%`);
  reasoning.push(`Adjusted score: ${(adjustedScore * 100).toFixed(0)}% (user: ${userAdjustment > 0 ? '+' : ''}${(userAdjustment * 100).toFixed(0)}%)`);
  reasoning.push(`Final score: ${(finalScore * 100).toFixed(0)}%`);

  // Map final score to position size (0.5% to 10%)
  // Score 0.0 → 0.5%
  // Score 0.5 → 5.0% (default)
  // Score 1.0 → 10%
  const minSize = 0.5;
  const maxSize = 10.0;
  let positionSizePercent = minSize + (finalScore * (maxSize - minSize));

  // Apply minimum trade frequency filter
  if (userPrefs.trade_frequency < 30 && finalScore < 0.6) {
    positionSizePercent = 0; // Skip low-confidence trades for patient traders
    reasoning.push('Trade skipped: Patient trader + low confidence');
  }

  reasoning.push(`Position size: ${positionSizePercent.toFixed(2)}% of balance`);

  return {
    positionSizePercent,
    reasoning,
    lunarcrushScore,
    userAdjustment,
  };
}

/**
 * Get position size for deployment (backward compatibility with existing code)
 * 
 * This function integrates with existing trade execution:
 * - Called from trade-executor.ts
 * - Replaces hardcoded 5% default
 * - Returns value in format expected by existing code
 */
export async function getPositionSizeForSignal(params: {
  tokenSymbol: string;
  confidence: number;
  userWallet: string;
  venue: string;
}): Promise<{
  value: number;              // Position size percentage
  reasoning: string;          // Human-readable explanation
}> {
  const result = await calculatePersonalizedPositionSize(params);
  
  return {
    value: result.positionSizePercent,
    reasoning: result.reasoning.join('; '),
  };
}

