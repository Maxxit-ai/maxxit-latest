/**
 * Update OpenClaw Model
 * Change the default AI model for an OpenClaw instance
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import {
  getModelConfig,
  canPlanUseModel,
} from "../../../lib/openclaw-config";
import {
  updateInstanceConfig,
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
    const { userWallet, model } = req.body;

    // Validate required fields
    if (!userWallet || !model) {
      return res.status(400).json({
        error: "Missing required fields: userWallet, model",
      });
    }

    // Validate model exists
    const modelConfig = getModelConfig(model);
    if (!modelConfig) {
      return res.status(400).json({
        error: `Invalid model: ${model}`,
      });
    }

    // Get instance from database
    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (!instance) {
      return res.status(404).json({
        error: "Instance not found",
      });
    }

    // Check if model is allowed for current plan
    if (!canPlanUseModel(instance.plan, model)) {
      return res.status(400).json({
        error: `Model ${model} not available on ${instance.plan} plan`,
        requiredPlan: modelConfig.minPlan,
        currentPlan: instance.plan,
        message: `Upgrade to ${modelConfig.minPlan} plan to use ${modelConfig.name}`,
      });
    }

    // Update instance in database
    const updated = await prisma.openclaw_instances.update({
      where: { user_wallet: userWallet },
      data: {
        default_model: model,
        updated_at: new Date(),
      },
    });

    // If EC2 instance exists and is running, recreate with new model
    if (instance.container_id) {
      try {
        const instanceStatus = await getInstanceById(instance.container_id);
        if (
          instanceStatus.status === "running" ||
          instanceStatus.status === "stopped"
        ) {
          // Update EC2 instance with new model (requires recreation)
          const result = await updateInstanceConfig(instance.container_id, {
            userId: instance.id,
            userWallet: instance.user_wallet,
            model: model,
            telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
            telegramChatId: instance.telegram_chat_id || undefined,
            llmProxyUrl: process.env.LLM_PROXY_URL,
            openclawApiKey: process.env.OPENCLAW_API_KEY,
          });

          // Update database with new instance ID
          await prisma.openclaw_instances.update({
            where: { user_wallet: userWallet },
            data: {
              container_id: result.instanceId,
              updated_at: new Date(),
            },
          });
        }
      } catch (error) {
        console.error(
          "[OpenClaw Update Model] Error updating instance:",
          error
        );
        // Don't fail the request, instance will use new model on next restart
      }
    }

    return res.status(200).json({
      success: true,
      instance: {
        id: updated.id,
        userWallet: updated.user_wallet,
        model: updated.default_model,
        plan: updated.plan,
      },
      message: "Model updated successfully",
    });
  } catch (error: any) {
    console.error("[OpenClaw Update Model] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to update model",
    });
  }
}
