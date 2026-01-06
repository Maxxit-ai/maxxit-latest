import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";

/**
 * GET endpoint: Fetch active signals that need impact factor monitoring
 * Worker calls this to get list of signals to process
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const signals = await prisma.telegram_posts.findMany({
      where: {
        impact_factor_flag: false,
        is_signal_candidate: true,
        token_price: { not: null },
        extracted_tokens: { isEmpty: false },
      },
      select: {
        id: true,
        extracted_tokens: true,
        token_price: true,
        signal_type: true,
        pnl: true,
        message_created_at: true,
        take_profit: true,
        stop_loss: true,
        timeline_window: true,
        max_favorable_excursion: true,
        max_adverse_excursion: true,
      },
      orderBy: {
        message_created_at: "asc",
      },
      take: 100,
    });

    return res.status(200).json({ signals });
  } catch (error: any) {
    console.error("[SignalsAPI] Error fetching signals:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}
