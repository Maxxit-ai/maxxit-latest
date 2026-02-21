import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/generate-proof
 *
 * Trigger ZK proof generation for the authenticated agent's Ostium performance.
 * Idempotent: if a proof is already PENDING or PROVING, returns the existing record.
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
        status: "PENDING",
      },
    });

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Proof generation queued",
      proofId: proofRecord.id,
      status: "PENDING",
      commitment,
      estimatedTime: "60-300s",
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
