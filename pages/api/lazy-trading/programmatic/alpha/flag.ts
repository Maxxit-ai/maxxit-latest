import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/flag
 *
 * Flag a position as alpha and list it for sale.
 * Requires a VERIFIED proof to exist for the agent.
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

    const { positionId, priceUsdc, leverage: leverageOverride } =
      req.body || {};

    if (!positionId || priceUsdc === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: positionId, priceUsdc",
      });
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
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "No active Ostium agent found for this wallet",
      });
    }

    if (!agent.commitment) {
      return res.status(400).json({
        success: false,
        error:
          "Agent has no commitment. Call POST /alpha/generate-proof first.",
      });
    }

    const verifiedProof = await prismaClient.proof_records.findFirst({
      where: {
        agent_id: agent.id,
        status: "VERIFIED",
      },
      orderBy: { verified_at: "desc" },
    });

    if (!verifiedProof) {
      return res.status(400).json({
        success: false,
        error:
          "No verified proof found. Generate and wait for proof verification first.",
      });
    }

    const position = await prismaClient.positions.findUnique({
      where: { id: positionId },
      include: {
        signals: {
          select: { llm_leverage: true },
        },
        agent_deployments: {
          select: { user_wallet: true },
        },
      },
    });

    if (!position) {
      return res.status(404).json({
        success: false,
        error: "Position not found",
      });
    }

    if (position.agent_deployments.user_wallet !== userWallet) {
      return res.status(403).json({
        success: false,
        error: "This position does not belong to your agent",
      });
    }

    if (position.status !== "OPEN") {
      return res.status(400).json({
        success: false,
        error: "Can only flag OPEN positions as alpha",
      });
    }

    const leverage =
      leverageOverride || position.signals?.llm_leverage || 10;

    const allPositions = await prismaClient.positions.findMany({
      where: {
        deployment_id: position.deployment_id,
        status: "OPEN",
      },
      select: {
        qty: true,
        signals: { select: { llm_leverage: true } },
      },
    });

    const totalPortfolioNotional = allPositions.reduce(
      (sum: number, p: any) => {
        const posLeverage = p.signals?.llm_leverage || 10;
        return sum + Number(p.qty) * posLeverage;
      },
      0
    );

    const thisPositionNotional = Number(position.qty) * leverage;
    const positionPct =
      totalPortfolioNotional > 0
        ? Math.round((thisPositionNotional / totalPortfolioNotional) * 10000)
        : 10000;

    const alphaContent = {
      token: position.token_symbol,
      side: position.side,
      leverage,
      positionPct,
      entryPrice: Number(position.entry_price),
      collateralUsdc: Number(position.qty),
      venue: "OSTIUM",
      timestamp: new Date().toISOString(),
    };

    const contentHash = createHash("sha256")
      .update(JSON.stringify(alphaContent))
      .digest("hex");

    const listing = await prismaClient.alpha_listings.create({
      data: {
        agent_id: agent.id,
        position_id: positionId,
        commitment: agent.commitment,
        token: position.token_symbol,
        side: position.side,
        leverage,
        position_pct: positionPct,
        price_usdc: priceUsdc,
        content_hash: contentHash,
        alpha_content: alphaContent,
        active: true,
      },
    });

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Position flagged as alpha",
      listingId: listing.id,
      commitment: agent.commitment,
      priceUsdc: priceUsdc.toString(),
      contentHash,
      conviction: {
        positionPct,
        positionPctDisplay: `${(positionPct / 100).toFixed(1)}%`,
        leverage,
      },
      network: "arbitrum-sepolia",
    });
  } catch (error: any) {
    console.error("[API /alpha/flag] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to flag position as alpha",
      message: error.message,
    });
  }
}
