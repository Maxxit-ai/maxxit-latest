import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from '../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet } = req.query;

    if (!userWallet || typeof userWallet !== "string") {
      return res
        .status(400)
        .json({ error: "userWallet query parameter required" });
    }

    // Fetch all deployments for the user
    const deployments = await prisma.agent_deployments.findMany({
      where: {
        user_wallet: userWallet.toLowerCase(),
      },
      include: {
        agents: {
          select: {
            id: true,
            name: true,
            venue: true,
          },
        },
      },
      orderBy: {
        sub_started_at: "desc",
      },
    });

    // Transform the data to match the expected format
    const formattedDeployments = deployments.map((deployment) => ({
      id: deployment.id,
      agentId: deployment.agent_id,
      agent: {
        name: deployment.agents.name,
        venue: deployment.agents.venue,
      },
      userWallet: deployment.user_wallet,
      safeWallet: deployment.safe_wallet || "",
      moduleEnabled: deployment.module_enabled || false,
      status: deployment.status || "active",
      telegramLinked: false, // TODO: Check actual telegram link status
      enabledVenues: deployment.enabled_venues || [],
    }));

    return res.status(200).json(formattedDeployments);
  } catch (error: any) {
    console.error("[Deployments API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to fetch deployments" });
  }
  // Note: Don't disconnect - using singleton
}
