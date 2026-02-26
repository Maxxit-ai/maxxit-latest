import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";
import { generateProof, getProverConfig, submitProofToRegistry } from "../../../../../lib/zk-prover";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/generate-proof
 *
 * Trigger ZK proof generation for the authenticated agent's Ostium performance
 * plus an optional featured open position.
 *
 * Body (optional):
 *   autoProcess: boolean — If true, processes the proof immediately inline
 *                          instead of queuing for the worker. Default: false.
 *   tradeId: string      — The Ostium trade index to feature in the proof.
 *                          If omitted, the most recent open trade is used.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { autoProcess = false, tradeId } = req.body || {};
    const shouldProcessInline = Boolean(autoProcess && process.env.SP1_PROVER_MODE);
    if (autoProcess && !shouldProcessInline) {
      console.log(
        "[generate-proof] autoProcess requested but SP1 not configured -- queuing instead"
      );
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
      include: {
        agent_deployments: {
          where: { status: "ACTIVE" },
          take: 1,
        },
      },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "No active Ostium agent found for this wallet",
      });
    }

    // If inline processing is unavailable, behave as idempotent queueing.
    if (!shouldProcessInline) {
      const existingProof = await prismaClient.proof_records.findFirst({
        where: {
          agent_id: agent.id,
          status: { in: ["PENDING", "PROVING"] },
        },
        orderBy: { created_at: "desc" },
      });

      if (existingProof) {
        return res.status(200).json({
          success: true,
          message: "Proof generation already in progress",
          proofId: existingProof.id,
          status: existingProof.status,
          commitment: existingProof.commitment,
          createdAt: existingProof.created_at.toISOString(),
          network: "arbitrum-sepolia",
        });
      }
    }

    // Generate commitment if agent doesn't have one
    let commitment = agent.commitment;
    if (!commitment) {
      const { createHash, randomBytes } = await import("crypto");
      const salt = randomBytes(32).toString("hex");
      const agentAddressRecord =
        await prismaClient.user_agent_addresses.findUnique({
          where: { user_wallet: userWallet },
        });
      const ostiumAddress =
        agentAddressRecord?.ostium_agent_address || userWallet;

      commitment = createHash("sha256")
        .update(ostiumAddress + salt)
        .digest("hex");

      await prismaClient.agents.update({
        where: { id: agent.id },
        data: {
          commitment,
          salt_encrypted: salt,
        },
      });
    }

    // Create proof record
    const proofRecord = await prismaClient.proof_records.create({
      data: {
        agent_id: agent.id,
        commitment,
        trade_id: tradeId || null,
        status: shouldProcessInline ? "PROVING" : "PENDING",
      },
    });

    // Track API key usage
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    // ---- Auto-process: run proof generation inline ----
    if (shouldProcessInline) {
      console.log(
        `[generate-proof] Auto-processing proof ${proofRecord.id} for ${userWallet}${tradeId ? ` with tradeId=${tradeId}` : ''}`
      );

      const result = await generateProof(userWallet, tradeId);

      if (!result.success) {
        await prismaClient.proof_records.update({
          where: { id: proofRecord.id },
          data: { status: "FAILED" },
        });
        return res.status(500).json({
          success: false,
          error: "Proof generation failed",
          proofId: proofRecord.id,
          message: result.error,
        });
      }

      let txHash = result.txHash;
      if (!result.isSimulated && result.proof && result.publicValues) {
        try {
          console.log(`[generate-proof] Automatically submitting ZK proof for ${userWallet} on-chain...`);
          txHash = await submitProofToRegistry(result.publicValues, result.proof);
        } catch (submitError: any) {
          console.error("[generate-proof] Automated submission failed:", submitError.message);
        }
      }

      const now = new Date();
      await prismaClient.proof_records.update({
        where: { id: proofRecord.id },
        data: {
          status: "VERIFIED",
          brevis_request_id: result.proofId,
          total_pnl: result.metrics.totalPnl,
          trade_count: result.metrics.tradeCount,
          win_count: result.metrics.winCount,
          total_collateral: result.metrics.totalCollateral,
          trade_id: result.featured?.tradeId?.toString() || tradeId || null,
          start_block: result.metrics.startBlock
            ? BigInt(result.metrics.startBlock)
            : null,
          end_block: result.metrics.endBlock
            ? BigInt(result.metrics.endBlock)
            : null,
          proof_timestamp: now,
          verified_at: now,
          tx_hash: txHash,
        },
      });

      const winRate =
        result.metrics.tradeCount > 0
          ? Math.round(
            (result.metrics.winCount / result.metrics.tradeCount) * 10000
          ) / 100
          : 0;

      return res.status(200).json({
        success: true,
        message: "Proof generated and verified",
        proofId: proofRecord.id,
        status: "VERIFIED",
        commitment,
        isSimulated: result.isSimulated,
        proverMode: getProverConfig().mode,
        metrics: {
          totalPnl: result.metrics.totalPnl.toString(),
          tradeCount: result.metrics.tradeCount,
          winCount: result.metrics.winCount,
          winRate,
          totalCollateral: result.metrics.totalCollateral.toString(),
          startBlock: result.metrics.startBlock?.toString() || null,
          endBlock: result.metrics.endBlock?.toString() || null,
        },
        featured: result.featured,
        zkProofId: result.proofId,
        proof: result.proof,
        publicValues: result.publicValues,
        txHash: txHash,
        verifiedAt: now.toISOString(),
        network: "arbitrum-sepolia",
      });
    }

    // ---- Standard flow: queue for worker ----
    return res.status(200).json({
      success: true,
      message: "Proof generation queued",
      proofId: proofRecord.id,
      status: "PENDING",
      commitment,
      tradeId: tradeId || null,
      estimatedTime: "60-300s",
      hint: "Pass { autoProcess: true } to process the proof immediately instead of queuing.",
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/generate-proof] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to queue proof generation",
      message: error.message,
    });
  }
}
