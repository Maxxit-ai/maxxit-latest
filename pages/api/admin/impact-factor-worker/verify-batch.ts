import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { hashWebhookData, hashEigenAIData } from "../../../../lib/data-hash";
import { getSignalFromContract } from "../../../../lib/impact-factor-contract";

/**
 * POST endpoint: Verify data integrity for multiple signals (batch verification)
 * 
 * Body:
 * {
 *   signalIds: string[]  // Array of signal UUIDs to verify
 * }
 * 
 * Returns:
 * {
 *   results: Array<{
 *     signalId: string,
 *     verified: boolean,
 *     webhookData: { match: boolean, dbHash: string, contractHash: string },
 *     eigenAIData: { match: boolean, exists: boolean, dbHash: string, contractHash: string },
 *     error?: string
 *   }>,
 *   summary: {
 *     total: number,
 *     verified: number,
 *     failed: number,
 *     notFound: number
 *   }
 * }
 * 
 * Example:
 * POST /api/admin/impact-factor-worker/verify-batch
 * Body: { "signalIds": ["uuid1", "uuid2", "uuid3"] }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { signalIds } = req.body;

  if (!signalIds || !Array.isArray(signalIds) || signalIds.length === 0) {
    return res.status(400).json({ error: "signalIds array is required in request body" });
  }

  if (signalIds.length > 100) {
    return res.status(400).json({ error: "Maximum 100 signal IDs allowed per batch" });
  }

  try {
    const results = [];
    let verifiedCount = 0;
    let failedCount = 0;
    let notFoundCount = 0;

    const SCALE_PERCENTAGE = 10000;

    // Process each signal
    for (const signalId of signalIds) {
      try {
        // Fetch signal from database
        const dbSignal = await prisma.telegram_posts.findUnique({
          where: { id: signalId },
        });

        if (!dbSignal) {
          results.push({
            signalId,
            verified: false,
            error: "Signal not found in database",
          });
          notFoundCount++;
          continue;
        }

        // Compute hashes from DB
        const webhookHashFromDB = hashWebhookData({
          alpha_user_id: dbSignal.alpha_user_id,
          source_id: dbSignal.source_id,
          message_id: dbSignal.message_id,
          message_text: dbSignal.message_text,
          message_created_at: dbSignal.message_created_at,
          sender_id: dbSignal.sender_id,
          sender_username: dbSignal.sender_username,
        });

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

        // Get contract data
        try {
          const contractData = await getSignalFromContract(signalId);
          
          const webhookHashFromContract = contractData.webhookDataHash.toLowerCase();
          const eigenAIHashFromContract = contractData.eigenAIDataHash.toLowerCase();
          const eigenAIDataExists = contractData.eigenAIDataHash.toLowerCase() !== "0x0000000000000000000000000000000000000000000000000000000000000000".toLowerCase();

          const webhookMatch = webhookHashFromDB.toLowerCase() === webhookHashFromContract;
          const eigenAIMatch = eigenAIDataExists && eigenAIHashFromDB.toLowerCase() === eigenAIHashFromContract;
          const isVerified = webhookMatch && (!eigenAIDataExists || eigenAIMatch);

          if (isVerified) {
            verifiedCount++;
          } else {
            failedCount++;
          }

          results.push({
            signalId,
            verified: isVerified,
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
            },
          });
        } catch (contractError: any) {
          // Contract data not available
          results.push({
            signalId,
            verified: false,
            error: `Contract error: ${contractError.message || "Signal not found in contract"}`,
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
          });
          failedCount++;
        }
      } catch (error: any) {
        results.push({
          signalId,
          verified: false,
          error: error.message || String(error),
        });
        failedCount++;
      }
    }

    return res.status(200).json({
      results,
      summary: {
        total: signalIds.length,
        verified: verifiedCount,
        failed: failedCount,
        notFound: notFoundCount,
      },
    });
  } catch (error: any) {
    console.error("[VerifyBatchAPI] Error:", error);
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
}
