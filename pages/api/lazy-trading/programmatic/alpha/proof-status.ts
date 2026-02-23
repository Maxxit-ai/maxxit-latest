import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

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

    const proofId = req.query.proofId;
    if (typeof proofId !== "string" || proofId.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required query parameter: proofId",
      });
    }

    const proofRecord = await prismaClient.proof_records.findUnique({
      where: { id: proofId },
      include: {
        agents: {
          select: {
            creator_wallet: true,
          },
        },
      },
    });

    if (!proofRecord) {
      return res.status(404).json({
        success: false,
        error: "Proof record not found",
      });
    }

    if (proofRecord.agents?.creator_wallet !== apiKeyRecord.user_wallet) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized access to proof record",
      });
    }

    const tradeCount = proofRecord.trade_count || 0;
    const winCount = proofRecord.win_count || 0;
    const winRate = tradeCount > 0 ? Math.round((winCount / tradeCount) * 10000) / 100 : 0;

    return res.status(200).json({
      success: true,
      proofId: proofRecord.id,
      status: proofRecord.status,
      commitment: proofRecord.commitment,
      metrics:
        proofRecord.status === "VERIFIED"
          ? {
              totalPnl: proofRecord.total_pnl?.toString() || "0",
              tradeCount,
              winCount,
              winRate,
              totalCollateral: proofRecord.total_collateral?.toString() || "0",
              startBlock: proofRecord.start_block?.toString() || null,
              endBlock: proofRecord.end_block?.toString() || null,
            }
          : null,
      txHash: proofRecord.tx_hash || null,
      createdAt: proofRecord.created_at.toISOString(),
      verifiedAt: proofRecord.verified_at?.toISOString() || null,
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/proof-status] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch proof status",
      message: error.message,
    });
  }
}
