import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';

/**
 * EigenAI Signature Verification API
 * 
 * Verifies cryptographic signatures from EigenAI API responses
 * 
 * POST /api/eigenai/verify-signature
 * Body: {
 *   tweetText: string,          // Original tweet/message text
 *   llm_signature: string,      // Signature from EigenAI
 *   llm_raw_output: string,     // Full raw output with <|channel|> tags
 *   llm_model_used: string,     // Model ID (e.g., "gpt-oss-120b-f16")
 *   llm_chain_id: number,       // Chain ID (usually 1)
 *   llm_market_context: string, // Market context used in the prompt
 *   operator_address?: string   // Optional: EigenAI operator address (defaults to official)
 * }
 * 
 * Response: {
 *   success: boolean,
 *   isValid: boolean,
 *   recoveredAddress: string,
 *   expectedAddress: string,
 *   message?: string
 * }
 */

// Default EigenAI operator address
const DEFAULT_EIGENAI_OPERATOR_ADDRESS = "0x7053bfb0433a16a2405de785d547b1b32cee0cf3";

// System message (must match llm-classifier)
const SYSTEM_MESSAGE = "You are a crypto trading signal analyst. Output ONLY valid JSON. No explanations, no reasoning text outside JSON, ONLY the JSON object. Start with { and end with }.";

// Build prompt function (must match llm-classifier buildPromptWithMarketData)
function buildPrompt(tweetText: string, marketContext: string): string {
  return `Expert elite crypto risk analyst. PRIMARY GOAL: Protect users from losses while identifying real elite opportunities.

SIGNAL: "${tweetText}"
MARKET: ${marketContext}

DATA MEANING:
• Price/MCap: Size & liquidity (larger = safer exits)
• 24h/7d/30d %: Momentum (consistent = stronger, mixed = uncertain)
• Vol: Liquidity (>50M good, <10M risky, 0 = red flag)
• GalaxyScore: Strength 0-100 (>70 strong, 50-70 moderate, <50 weak)
• AltRank: Performance (1-100 excellent, 100-500 average, >500 weak)
• Volatility: Stability (<0.02 stable, 0.02-0.05 normal, >0.05 risky)

ANALYZE HOLISTICALLY:
1. Signal clarity (specific targets vs vague sentiment)
2. Market momentum alignment with signal direction
3. Risk factors (volatility, volume, contradictions)
4. Opportunity strength (galaxy score, alt rank, liquidity)

KEY SCENARIOS:
• BULLISH signal + positive momentum + vol>50M = STRONG (0.7-1.0)
• BULLISH signal + negative momentum = CONTRADICTION - reduce heavily (0.1-0.3)
• BEARISH signal + negative momentum + vol>50M = STRONG (0.7-1.0)
• BEARISH signal + positive momentum = CONTRADICTION - reduce heavily (0.1-0.3)
• Mixed momentum or low volume = MODERATE risk (0.3-0.6)
• High volatility >0.05 or AltRank >1000 = PENALIZE (reduce 15-30%)
• Zero/null data = CONSERVATIVE (max 0.4)

CONFIDENCE BANDS:
0.8-1.0: Exceptional (clear + aligned + low risk)
0.6-0.8: Strong (good signal + supportive market)
0.4-0.6: Moderate (decent OR mixed signals)
0.2-0.4: Weak (poor signal OR contradicts market)
0.0-0.2: Very High Risk (reject - will lose money)

LOSS PREVENTION RULES:
1. Market data > hype (momentum contradicts = low confidence)
2. Volume critical (low volume = trapped = danger)
3. Volatility kills (high = unpredictable = lower score)
4. Contradictions fatal (bullish tweet + bearish market = 0.1-0.3)
5. Conservative better (miss opportunity > cause loss)

JSON OUTPUT:
{
  "isSignalCandidate": boolean,
  "extractedTokens": ["SYMBOL"],
  "sentiment": "bullish"|"bearish"|"neutral",
  "confidence": 0.XX,
  "reasoning": "Direction: [LONG/SHORT] on TOKEN. Signal clarity: [clear/vague]. Market momentum: [24h/7d/30d analysis]. Alignment: [supports/contradicts signal]. Key risks: [volume/volatility/rank issues]. Strength factors: [galaxy/liquidity/stability]. Confidence X.XX: [why this protects user from losses]."
}

CRITICAL RULES:
• isSignalCandidate MUST be true if extractedTokens contains at least one token (regardless of market contradictions)
• isSignalCandidate is ONLY false if NO token can be extracted from the signal
• confidence score reflects risk/quality (contradictions = lower confidence, but isSignalCandidate still true if token found)
• If token extracted but market contradicts: isSignalCandidate=true, confidence=low (0.1-0.3)
• If token extracted and market aligns: isSignalCandidate=true, confidence=high (0.7-1.0)

CRITICAL: Output ONLY valid JSON. Start with { end with }. NO explanations outside JSON.`;
}

// Extract prompt (concatenate system + user messages)
function extractPrompt(tweetText: string, marketContext: string): string {
  const userMessage = buildPrompt(tweetText, marketContext);
  return SYSTEM_MESSAGE + userMessage;
}

// Construct message for verification
function constructMessage(
  chainId: string | number,
  modelId: string,
  prompt: string,
  output: string
): string {
  const chainIdStr = typeof chainId === 'number' ? String(chainId) : chainId;
  return chainIdStr + modelId + prompt + output;
}

// Verify signature using ethers.js
function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): { isValid: boolean; recoveredAddress: string } {
  try {
    const sigHex = signature.startsWith('0x') ? signature : '0x' + signature;
    const recoveredAddress = ethers.utils.verifyMessage(message, sigHex);
    const isValid = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    
    return {
      isValid,
      recoveredAddress,
    };
  } catch (error) {
    console.error('[EigenAI] Signature verification error:', error);
    throw error;
  }
}

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
      tweetText,
      llm_signature,
      llm_raw_output,
      llm_model_used,
      llm_chain_id,
      llm_market_context,
      operator_address,
    } = req.body;

    // Validate required fields
    if (!tweetText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: tweetText'
      });
    }

    if (!llm_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: llm_signature'
      });
    }

    if (!llm_raw_output) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: llm_raw_output'
      });
    }

    if (!llm_model_used) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: llm_model_used'
      });
    }

    if (llm_chain_id === undefined || llm_chain_id === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: llm_chain_id'
      });
    }

    if (!llm_market_context) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: llm_market_context'
      });
    }

    // Use provided operator address or default
    const expectedAddress = operator_address || DEFAULT_EIGENAI_OPERATOR_ADDRESS;

    console.log('[EigenAI] Verifying signature...');
    console.log(`  Chain ID: ${llm_chain_id}`);
    console.log(`  Model: ${llm_model_used}`);
    console.log(`  Expected Address: ${expectedAddress}`);
    console.log(`  Market Context: ${llm_market_context.substring(0, 100)}...`);

    // Step 1: Extract prompt (reconstruct exact prompt used during classification)
    const prompt = extractPrompt(tweetText, llm_market_context);

    // Step 2: Construct message
    const message = constructMessage(
      llm_chain_id,
      llm_model_used,
      prompt,
      llm_raw_output
    );

    console.log(`  Message length: ${message.length} characters`);

    // Step 3: Verify signature
    const verificationResult = verifySignature(
      message,
      llm_signature,
      expectedAddress
    );

    console.log(`  Recovered Address: ${verificationResult.recoveredAddress}`);
    console.log(`  Is Valid: ${verificationResult.isValid}`);

    // Return result
    return res.status(200).json({
      success: true,
      isValid: verificationResult.isValid,
      recoveredAddress: verificationResult.recoveredAddress,
      expectedAddress: expectedAddress,
      message: verificationResult.isValid 
        ? 'Signature verified successfully' 
        : 'Signature verification failed - address mismatch',
      details: {
        chainId: llm_chain_id,
        model: llm_model_used,
        messageLength: message.length,
      }
    });

  } catch (error) {
    console.error('[EigenAI] Verification error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Signature verification failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

