import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * EigenAI Prompt Construction API
 * 
 * Constructs the full LLM prompt when it's missing from the original signal
 * This allows signature verification even when the full prompt wasn't stored
 * 
 * POST /api/eigenai/construct-prompt
 * Body: {
 *   tweetText: string,            // Original message/tweet text
 *   llm_market_context: string,  // Market context from signatureData
 *   tokenSymbol: string,          // Token symbol (e.g., "BTC")
 *   userImpactFactor: number,     // Impact factor (0-100)
 * }
 * 
 * Response: {
 *   success: boolean,
 *   llm_full_prompt: string,      // Constructed full prompt (system + user)
 *   error?: string
 * }
 */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    // Extract request body
    const {
      llm_market_context,
      tokenSymbol,
      userImpactFactor = 50,
      tweetText,
    } = req.body;

    // Validate required fields
    if (!llm_market_context) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: llm_market_context'
      });
    }

    if (!tokenSymbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: tokenSymbol'
      });
    }

    if (!tweetText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: tweetText'
      });
    }

    console.log('[EigenAI] Constructing prompt...');
    console.log(`  Token Symbol: ${tokenSymbol}`);
    console.log(`  User Impact Factor: ${userImpactFactor}`);
    console.log(`  Market Context length: ${llm_market_context.length}`);
    console.log(`  Tweet Text length: ${tweetText.length}`);

    // Hardcoded system message (same as in llm-classifier.ts)
    const SYSTEM_MESSAGE = "You are a crypto trading signal analyst. Output ONLY valid JSON. No explanations, no reasoning text outside JSON, ONLY the JSON object. Start with { and end with }.";

    // Construct the user prompt (same structure as buildPromptForSpecificToken in llm-classifier.ts)
    const userPrompt = `Elite crypto risk analyst. ${tokenSymbol} was PRE-SELECTED as having trading insight.

  MESSAGE: "${tweetText}"
  TARGET TOKEN: ${tokenSymbol}
  ${tokenSymbol} MARKET DATA: ${llm_market_context}
  SENDER IMPACT FACTOR: ${Number(userImpactFactor).toFixed(1)}/100 (Scale: 0=worst, 50=neutral, 100=best)

  TASK:
  Provide trading analysis for ${tokenSymbol}. Since ${tokenSymbol} was PRE-SELECTED, it HAS trading insight.
  **Always set isSignalCandidate=true** and derive direction/confidence from the message context.

  IMPACT FACTOR GUIDANCE:
  - Impact Factor: Historical performance of signal sender (0-100)
  - Neutral=50: NO info - proceed normally without favor/penalty
  - Excellent(>80): Strongly favor, boost confidence significantly (exceptional historical success)
  - High(60-80): Weight historical success, moderately boost confidence
  - Low(20-40): More skeptical, require stronger signal evidence for high confidence
  - Very Poor(<20): Highly skeptical, require extremely strong signal evidence for any confidence

  DATA MEANING:
  - Price/MCap: Size & liquidity (larger=safer exits)
  - 24h/7d/30d%: Momentum (consistent=stronger, mixed=uncertain)
  - Vol: Liquidity (>50M good, <10M risky, 0=red flag)
  - GalaxyScore: Strength 0-100 (>70 strong, 50-70 moderate, <50 weak)
  - AltRank: Performance (1-100 excellent, 100-500 avg, >500 weak)
  - Volatility: Stability (<0.02 stable, 0.02-0.05 normal, >0.05 risky)
  
  DIRECTION DERIVATION:
  - Explicit: "buy","long","enter","target X" → use stated direction
  - Implicit strength: "best performing","strongest","momentum building","accumulation" → BULLISH
  - Implicit weakness: "worst performing","weakest","losing momentum","distribution" → BEARISH
  - Neutral mention: no clear strength/weakness → NEUTRAL (low confidence)

  ANALYSIS FOR ${tokenSymbol}:
  1. Extract trading direction (bullish/bearish) - explicit OR implicit
  2. Check ${tokenSymbol} market alignment with signal direction
  3. Risk penalties: vol<10M, volatility>0.05, rank>1000

  TP/SL EXTRACTION (${tokenSymbol} only):
  ⚠️ CRITICAL: Only extract if SPECIFICALLY for ${tokenSymbol}
  - If msg says "BTC target $100k in 1mo, SOL is strong" → SOL gets NULL (target is for BTC not SOL)
  - Absolute prices (e.g. "target $100","stop at $80"): CONVERT TO % using current price from market data
  - Formula: % = ((target_price - current_price) / current_price) * 100
  - Examples: current=$100, target=$120 → "20%"; current=$100, stop=$85 → "-15%"
  - User provides % (e.g. "TP at 20%","SL at -5%"): use directly
  - TP: "target $X","TP at X%","take profit X" → extract ONLY if for ${tokenSymbol}
  - SL: "stop loss X","SL at X%","cut at X" → extract ONLY if for ${tokenSymbol}
  - Not mentioned FOR ${tokenSymbol}: set null
  
  TIMELINE EXTRACTION (for ${tokenSymbol} only):
  ⚠️  CRITICAL: Only extract if SPECIFICALLY mentioned for ${tokenSymbol}
  • If message says "BTC to $100k in 1 month, SOL is best" → SOL gets NULL (timeline is for BTC, not SOL)
  • If a deadline is implied FOR ${tokenSymbol} (e.g., "SOL by next week", "${tokenSymbol} this week"), return concrete date in DD-MM-YYYY (UTC)
  • If no clear deadline FOR ${tokenSymbol}, set timelineWindow to null
  
  CONFIDENCE BANDS FOR ${tokenSymbol}:
  0.8-1.0: Explicit ${tokenSymbol} signal + aligned market + low risk + clear TP/SL/timeline
  0.6-0.8: Good ${tokenSymbol} signal (explicit direction OR strong implicit) + supportive data
  0.4-0.6: Decent ${tokenSymbol} signal (implicit strength/weakness indicator like "best performing")
  0.2-0.4: Weak ${tokenSymbol} signal OR contradicts market OR very limited context
  0.1-0.2: Minimal ${tokenSymbol} mention but pre-selected (use lowest confidence)
  
  CRITICAL RULES:
  • **isSignalCandidate ALWAYS = true** (token was pre-selected by extraction phase)
  • **extractedTokens ALWAYS = ["${tokenSymbol}"]** (never empty array)
  • Derive direction from explicit OR implicit context
  • Use confidence score to reflect signal quality (explicit = high, implicit = moderate, weak = low)
  • Conservative confidence scores (better to be cautious)
  
  JSON OUTPUT:
  {
    "isSignalCandidate": boolean,
    "extractedTokens": ["${tokenSymbol}"] or [],
    "sentiment": "bullish"|"bearish"|"neutral",
    "confidence": 0.XX,
    "takeProfit": number|string|null,
    "stopLoss": number|string|null,
    "reasoning": "${tokenSymbol} analysis: [explicit or implicit?]. Direction: [LONG/SHORT/NONE]. Signal source: [clear statement/strength indicator/weakness indicator]. Momentum: [24h/7d/30d]. Alignment: [supports/contradicts]. Risks: [vol/volatility/rank]. Confidence X.XX: [why].",
    "timelineWindow": string|null
  }
  
  Output ONLY valid JSON. Start { end }. NO text outside JSON.`;

    // Construct full prompt (system + user)
    const fullPrompt = SYSTEM_MESSAGE + userPrompt;

    console.log(`  Full Prompt length: ${fullPrompt.length} characters`);

    // Return constructed prompt
    return res.status(200).json({
      success: true,
      llm_full_prompt: fullPrompt,
    });

  } catch (error) {
    console.error('[EigenAI] Prompt construction error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Prompt construction failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
