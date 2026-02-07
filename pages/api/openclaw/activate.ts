/**
 * Activate OpenClaw Instance
 * Start the container and activate the instance for use
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import {
  createInstance,
  startInstance,
  getInstanceStatus,
  getInstanceById,
} from "../../../lib/openclaw-instance-manager";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, maxxitApiKey: providedMaxxitApiKey } = req.body;

    if (!userWallet) {
      return res.status(400).json({
        error: "Missing required field: userWallet",
      });
    }

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (!instance) {
      return res.status(404).json({
        error: "Instance not found",
      });
    }

    // Check if Telegram bot is connected (we only need the bot username now)
    if (!instance.telegram_bot_username) {
      return res.status(400).json({
        error: "Telegram bot not connected",
        message: "Connect your Telegram bot before activating",
      });
    }

    if (!instance.telegram_user_id) {
      return res.status(400).json({
        error: "Telegram not verified",
        message: "Send any message to your bot to verify your account before activating",
        requiresVerification: true,
      });
    }

    if (instance.status === "active" && instance.container_id) {
      const instanceStatus = await getInstanceById(instance.container_id);
      return res.status(200).json({
        success: true,
        message: "Instance already active",
        instance: {
          id: instance.id,
          status: instance.status,
          instanceStatus: instanceStatus.status,
          publicIp: instanceStatus.publicIp,
        },
      });
    }

    let instanceId = instance.container_id;
    let instanceStatus = "pending";

    if (!instanceId) {
      // Delete the verification webhook before activating
      // OpenClaw uses polling mode, so we need to remove our webhook
      const { getUserBotToken, getUserMaxxitApiKey } = await import("../../../lib/ssm");
      const botToken = await getUserBotToken(userWallet);
      if (botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
        console.log("[OpenClaw Activate] Deleted verification webhook for polling mode");
      }

      // Use provided API key or fetch from SSM
      const maxxitApiKey = providedMaxxitApiKey || await getUserMaxxitApiKey(userWallet);

      try {
        const result = await createInstance({
          userId: instance.id,
          userWallet: instance.user_wallet,
          model: instance.default_model,
          telegramChatId: instance.telegram_chat_id ?? undefined,
          telegramUserId: instance.telegram_user_id ?? undefined,
          maxxitApiKey: maxxitApiKey ?? undefined,
          llmProxyUrl: process.env.LLM_PROXY_URL,
          openclawApiKey: process.env.OPENCLAW_API_KEY,
          ssmWalletPath: instance.user_wallet.replace(/[^a-zA-Z0-9_.-]/g, "_").toLowerCase(),
        });

        instanceId = result.instanceId;
        instanceStatus = "pending";
      } catch (error) {
        console.error("[OpenClaw Activate] Error creating instance:", error);
        return res.status(500).json({
          error: "Failed to create EC2 instance",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      // EC2 instance exists, check its status
      const status = await getInstanceById(instanceId);

      if (status.status === "stopped") {
        // Start the stopped instance
        try {
          await startInstance(instanceId);
          instanceStatus = "pending"; // Takes time to start
        } catch (error) {
          console.error("[OpenClaw Activate] Error starting instance:", error);
          return res.status(500).json({
            error: "Failed to start EC2 instance",
            details: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (status.status === "running") {
        instanceStatus = "running";
      } else if (status.status === "pending") {
        instanceStatus = "pending";
      } else {
        // Instance is in an error/terminated state, create new one
        try {
          // Use provided API key or fetch from SSM for recreated instance
          const { getUserMaxxitApiKey } = await import("../../../lib/ssm");
          const maxxitApiKey = providedMaxxitApiKey || await getUserMaxxitApiKey(userWallet);

          const result = await createInstance({
            userId: instance.id,
            userWallet: instance.user_wallet,
            model: instance.default_model,
            telegramChatId: instance.telegram_chat_id ?? undefined,
            telegramUserId: instance.telegram_user_id ?? undefined,
            maxxitApiKey: maxxitApiKey ?? undefined,
            llmProxyUrl: process.env.LLM_PROXY_URL,
            openclawApiKey: process.env.OPENCLAW_API_KEY,
            ssmWalletPath: instance.user_wallet.replace(/[^a-zA-Z0-9_.-]/g, "_").toLowerCase(),
          });

          instanceId = result.instanceId;
          instanceStatus = "pending";
        } catch (error) {
          console.error(
            "[OpenClaw Activate] Error recreating instance:",
            error
          );
          return res.status(500).json({
            error: "Failed to recreate EC2 instance",
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const existingInstance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
      select: { budget_reset_at: true },
    });

    const now = new Date();
    const budgetResetAt = existingInstance?.budget_reset_at ?? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

    const updated = await prisma.openclaw_instances.update({
      where: { user_wallet: userWallet },
      data: {
        container_id: instanceId,
        container_status: instanceStatus,
        status: "active",
        last_active_at: now,
        updated_at: now,
        budget_reset_at: budgetResetAt,
      },
    });

    return res.status(200).json({
      success: true,
      instance: {
        id: updated.id,
        userWallet: updated.user_wallet,
        status: updated.status,
        instanceStatus: updated.container_status,
        instanceId: updated.container_id,
        activatedAt: updated.last_active_at,
      },
      message: "EC2 instance is being created and will be ready in 1-2 minutes",
      nextSteps: [
        "Wait for your EC2 instance to finish starting (1-2 minutes)",
        "Open Telegram and start chatting with your OpenClaw assistant",
        `Your assistant is using the ${instance.default_model} model`,
        `You have $${(instance.monthly_llm_budget_cents / 100).toFixed(2)} of LLM budget this month`,
      ],
    });
  } catch (error: any) {
    console.error("[OpenClaw Activate] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to activate instance",
    });
  }
}
