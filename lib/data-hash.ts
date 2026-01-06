/**
 * Data hashing utilities for verifying data integrity
 * Used to create hashes of signal data that are stored in the smart contract
 */

import { keccak256, toUtf8Bytes } from "ethers/lib/utils";

/**
 * Hash webhook signal data (initial signal creation)
 * This should match exactly what's stored in DB from webhook
 */
export function hashWebhookData(data: {
  alpha_user_id: string | null;
  source_id: string | null;
  message_id: string;
  message_text: string;
  message_created_at: Date | string;
  sender_id: string | null;
  sender_username: string | null;
}): string {
  // Convert Date to ISO string if it's a Date object
  const messageCreatedAt = data.message_created_at instanceof Date
    ? data.message_created_at.toISOString()
    : data.message_created_at;
  
  // Create a deterministic JSON-like string representation
  // Order matters for hash consistency - must match DB field order
  // Handle null/undefined consistently - use null for JSON.stringify
  const dataString = JSON.stringify({
    alpha_user_id: data.alpha_user_id ?? null,
    source_id: data.source_id ?? null,
    message_id: data.message_id,
    message_text: data.message_text,
    message_created_at: messageCreatedAt,
    sender_id: data.sender_id ?? null,
    sender_username: data.sender_username ?? null,
  });
  
  return keccak256(toUtf8Bytes(dataString));
}

/**
 * Hash EigenAI classification data
 * This should match exactly what's stored in DB after EigenAI classification
 */
export function hashEigenAIData(data: {
  is_signal_candidate: boolean | null;
  extracted_tokens: string[];
  confidence_score: number | null;
  signal_type: string | null;
  token_price: number | null;
  timeline_window: string | null;
  take_profit: number;
  stop_loss: number;
  llm_signature: string | null;
  llm_raw_output: string | null;
  llm_model_used: string | null;
  llm_chain_id: number | null;
  llm_reasoning: string | null;
  llm_market_context: string | null;
  llm_full_prompt: string | null;
}): string {
  // Sort extracted_tokens array for consistency (create copy to avoid mutation)
  const sortedTokens = [...data.extracted_tokens].sort();
  
  // Create a deterministic JSON-like string representation
  // Order matters for hash consistency - must match DB field order
  // Handle null/undefined consistently - use null for JSON.stringify
  const dataString = JSON.stringify({
    is_signal_candidate: data.is_signal_candidate ?? null,
    extracted_tokens: sortedTokens,
    confidence_score: data.confidence_score ?? null,
    signal_type: data.signal_type ?? null,
    token_price: data.token_price ?? null,
    timeline_window: data.timeline_window ?? null,
    take_profit: data.take_profit ?? 0,
    stop_loss: data.stop_loss ?? 0,
    llm_signature: data.llm_signature ?? null,
    llm_raw_output: data.llm_raw_output ?? null,
    llm_model_used: data.llm_model_used ?? null,
    llm_chain_id: data.llm_chain_id ?? null,
    llm_reasoning: data.llm_reasoning ?? null,
    llm_market_context: data.llm_market_context ?? null,
    llm_full_prompt: data.llm_full_prompt ?? null,
  });
  
  return keccak256(toUtf8Bytes(dataString));
}

/**
 * Verify webhook data against stored hash
 */
export function verifyWebhookData(
  data: Parameters<typeof hashWebhookData>[0],
  storedHash: string
): boolean {
  const calculatedHash = hashWebhookData(data);
  return calculatedHash.toLowerCase() === storedHash.toLowerCase();
}

/**
 * Verify EigenAI data against stored hash
 */
export function verifyEigenAIData(
  data: Parameters<typeof hashEigenAIData>[0],
  storedHash: string
): boolean {
  const calculatedHash = hashEigenAIData(data);
  return calculatedHash.toLowerCase() === storedHash.toLowerCase();
}
