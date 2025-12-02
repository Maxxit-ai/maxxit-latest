import { ethers } from 'ethers';

export interface PositionSizingConfig {
  // Risk management
  maxPositionSizePercent: number; // Max % of balance per trade (e.g., 10)
  minPositionSizePercent: number; // Min % of balance per trade (e.g., 1)
  
  // Confidence scaling
  lowConfidencePercent: number;   // % for low confidence (e.g., 1-2%)
  mediumConfidencePercent: number; // % for medium confidence (e.g., 3-5%)
  highConfidencePercent: number;   // % for high confidence (e.g., 5-10%)
  
  // Safety limits
  minTradeUsd: number; // Minimum trade size in USD (e.g., 10)
  maxTradeUsd: number; // Maximum trade size in USD (e.g., 1000)
  
  // Balance requirements
  reservePercent: number; // % of balance to keep in reserve (e.g., 20)
}

export interface SignalConfidence {
  score: number;        // 0-100 confidence score
  indicators: {         // Individual indicator contributions
    tweet: number;      // 0-100
    rsi: number;
    macd: number;
    volume: number;
    // ... other indicators
  };
}

export interface PositionSizeResult {
  usdcAmount: number;         // Amount to trade in USDC
  percentage: number;         // % of balance used
  confidence: string;         // "LOW" | "MEDIUM" | "HIGH"
  confidenceScore: number;    // 0-100
  availableBalance: number;   // USDC balance available
  reservedBalance: number;    // USDC kept in reserve
  reasoning: string[];        // Explanation of sizing decisions
}

/**
 * Default configuration - conservative approach
 */
export const DEFAULT_CONFIG: PositionSizingConfig = {
  maxPositionSizePercent: 10,
  minPositionSizePercent: 1,
  
  lowConfidencePercent: 2,
  mediumConfidencePercent: 5,
  highConfidencePercent: 8,
  
  minTradeUsd: 0, // No minimum - allows micro trades
  maxTradeUsd: 1000,
  
  reservePercent: 20,
};

/**
 * Aggressive configuration - for high-risk tolerance
 */
export const AGGRESSIVE_CONFIG: PositionSizingConfig = {
  maxPositionSizePercent: 20,
  minPositionSizePercent: 2,
  
  lowConfidencePercent: 5,
  mediumConfidencePercent: 10,
  highConfidencePercent: 15,
  
  minTradeUsd: 0, // No minimum - allows micro trades
  maxTradeUsd: 5000,
  
  reservePercent: 10,
};

/**
 * Calculate confidence level from agent weights and signal data
 */
export function calculateConfidence(
  agentWeights: number[], // 8 weights (tweet, rsi, macd, bb, vol, ma, mom, volat)
  signalData: {
    tweetSentiment?: number;  // 0-100
    technicalScore?: number;  // 0-100
    sourceTweets?: string[];  // Number of confirming tweets
  }
): SignalConfidence {
  const indicators = {
    tweet: signalData.tweetSentiment || 50,
    rsi: signalData.technicalScore || 50,
    macd: signalData.technicalScore || 50,
    volume: signalData.technicalScore || 50,
  };
  
  // Weight the indicators based on agent configuration
  const totalWeight = agentWeights.reduce((sum, w) => sum + w, 0);
  const normalizedWeights = agentWeights.map(w => w / totalWeight);
  
  // Calculate weighted score
  let weightedScore = 0;
  weightedScore += normalizedWeights[0] * indicators.tweet; // Tweet weight
  weightedScore += normalizedWeights[1] * indicators.rsi;   // RSI weight
  weightedScore += normalizedWeights[2] * indicators.macd;  // MACD weight
  weightedScore += normalizedWeights[4] * indicators.volume; // Volume weight
  
  // Boost for multiple confirming tweets
  const tweetBoost = Math.min((signalData.sourceTweets?.length || 1) * 5, 20);
  weightedScore = Math.min(weightedScore + tweetBoost, 100);
  
  return {
    score: weightedScore,
    indicators,
  };
}

/**
 * Calculate position size based on wallet balance and signal confidence
 */
export function calculatePositionSize(
  walletBalanceUsdc: number,
  confidence: SignalConfidence,
  config: PositionSizingConfig = DEFAULT_CONFIG
): PositionSizeResult {
  const reasoning: string[] = [];
  
  // Step 1: Calculate available balance (after reserve)
  const reservedBalance = walletBalanceUsdc * (config.reservePercent / 100);
  const availableBalance = walletBalanceUsdc - reservedBalance;
  
  reasoning.push(`Wallet balance: ${walletBalanceUsdc.toFixed(2)} USDC`);
  reasoning.push(`Reserved (${config.reservePercent}%): ${reservedBalance.toFixed(2)} USDC`);
  reasoning.push(`Available: ${availableBalance.toFixed(2)} USDC`);
  
  // Step 2: Determine confidence tier
  let confidenceTier: 'LOW' | 'MEDIUM' | 'HIGH';
  let targetPercent: number;
  
  if (confidence.score >= 70) {
    confidenceTier = 'HIGH';
    targetPercent = config.highConfidencePercent;
  } else if (confidence.score >= 50) {
    confidenceTier = 'MEDIUM';
    targetPercent = config.mediumConfidencePercent;
  } else {
    confidenceTier = 'LOW';
    targetPercent = config.lowConfidencePercent;
  }
  
  reasoning.push(`Confidence score: ${confidence.score.toFixed(1)}/100 (${confidenceTier})`);
  reasoning.push(`Target position size: ${targetPercent}% of available balance`);
  
  // Step 3: Calculate base position size
  let usdcAmount = availableBalance * (targetPercent / 100);
  reasoning.push(`Base calculation: ${availableBalance.toFixed(2)} * ${targetPercent}% = ${usdcAmount.toFixed(2)} USDC`);
  
  // Step 4: Apply limits
  const originalAmount = usdcAmount;
  
  // Apply max percentage limit
  const maxByPercent = walletBalanceUsdc * (config.maxPositionSizePercent / 100);
  if (usdcAmount > maxByPercent) {
    usdcAmount = maxByPercent;
    reasoning.push(`Capped by max percentage (${config.maxPositionSizePercent}%): ${usdcAmount.toFixed(2)} USDC`);
  }
  
  // Apply absolute limits
  if (usdcAmount > config.maxTradeUsd) {
    usdcAmount = config.maxTradeUsd;
    reasoning.push(`Capped by max trade size: ${config.maxTradeUsd} USDC`);
  }
  
  // Only apply minimum if configured (0 = no minimum)
  if (config.minTradeUsd > 0 && usdcAmount < config.minTradeUsd) {
    if (availableBalance < config.minTradeUsd) {
      reasoning.push(`❌ Insufficient balance for minimum trade (${config.minTradeUsd} USDC)`);
      usdcAmount = 0;
    } else {
      usdcAmount = config.minTradeUsd;
      reasoning.push(`Raised to minimum trade size: ${config.minTradeUsd} USDC`);
    }
  }
  
  // Check if amount is too small to be meaningful (below $0.01)
  if (usdcAmount > 0 && usdcAmount < 0.01) {
    reasoning.push(`⚠️ Trade size very small: ${usdcAmount.toFixed(6)} USDC`);
  }
  
  // Step 5: Round to 2 decimals (cent precision)
  usdcAmount = Math.floor(usdcAmount * 100) / 100;
  
  const actualPercent = (usdcAmount / walletBalanceUsdc) * 100;
  reasoning.push(`Final amount: ${usdcAmount.toFixed(2)} USDC (${actualPercent.toFixed(2)}% of total balance)`);
  
  return {
    usdcAmount,
    percentage: actualPercent,
    confidence: confidenceTier,
    confidenceScore: confidence.score,
    availableBalance,
    reservedBalance,
    reasoning,
  };
}

/**
 * Get recommended configuration based on agent risk profile
 */
export function getConfigForRiskProfile(riskProfile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'): PositionSizingConfig {
  switch (riskProfile) {
    case 'CONSERVATIVE':
      return {
        ...DEFAULT_CONFIG,
        maxPositionSizePercent: 5,
        lowConfidencePercent: 1,
        mediumConfidencePercent: 2,
        highConfidencePercent: 4,
        minTradeUsd: 0,
        reservePercent: 30,
      };
    
    case 'MODERATE':
      return DEFAULT_CONFIG;
    
    case 'AGGRESSIVE':
      return AGGRESSIVE_CONFIG;
    
    default:
      return DEFAULT_CONFIG;
  }
}

