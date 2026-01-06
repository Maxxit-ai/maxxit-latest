import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { ethers } from "ethers";
import { hashWebhookData, hashEigenAIData } from "../../../../lib/data-hash";
import { getSignalFromContract } from "../../../../lib/impact-factor-contract";

/**
 * GET endpoint: Verify data integrity for a signal
 * 
 * Query params:
 * - signalId: string (required) - The UUID of the signal to verify
 * 
 * Returns:
 * {
 *   signalId: string,
 *   verified: boolean,
 *   webhookData: {
 *     match: boolean,
 *     dbHash: string,
 *     contractHash: string
 *   },
 *   eigenAIData: {
 *     match: boolean,
 *     dbHash: string,
 *     contractHash: string,
 *     exists: boolean  // Whether EigenAI data exists in contract
 *   },
 *   impactFactor: {
 *     pnl: number,
 *     maxFavorableExcursion: number,
 *     maxAdverseExcursion: number,
 *     impactFactor: number,
 *     lastUpdated: number  // Unix timestamp
 *   }
 * }
 * 
 * Example:
 * GET /api/admin/impact-factor-worker/verify?signalId=<uuid>
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { signalId } = req.query;

  if (!signalId || typeof signalId !== "string") {
    return res.status(400).json({ error: "signalId query parameter is required" });
  }

  try {
    // Fetch signal from database
    const dbSignal = await prisma.telegram_posts.findUnique({
      where: { id: signalId },
    });

    if (!dbSignal) {
      return res.status(404).json({ error: "Signal not found in database" });
    }

    // Compute webhook data hash from DB
    const webhookHashFromDB = hashWebhookData({
      alpha_user_id: dbSignal.alpha_user_id,
      source_id: dbSignal.source_id,
      message_id: dbSignal.message_id,
      message_text: dbSignal.message_text,
      message_created_at: dbSignal.message_created_at,
      sender_id: dbSignal.sender_id,
      sender_username: dbSignal.sender_username,
    });

    // Compute EigenAI data hash from DB
    const eigenAIHashFromDB = hashEigenAIData({
      is_signal_candidate: dbSignal.is_signal_candidate,
      extracted_tokens: dbSignal.extracted_tokens || [],
      confidence_score: dbSignal.confidence_score,
      signal_type: dbSignal.signal_type,
      token_price: dbSignal.token_price,
      timeline_window: dbSignal.timeline_window,
      take_profit: dbSignal.take_profit || 0,
      stop_loss: dbSignal.stop_loss || 0,
      llm_signature: dbSignal.llm_signature,
      llm_raw_output: dbSignal.llm_raw_output,
      llm_model_used: dbSignal.llm_model_used,
      llm_chain_id: dbSignal.llm_chain_id,
      llm_reasoning: dbSignal.llm_reasoning,
      llm_market_context: dbSignal.llm_market_context,
      llm_full_prompt: dbSignal.llm_full_prompt,
    });

    // Get hashes and impact factor data from contract
    let contractData;
    let contractError: string | null = null;

    try {
      contractData = await getSignalFromContract(signalId);
    } catch (error: any) {
      // Contract might not have this signal yet, or contract call failed
      contractError = error.message || "Failed to fetch from contract";
    }

    // If contract data is available, compare hashes
    if (contractData) {
      const webhookHashFromContract = contractData.webhookDataHash.toLowerCase();
      const eigenAIHashFromContract = contractData.eigenAIDataHash.toLowerCase();
      // Check if EigenAI hash is zero (not yet set)
      const eigenAIDataExists = contractData.eigenAIDataHash.toLowerCase() !== "0x0000000000000000000000000000000000000000000000000000000000000000".toLowerCase();

      const webhookMatch = webhookHashFromDB.toLowerCase() === webhookHashFromContract;
      const eigenAIMatch = eigenAIDataExists && eigenAIHashFromDB.toLowerCase() === eigenAIHashFromContract;

      // Scale impact factor values back from blockchain (1e4 scaling)
      const SCALE_PERCENTAGE = 10000;

      return res.status(200).json({
        signalId,
        verified: webhookMatch && (!eigenAIDataExists || eigenAIMatch),
        webhookData: {
          match: webhookMatch,
          dbHash: webhookHashFromDB,
          contractHash: webhookHashFromContract,
        },
        eigenAIData: {
          match: eigenAIMatch,
          exists: eigenAIDataExists,
          dbHash: eigenAIHashFromDB,
          contractHash: eigenAIHashFromContract,
        },
        impactFactor: {
          pnl: Number(contractData.pnl) / SCALE_PERCENTAGE,
          maxFavorableExcursion: Number(contractData.maxFavorableExcursion) / SCALE_PERCENTAGE,
          maxAdverseExcursion: Number(contractData.maxAdverseExcursion) / SCALE_PERCENTAGE,
          impactFactor: Number(contractData.impactFactor) / SCALE_PERCENTAGE,
          lastUpdated: Number(contractData.lastUpdated),
          impactFactorFlag: contractData.impactFactorFlag,
        },
        dbData: {
          messageId: dbSignal.message_id,
          messageText: dbSignal.message_text.substring(0, 100) + (dbSignal.message_text.length > 100 ? "..." : ""),
          isSignalCandidate: dbSignal.is_signal_candidate,
          signalType: dbSignal.signal_type,
          extractedTokens: dbSignal.extracted_tokens,
        },
      });
    } else {
      // Contract data not available - return DB hashes only
      return res.status(200).json({
        signalId,
        verified: false,
        error: contractError || "Signal not found in contract",
        webhookData: {
          match: false,
          dbHash: webhookHashFromDB,
          contractHash: null,
        },
        eigenAIData: {
          match: false,
          exists: false,
          dbHash: eigenAIHashFromDB,
          contractHash: null,
        },
        impactFactor: null,
        dbData: {
          messageId: dbSignal.message_id,
          messageText: dbSignal.message_text.substring(0, 100) + (dbSignal.message_text.length > 100 ? "..." : ""),
          isSignalCandidate: dbSignal.is_signal_candidate,
          signalType: dbSignal.signal_type,
          extractedTokens: dbSignal.extracted_tokens,
        },
      });
    }
  } catch (error: any) {
    console.error("[VerifyAPI] Error verifying signal:", error);
    return res.status(500).json({
      error: error.message || "Internal server error",
      signalId,
    });
  }
}
