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

// System message (hardcoded, same as in llm-classifier)
const SYSTEM_MESSAGE = "You are a crypto trading signal analyst. Always respond with valid JSON only.";

// Build prompt function (same as in llm-classifier)
function buildPrompt(tweetText: string): string {
  return `You are an expert crypto trading signal analyst. Analyze the following tweet and determine if it contains a trading signal.

Tweet: "${tweetText}"

Analyze this tweet and respond with a JSON object containing:
{
  "isSignalCandidate": boolean,
  "extractedTokens": string[], // Array of token symbols (e.g., ["BTC", "ETH"])
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": number, // 0.0 to 1.0
  "reasoning": string // Brief explanation
}

Rules:
1. Only mark as signal candidate if the tweet explicitly suggests a trading action or price prediction
2. Extract ALL mentioned crypto token symbols (without $ prefix)
3. Sentiment should be:
   - "bullish" if suggesting price increase, buying, or positive outlook
   - "bearish" if suggesting price decrease, selling, or negative outlook
   - "neutral" if just sharing information without directional bias
4. Confidence should reflect how clear and actionable the signal is
5. Common tokens to recognize: BTC, ETH, SOL, AVAX, ARB, OP, MATIC, LINK, UNI, AAVE, etc.

Examples:
- "$BTC breaking out! Target $50k" → isSignalCandidate=true, tokens=["BTC"], sentiment=bullish, confidence=0.8
- "Just bought some $ETH at $2000" → isSignalCandidate=true, tokens=["ETH"], sentiment=bullish, confidence=0.7
- "$SOL looking weak, might dump" → isSignalCandidate=true, tokens=["SOL"], sentiment=bearish, confidence=0.6
- "GM everyone! Great day in crypto" → isSignalCandidate=false, tokens=[], sentiment=neutral, confidence=0.0

Respond ONLY with the JSON object, no other text.`;
}

// Extract prompt (concatenate system + user messages)
function extractPrompt(tweetText: string): string {
  const userMessage = buildPrompt(tweetText);
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

    // Use provided operator address or default
    const expectedAddress = operator_address || DEFAULT_EIGENAI_OPERATOR_ADDRESS;

    console.log('[EigenAI] Verifying signature...');
    console.log(`  Chain ID: ${llm_chain_id}`);
    console.log(`  Model: ${llm_model_used}`);
    console.log(`  Expected Address: ${expectedAddress}`);

    // Step 1: Extract prompt
    const prompt = extractPrompt(tweetText);

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

