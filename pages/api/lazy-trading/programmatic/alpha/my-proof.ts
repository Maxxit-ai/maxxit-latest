import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * GET /api/lazy-trading/programmatic/alpha/my-proof
 *
 * Get the authenticated agent's latest proof status and verified metrics.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const userWallet = apiKeyRecord.user_wallet;
    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: "No wallet associated with this API key",
      });
    }

    const agent = await prismaClient.agents.findFirst({
      where: {
        creator_wallet: userWallet,
        venue: "OSTIUM",
        status: { in: ["PUBLIC", "PRIVATE"] },
      },
      select: {
        id: true,
        commitment: true,
        alpha_default_price: true,
      },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "No active Ostium agent found for this wallet",
      });
    }

    const latestProof = await prismaClient.proof_records.findFirst({
      where: { agent_id: agent.id },
      orderBy: { created_at: "desc" },
    });

    if (!latestProof) {
      return res.status(200).json({
        success: true,
        hasProof: false,
        commitment: agent.commitment,
        message: "No proof records found. Call POST /alpha/generate-proof to start.",
        network: "arbitrum-sepolia",
      });
    }

    const winRate =
      latestProof.trade_count > 0
        ? Math.round(
            (latestProof.win_count / latestProof.trade_count) * 10000
          ) / 100
        : 0;

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      hasProof: true,
      proofId: latestProof.id,
      status: latestProof.status,
      commitment: latestProof.commitment,
      metrics:
        latestProof.status === "VERIFIED"
          ? {
              totalPnl: latestProof.total_pnl?.toString() || "0",
              tradeCount: latestProof.trade_count || 0,
              winCount: latestProof.win_count || 0,
              winRate,
              totalCollateral:
                latestProof.total_collateral?.toString() || "0",
              startBlock: latestProof.start_block?.toString() || null,
              endBlock: latestProof.end_block?.toString() || null,
            }
          : null,
      proofTimestamp: latestProof.proof_timestamp?.toISOString() || null,
      verifiedAt: latestProof.verified_at?.toISOString() || null,
      txHash: latestProof.tx_hash,
      createdAt: latestProof.created_at.toISOString(),
      defaultAlphaPrice: agent.alpha_default_price?.toString() || null,
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/my-proof] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch proof status",
      message: error.message,
    });
  }
}
