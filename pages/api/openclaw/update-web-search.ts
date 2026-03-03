/**
 * Update OpenClaw Web Search Provider
 * Change the web search provider for an OpenClaw instance.
 * Uses SSM Run Command to reconfigure running instances live
 * (no instance recreation needed).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import {
  getWebSearchReconfigCommands,
  runCommandOnInstance,
  getInstanceById,
} from "../../../lib/openclaw-instance-manager";

const VALID_PROVIDERS = ["brave", "perplexity", "openrouter"];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, webSearchProvider } = req.body;

    if (!userWallet) {
      return res.status(400).json({
        error: "Missing required field: userWallet",
      });
    }

    const normalizedProvider =
      webSearchProvider && VALID_PROVIDERS.includes(webSearchProvider)
        ? webSearchProvider
        : null;

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (!instance) {
      return res.status(404).json({ error: "Instance not found" });
    }

    if ((instance as any).web_search_provider === normalizedProvider) {
      return res.status(200).json({
        success: true,
        changed: false,
        webSearchProvider: normalizedProvider,
        message: "Web search provider already set to this value",
      });
    }

    // Update DB first
    await (prisma.openclaw_instances.update as any)({
      where: { user_wallet: userWallet },
      data: {
        web_search_provider: normalizedProvider,
        updated_at: new Date(),
      },
    });

    // If instance is running, reconfigure live via SSM (no recreation needed)
    let liveUpdated = false;
    if (instance.container_id && instance.status === "active") {
      try {
        const instanceStatus = await getInstanceById(instance.container_id);
        if (instanceStatus.status === "running") {
          const commands = getWebSearchReconfigCommands(normalizedProvider);
          await runCommandOnInstance(instance.container_id, commands);
          liveUpdated = true;
        }
      } catch (error) {
        console.error(
          "[OpenClaw Update Web Search] SSM reconfiguration failed, will apply on next restart:",
          error
        );
        // Non-fatal: config is saved in DB and will be applied on next instance launch
      }
    }

    return res.status(200).json({
      success: true,
      changed: true,
      webSearchProvider: normalizedProvider,
      liveUpdated,
      message: liveUpdated
        ? `Web search provider updated to ${normalizedProvider ?? "disabled"}. Applied live to running instance.`
        : `Web search provider updated to ${normalizedProvider ?? "disabled"}. Change will take effect on next instance activation.`,
    });
  } catch (error: any) {
    console.error("[OpenClaw Update Web Search] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to update web search provider",
    });
  }
}
