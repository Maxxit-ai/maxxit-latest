import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";
import {
  generateProof,
  getProverConfig,
  submitProofToRegistry,
} from "../../../../../lib/zk-prover";
import {
  encodeAvantisOpenTradeId,
  decodeTradeReference,
  encodeTradeReference,
  normalizeAlphaVenue,
} from "../../../../../lib/alpha-trade-reference";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/generate-proof
 *
 * Trigger ZK proof generation for the authenticated agent's performance
 * plus an optional featured open position.
 *
 * Body (optional):
 *   autoProcess: boolean — If true, processes the proof immediately inline
 *                          instead of queuing for the worker. Default: false.
 *   venue: "OSTIUM" | "AVANTIS" — Venue to prove. Default: OSTIUM.
 *   tradeId: string      — Trade identifier to feature in the proof.
 *                          OSTIUM: "<tradeIndex>".
 *                          AVANTIS: "<pairIndex>:<tradeIndex>".
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

    const body = req.body || {};
    const { autoProcess = false } = body;

    let requestedVenue = normalizeAlphaVenue(body.venue);
    let featuredTradeId: string | undefined;

    if (typeof body.tradeId === "string" && body.tradeId.trim()) {
      const rawTradeId = body.tradeId.trim();
      const hasExplicitVenuePrefix = /^(OSTIUM|AVANTIS)\s*:/i.test(rawTradeId);

      if (hasExplicitVenuePrefix) {
        const decoded = decodeTradeReference(rawTradeId);
        if (
          body.venue &&
          normalizeAlphaVenue(body.venue) !== decoded.venue
        ) {
          return res.status(400).json({
            success: false,
            error: "tradeId prefix venue and body.venue mismatch",
          });
        }
        requestedVenue = decoded.venue;
        featuredTradeId = decoded.tradeId || undefined;
      } else {
        featuredTradeId = rawTradeId;
      }
    }

    const queuedTradeRef = encodeTradeReference(requestedVenue, featuredTradeId);

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
        status: { in: ["PUBLIC", "PRIVATE"] },
        agent_deployments: {
          some: {
            status: "ACTIVE",
            enabled_venues: { has: requestedVenue },
          },
        },
      },
      include: {
        agent_deployments: {
          where: {
            status: "ACTIVE",
            enabled_venues: { has: requestedVenue },
          },
          take: 1,
        },
      },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: `No active ${requestedVenue} agent deployment found for this wallet`,
      });
    }

    if (!shouldProcessInline) {
      const pendingWhere: any = {
        agent_id: agent.id,
        status: { in: ["PENDING", "PROVING"] },
      };

      if (requestedVenue === "AVANTIS") {
        pendingWhere.trade_id = { startsWith: "AVANTIS:" };
      } else {
        pendingWhere.OR = [
          { trade_id: { startsWith: "OSTIUM:" } },
          { trade_id: null },
        ];
      }

      const existingProof = await prismaClient.proof_records.findFirst({
        where: pendingWhere,
        orderBy: { created_at: "desc" },
      });

      if (existingProof) {
        const existingTradeRef = decodeTradeReference(existingProof.trade_id);
        return res.status(200).json({
          success: true,
          message: "Proof generation already in progress",
          proofId: existingProof.id,
          status: existingProof.status,
          commitment: existingProof.commitment,
          tradeId: existingTradeRef.tradeId,
          venue: existingTradeRef.venue,
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

    const proofRecord = await prismaClient.proof_records.create({
      data: {
        agent_id: agent.id,
        commitment,
        trade_id: queuedTradeRef,
        status: shouldProcessInline ? "PROVING" : "PENDING",
      },
    });

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    if (shouldProcessInline) {
      console.log(
        `[generate-proof] Auto-processing proof ${proofRecord.id} for ${userWallet} venue=${requestedVenue}${featuredTradeId ? ` tradeId=${featuredTradeId}` : ""}`
      );

      const result = await generateProof(userWallet, featuredTradeId, {
        venue: requestedVenue,
      });

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
          venue: requestedVenue,
        });
      }

      let txHash = result.txHash;
      if (!result.isSimulated && result.proof && result.publicValues) {
        try {
          console.log(
            `[generate-proof] Automatically submitting ZK proof for ${userWallet} on-chain...`
          );
          txHash = await submitProofToRegistry(result.publicValues, result.proof);
        } catch (submitError: any) {
          console.error(
            "[generate-proof] Automated submission failed:",
            submitError.message
          );
        }
      }

      const now = new Date();
      const resolvedFeaturedTradeId =
        result.venue === "AVANTIS"
          ? encodeAvantisOpenTradeId(
            result.featured?.pairIndex,
            result.featured?.tradeId
          ) || featuredTradeId
          : result.featured?.tradeId?.toString() || featuredTradeId;

      const resolvedTradeRef = encodeTradeReference(
        result.venue,
        resolvedFeaturedTradeId
      );

      await prismaClient.proof_records.update({
        where: { id: proofRecord.id },
        data: {
          status: "VERIFIED",
          brevis_request_id: result.proofId,
          total_pnl: result.metrics.totalPnl,
          trade_count: result.metrics.tradeCount,
          win_count: result.metrics.winCount,
          total_collateral: result.metrics.totalCollateral,
          trade_id: resolvedTradeRef,
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
          ?
            Math.round(
              (result.metrics.winCount / result.metrics.tradeCount) * 10000
            ) / 100
          : 0;

      return res.status(200).json({
        success: true,
        message: "Proof generated and verified",
        proofId: proofRecord.id,
        status: "VERIFIED",
        commitment,
        venue: result.venue,
        tradeId: resolvedFeaturedTradeId || null,
        tradeRef: resolvedTradeRef,
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
        txHash,
        verifiedAt: now.toISOString(),
        network: "arbitrum-sepolia",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Proof generation queued",
      proofId: proofRecord.id,
      status: "PENDING",
      commitment,
      venue: requestedVenue,
      tradeId: featuredTradeId || null,
      tradeRef: queuedTradeRef,
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
