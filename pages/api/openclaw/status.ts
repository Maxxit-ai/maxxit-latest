/**
 * Get OpenClaw Instance Status
 * Retrieve current status and details of a user's OpenClaw instance
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { getInstanceStatus } from "../../../lib/openclaw-instance-manager";

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
      return res.status(400).json({
        error: "Missing or invalid userWallet query parameter",
      });
    }

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
      include: {
        usage: {
          orderBy: { date: "desc" },
          take: 30, // Last 30 days
        },
      },
    });

    if (!instance) {
      return res.status(404).json({
        error: "Instance not found",
      });
    }

    let instanceStatus = null;
    if (instance.container_id) {
      try {
        instanceStatus = await getInstanceStatus(userWallet);
      } catch (error) {
        console.error("[OpenClaw Status] Error getting instance status:", error);
        instanceStatus = { status: "error", error: "Failed to get status" };
      }
    }

    return res.status(200).json({
      success: true,
      instance: {
        id: instance.id,
        userWallet: instance.user_wallet,
        plan: instance.plan,
        model: instance.default_model,
        status: instance.status,
        containerStatus: instance.container_status,
        telegram: {
          linked: !!instance.telegram_user_id,
          userId: instance.telegram_user_id,
          username: instance.telegram_username,
          botUsername: instance.telegram_bot_username,
          chatId: instance.telegram_chat_id,
          linkedAt: instance.telegram_linked_at,
        },
        openai: {
          projectId: instance.openai_project_id,
          serviceAccountId: instance.openai_service_account_id,
          keyCreatedAt: instance.openai_api_key_created_at,
        },
        budget: {
          monthlyCents: instance.monthly_llm_budget_cents,
          spentCents: instance.llm_spent_this_month_cents,
          remainingCents:
            instance.monthly_llm_budget_cents -
            instance.llm_spent_this_month_cents,
          resetAt: instance.budget_reset_at,
        },
        instance: instanceStatus
          ? {
            id: instance.container_id,
            status: instanceStatus.status,
            publicIp: instanceStatus.publicIp,
            privateIp: instanceStatus.privateIp,
            launchTime: instanceStatus.launchTime,
          }
          : null,
        usage: instance.usage.map((u) => ({
          date: u.date,
          tokensInput: u.tokens_input,
          tokensOutput: u.tokens_output,
          costCents: u.cost_cents,
          messagesSent: u.messages_sent,
          toolCalls: u.tool_calls,
        })),
        lastActiveAt: instance.last_active_at,
        createdAt: instance.created_at,
      },
    });
  } catch (error: any) {
    console.error("[OpenClaw Status] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to get instance status",
    });
  }
}
