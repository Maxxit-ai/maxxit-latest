/**
 * Get LLM Credit Balance
 * Returns current LLM credit balance and usage information for a user
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
    const { userWallet } = req.query;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({
        error: "Missing or invalid userWallet query parameter",
      });
    }

    const balance = await LLMCreditService.getBalance(userWallet);

    return res.status(200).json({
      success: true,
      ...balance,
    });
  } catch (error: any) {
    console.error("[LLM Credits Balance] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to fetch LLM credit balance",
    });
  }
}
