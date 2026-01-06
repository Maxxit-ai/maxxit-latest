import type { NextApiRequest, NextApiResponse } from "next";
import { getOrCreateOstiumAgentAddress } from "../../../lib/deployment-agent-address";

/**
 * Generate or retrieve Ostium agent address for a user
 * POST /api/ostium/generate-agent
 * Body: { userWallet: string }
 *
 * Uses the user_agent_addresses table to store addresses per user wallet.
 * If the user already has an Ostium agent address, returns the existing one.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet } = req.body;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({ error: "userWallet is required" });
    }

    // Get or create Ostium agent address for this user
    // This uses the encrypted storage in user_agent_addresses table
    const result = await getOrCreateOstiumAgentAddress({
      userWallet: userWallet.toLowerCase(),
    });

    console.log(
      "[Ostium Generate Agent] Agent address for",
      userWallet,
      ":",
      result.address
    );

    return res.status(200).json({
      success: true,
      agentAddress: result.address,
    });
  } catch (error: any) {
    console.error("[Ostium Generate Agent API] Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate agent wallet",
    });
  }
}
