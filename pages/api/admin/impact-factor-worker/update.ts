import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";

/**
 * POST endpoint: Update telegram_post with impact factor results
 * Worker calls this after doing all calculations
 * 
 * Body:
 * {
 *   signalId: string,
 *   pnl: number,
 *   maxFavorableExcursion: number,
 *   maxAdverseExcursion: number,
 *   impactFactor?: number,  // Only if trade is closed
 *   impactFactorFlag?: boolean  // Only if trade is closed
 * }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      signalId,
      pnl,
      maxFavorableExcursion,
      maxAdverseExcursion,
      impactFactor,
      impactFactorFlag,
    } = req.body;

    if (!signalId) {
      return res.status(400).json({ error: "signalId required" });
    }

    const updateData: any = {
      pnl,
      max_favorable_excursion: maxFavorableExcursion,
      max_adverse_excursion: maxAdverseExcursion,
    };

    // Only update impact_factor and flag if trade is closed
    if (impactFactor !== undefined) {
      updateData.impact_factor = impactFactor;
    }

    if (impactFactorFlag !== undefined) {
      updateData.impact_factor_flag = impactFactorFlag;
    }

    await prisma.telegram_posts.update({
      where: { id: signalId },
      data: updateData,
    });

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("[UpdateAPI] Error updating signal:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}
