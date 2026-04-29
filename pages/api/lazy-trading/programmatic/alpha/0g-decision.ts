import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../lib/lazy-trading-api";
import { queryZgCompute } from "../../../../../lib/zg-compute";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/0g-decision
 *
 * Sends the user's portfolio + live market data + their research summary
 * to 0G Compute (decentralized LLM) and returns a structured trade decision.
 *
 * Body:
 *   deploymentId:          string  — UUID of the user's active agent deployment
 *   tokenSymbol:           string  — e.g. "BTC", "ETH"
 *   marketResearchSummary: string  — 2-3 sentence research brief from /research endpoint
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

    const { deploymentId, tokenSymbol, marketResearchSummary } = req.body || {};

    if (!deploymentId || !tokenSymbol || !marketResearchSummary) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: deploymentId, tokenSymbol, marketResearchSummary",
      });
    }

    const userWallet = apiKeyRecord.user_wallet;
    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: "No wallet associated with this API key",
      });
    }

    const deployment = await prismaClient.agent_deployments.findFirst({
      where: {
        id: deploymentId,
        user_wallet: userWallet,
      },
      select: { id: true },
    });

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: "Deployment not found for this account",
      });
    }

    // ── 2. Fetch portfolio context ─────────────────────────────────────
    const [openPositions, pnlHistory] = await Promise.all([
      prismaClient.positions.findMany({
        where: {
          deployment_id: deployment.id,
          status: "OPEN",
        },
        select: {
          token_symbol: true,
          side: true,
          qty: true,
          entry_price: true,
          venue: true,
          opened_at: true,
        },
        orderBy: { opened_at: "desc" },
        take: 20,
      }),
      prismaClient.pnl_snapshots.findMany({
        where: { deployment_id: deployment.id },
        orderBy: { day: "desc" },
        take: 7,
        select: { day: true, pnl: true, return_pct: true },
      }),
    ]);

    // ── 4. Build prompt ────────────────────────────────────────────────
    const portfolioSummary =
      openPositions.length === 0
        ? "No open positions."
        : openPositions
            .map(
              (p: any) =>
                `${p.side.toUpperCase()} ${p.token_symbol} @ ${p.entry_price} (${p.venue})`
            )
            .join(", ");

    const pnlSummary =
      pnlHistory.length === 0
        ? "No P&L history."
        : pnlHistory
            .map((s: any) => {
              const d = new Date(s.day).toISOString().split("T")[0];
              return `${d}: ${s.pnl ? `$${Number(s.pnl).toFixed(2)}` : "n/a"} (${
                s.return_pct != null ? `${s.return_pct.toFixed(2)}%` : "n/a"
              })`;
            })
            .join("; ");

    const systemPrompt = `You are a professional crypto trading advisor. Analyze the provided portfolio, market data, and research to make a trading decision.

Respond ONLY with a JSON object in this exact format:
{
  "shouldTrade": true or false,
  "side": "long" or "short",
  "confidence": integer 0-100,
  "reasoning": "one to two sentence explanation"
}

If shouldTrade is false, set side to "none".`;

    const userPrompt = `Token: ${tokenSymbol.toUpperCase()}

Current open positions: ${portfolioSummary}

Recent 7-day P&L: ${pnlSummary}

Market and research summary: ${marketResearchSummary}

Should I trade ${tokenSymbol.toUpperCase()} now?`;

    // ── 5. Query 0G Compute ────────────────────────────────────────────
    const { content, model: modelUsed } = await queryZgCompute([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    // ── 6. Parse JSON response ─────────────────────────────────────────
    let decision: {
      shouldTrade: boolean;
      side: string;
      confidence: number;
      reasoning: string;
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      decision = JSON.parse(jsonMatch[0]);
    } catch {
      return res.status(502).json({
        success: false,
        error: "0G Compute returned an unparseable response",
      });
    }

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      shouldTrade: decision.shouldTrade,
      side: decision.side,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      token: tokenSymbol.toUpperCase(),
      modelUsed,
    });
  } catch (error: any) {
    console.error("[API /alpha/0g-decision] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "0G decision failed",
      message: error.message,
    });
  }
}
