import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';

/**
 * EigenAI Signature Verification API
 * 
 * Verifies cryptographic signatures from EigenAI API responses
 * 
 * POST /api/eigenai/verify-signature
 * Body: {
 *   llm_signature: string,      // Signature from EigenAI
 *   llm_raw_output: string,     // Full raw output with <|channel|> tags
 *   llm_model_used: string,     // Model ID (e.g., "gpt-oss-120b-f16")
 *   llm_chain_id: number,       // Chain ID (usually 1)
 *   llm_full_prompt: string,    // Full prompt (system + user) sent to LLM
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
      llm_signature,
      llm_raw_output,
      llm_model_used,
      llm_chain_id,
      llm_full_prompt,
      operator_address,
    } = req.body;

    // Validate required fields
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

    if (!llm_full_prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: llm_full_prompt'
      });
    }

    // Use provided operator address or default
    const expectedAddress = operator_address || DEFAULT_EIGENAI_OPERATOR_ADDRESS;

    console.log('[EigenAI] Verifying signature...');
    console.log(`  Chain ID: ${llm_chain_id}`);
    console.log(`  Model: ${llm_model_used}`);
    console.log(`  Expected Address: ${expectedAddress}`);
    console.log(`  Full Prompt length: ${llm_full_prompt.length}`);

    // Construct message using the stored full prompt (no reconstruction needed)
    const message = constructMessage(
      llm_chain_id,
      llm_model_used,
      llm_full_prompt,
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

