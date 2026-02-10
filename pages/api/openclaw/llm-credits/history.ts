/**
 * Get LLM Credit History
 * Returns transaction history for a user's LLM credits
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { LLMCreditService } from "../../../../lib/llm-credit-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, limit } = req.query;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({
        error: "Missing or invalid userWallet query parameter",
      });
    }

    let historyLimit = 50;
    if (limit && typeof limit === "string") {
      const parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
        return res.status(400).json({
          error: "Invalid limit parameter. Must be between 1 and 500",
        });
      }
      historyLimit = parsedLimit;
    }

    const history = await LLMCreditService.getHistory(
      userWallet,
      historyLimit
    );

    return res.status(200).json({
      success: true,
      entries: history,
    });
  } catch (error: any) {
    console.error("[LLM Credits History] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to fetch LLM credit history",
    });
  }
}
