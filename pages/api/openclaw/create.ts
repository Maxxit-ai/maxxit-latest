/**
 * Create OpenClaw Instance
 * Initialize a new OpenClaw instance for a user with selected plan
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import {
  getPlanConfig,
  getDefaultModel,
  canPlanUseModel,
} from "../../../lib/openclaw-config";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, plan } = req.body;

    // Validate required fields
    if (!userWallet || !plan) {
      return res.status(400).json({
        error: "Missing required fields: userWallet, plan",
      });
    }

    // Validate plan
    const planConfig = getPlanConfig(plan);
    if (!planConfig) {
      return res.status(400).json({
        error: `Invalid plan: ${plan}`,
      });
    }

    // Check if instance already exists
    const existing = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        instance: {
          id: existing.id,
          userWallet: existing.user_wallet,
          plan: existing.plan,
          model: existing.default_model,
          status: existing.status,
          budgetCents: existing.monthly_llm_budget_cents,
          spentCents: existing.llm_spent_this_month_cents,
          budgetResetAt: existing.budget_reset_at,
          telegramLinked: !!existing.telegram_user_id,
          telegramUsername: existing.telegram_username,
        },
      });
    }

    // Get default model for the plan
    const defaultModel = getDefaultModel(plan);

    // Verify model is allowed for plan
    if (!canPlanUseModel(plan, defaultModel)) {
      return res.status(500).json({
        error: "Default model not allowed for plan (configuration error)",
      });
    }

    // Create instance
    const instance = await prisma.openclaw_instances.create({
      data: {
        user_wallet: userWallet,
        plan: plan,
        plan_started_at: new Date(),
        default_model: defaultModel,
        monthly_llm_budget_cents: planConfig.llmBudgetCents,
        llm_spent_this_month_cents: 0,
        budget_reset_at: null,
        container_status: "stopped",
        status: "pending_telegram",
      },
    });

    return res.status(201).json({
      success: true,
      instance: {
        id: instance.id,
        userWallet: instance.user_wallet,
        plan: instance.plan,
        model: instance.default_model,
        status: instance.status,
        budgetCents: instance.monthly_llm_budget_cents,
        spentCents: instance.llm_spent_this_month_cents,
        budgetResetAt: instance.budget_reset_at,
      },
      message: "Instance created successfully",
      nextSteps: [
        "Link your Telegram account",
        "Select your preferred AI model",
        "Activate your instance",
      ],
    });
  } catch (error: any) {
    console.error("[OpenClaw Create] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to create instance",
    });
  }
}
