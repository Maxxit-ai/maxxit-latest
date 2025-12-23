import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@maxxit/database";

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
            impact_factor_flag: false, // Only completed signals (not actively monitored)
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

        // Update user's impact factor
        await prisma.telegram_alpha_users.update({
          where: { id: user.id },
          data: { impact_factor: avgImpactFactor },
        });

        usersUpdated++;
        userResults.push({
          id: user.id,
          username: user.telegram_username || user.first_name || "Unknown",
          impact_factor: avgImpactFactor,
          signal_count: user.telegram_posts.length,
        });

        console.log(
          `[UpdateUserImpactFactors] ✅ ${user.telegram_username || user.first_name}: ` +
          `${avgImpactFactor.toFixed(4)} (${user.telegram_posts.length} signals)`
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
