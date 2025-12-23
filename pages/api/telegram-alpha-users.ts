import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../lib/prisma";
/**
 * GET /api/telegram-alpha-users
 * Fetch all telegram alpha users for agent configuration
 * Query params:
 *   - includeAll: boolean (default: false) - Whether to include all users (admin mode)
 *
 * By default, returns only public_source = true users (public alpha sources)
 * This includes lazy traders who have opted to be public sources
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { includeAll } = req.query;
    const shouldIncludeAll = includeAll === "true";

    // Build where clause
    const whereClause: any = {
      is_active: true,
    };

    // By default, only show public sources (users who opted to be visible)
    // This applies regardless of whether they are lazy traders or not
    if (!shouldIncludeAll) {
      whereClause.public_source = true;
    }

    // Get all active telegram alpha users
    const alphaUsers = await prisma.telegram_alpha_users.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            telegram_posts: true,
            agent_telegram_users: true,
          },
        },
      },
      orderBy: [
        { last_message_at: "desc" }, // Most recent first
        { telegram_username: "asc" }, // Then alphabetically
      ],
    });

    console.log(
      `[API] Fetched ${alphaUsers.length} telegram alpha users (includeAll: ${shouldIncludeAll})`
    );

    return res.status(200).json({
      success: true,
      alphaUsers,
    });
  } catch (error: any) {
    console.error("[API] Error fetching telegram alpha users:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch telegram alpha users",
    });
  }
  // Note: Don't disconnect - using singleton
}
