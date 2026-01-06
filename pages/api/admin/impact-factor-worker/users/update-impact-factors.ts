import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../lib/prisma";

/**
 * POST /api/admin/impact-factor-worker/users/update-impact-factors
 * 
 * Updates telegram_alpha_users.impact_factor by averaging all their completed signals
 * Called by the impact factor worker after processing all signals
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("[UpdateUserImpactFactors] Starting user impact factor aggregation...");

    // Fetch all active users with their completed signals
    const usersWithSignals = await prisma.telegram_alpha_users.findMany({
      where: { is_active: true },
      include: {
        telegram_posts: {
          where: {
            impact_factor: { not: null },
            impact_factor_flag: true, // Only completed signals (not actively monitored)
            is_signal_candidate: true, // Only actual signals
          },
          select: {
            impact_factor: true,
          },
        },
      },
    });

    let usersUpdated = 0;
    let errors = 0;
    const userResults: Array<{
      id: string;
      username: string;
      impact_factor: number;
      signal_count: number;
    }> = [];

    for (const user of usersWithSignals) {
      try {
        // Skip users with no completed signals
        if (user.telegram_posts.length === 0) {
          continue;
        }

        // Calculate average impact factor across all their signals
        const totalImpactFactor = user.telegram_posts.reduce(
          (sum, post) => sum + Number(post.impact_factor),
          0
        );
        const avgImpactFactor = totalImpactFactor / user.telegram_posts.length;

        // Transform impact factor from [-1.5, 1.5] to [0, 100] scale
        // Formula: ((value + 1.5) / 3) * 100
        // -1.5 → 0 (worst)
        //  0.0 → 50 (neutral/starting point)
        // +1.5 → 100 (best)
        const scaledImpactFactor = ((avgImpactFactor + 1.5) / 3) * 100;

        // Clamp to [0, 100] range to handle edge cases
        const clampedImpactFactor = Math.max(0, Math.min(100, scaledImpactFactor));

        // Update user's impact factor with scaled value
        await prisma.telegram_alpha_users.update({
          where: { id: user.id },
          data: { impact_factor: clampedImpactFactor },
        });

        usersUpdated++;
        userResults.push({
          id: user.id,
          username: user.telegram_username || user.first_name || "Unknown",
          impact_factor: clampedImpactFactor,
          signal_count: user.telegram_posts.length,
        });

        console.log(
          `[UpdateUserImpactFactors] ✅ ${user.telegram_username || user.first_name}: ` +
          `${clampedImpactFactor.toFixed(2)}/100 (${user.telegram_posts.length} signals, raw avg: ${avgImpactFactor.toFixed(4)})`
        );
      } catch (error: any) {
        errors++;
        console.error(
          `[UpdateUserImpactFactors] ❌ Error updating user ${user.id}:`,
          error.message
        );
      }
    }

    console.log(
      `[UpdateUserImpactFactors] ✅ Updated ${usersUpdated} users (${errors} errors)`
    );

    return res.status(200).json({
      success: true,
      usersUpdated,
      errors,
      users: userResults,
    });
  } catch (error: any) {
    console.error("[UpdateUserImpactFactors] ❌ Fatal error:", error.message);
    return res.status(500).json({
      error: "Failed to update user impact factors",
      details: error.message,
    });
  }
}
