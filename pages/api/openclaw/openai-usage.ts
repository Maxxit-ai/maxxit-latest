/**
 * Get OpenAI Usage for User
 * Fetches usage data from OpenAI Admin API for a user's project
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { getUsage } from "../../../lib/openai-admin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, date } = req.query;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({
        error: "Missing or invalid userWallet query parameter",
      });
    }

    let usageDate: string;
    if (date && typeof date === "string") {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return res.status(400).json({
          error: "Invalid date format. Expected format: YYYY-MM-DD",
        });
      }
      usageDate = date;
    } else {
      usageDate = new Date().toISOString().split("T")[0];
    }

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
      select: { openai_project_id: true },
    });

    if (!instance) {
      return res.status(404).json({
        error: "OpenClaw instance not found",
      });
    }

    if (!instance.openai_project_id) {
      return res.status(404).json({
        error: "OpenAI project not found. Please create an OpenAI API key first.",
      });
    }

    const usageData = await getUsage({
      date: usageDate,
      projectIds: [instance.openai_project_id],
      groupBy: ["model"],
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const modelBreakdown: Record<
      string,
      { input: number; output: number }
    > = {};

    for (const dataPoint of usageData.data) {
      const model = dataPoint.model || "unknown";
      const inputTokens = dataPoint.n_input_tokens || 0;
      const outputTokens = dataPoint.n_output_tokens || 0;

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      if (!modelBreakdown[model]) {
        modelBreakdown[model] = { input: 0, output: 0 };
      }
      modelBreakdown[model].input += inputTokens;
      modelBreakdown[model].output += outputTokens;
    }

    const estimatedCostCents = Math.round(
      totalInputTokens * 0.000015 + totalOutputTokens * 0.00006
    );

    return res.status(200).json({
      success: true,
      date: usageDate,
      tokensInput: totalInputTokens,
      tokensOutput: totalOutputTokens,
      estimatedCostCents,
      modelBreakdown,
    });
  } catch (error: any) {
    console.error("[OpenAI Usage] Error:", error);

    if (error.name === "OpenAIAdminError") {
      return res.status(error.statusCode || 500).json({
        error: error.message || "Failed to fetch usage from OpenAI",
      });
    }

    return res.status(500).json({
      error: error.message || "Failed to fetch OpenAI usage",
    });
  }
}
