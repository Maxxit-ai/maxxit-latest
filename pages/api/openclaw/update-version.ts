import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import {
  runCommandOnInstanceWithOutput,
  getInstanceById,
} from "../../../lib/openclaw-instance-manager";

type UpdateType = "openclaw" | "skill";

type UpdateResponse =
  | {
    success: true;
    type: UpdateType;
    message: string;
  }
  | {
    success: false;
    type?: UpdateType;
    error: string;
  };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateResponse>
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const { userWallet, type } = req.body as {
      userWallet?: string;
      type?: UpdateType;
    };

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid userWallet",
      });
    }

    if (type !== "openclaw" && type !== "skill") {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be 'openclaw' or 'skill'.",
      });
    }

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (!instance) {
      return res.status(404).json({
        success: false,
        type,
        error: "Instance not found for this wallet",
      });
    }

    if (!instance.container_id) {
      return res.status(400).json({
        success: false,
        type,
        error: "Instance does not have an EC2 container_id yet",
      });
    }

    const status = await getInstanceById(instance.container_id);
    if (status.status !== "running") {
      return res.status(400).json({
        success: false,
        type,
        error: `Instance must be running to perform an update (current status: ${status.status})`,
      });
    }

    const commands: string[] = [];

    if (type === "openclaw") {
      commands.push(
        'echo "[Maxxit] Updating OpenClaw via npm..."',
        'npm update -g openclaw',
        'echo "[Maxxit] Running openclaw doctor..."',
        'su - ubuntu -c "openclaw doctor" || echo "[Maxxit] openclaw doctor reported issues"'
      );
    } else {
      commands.push(
        'echo "[Maxxit] Updating maxxit-lazy-trading skill via ClawHub..."',
        'su - ubuntu -c "npx clawhub@latest install maxxit-lazy-trading --force"'
      );
    }

    commands.push(
      'echo "[Maxxit] Restarting OpenClaw gateway..."',
      'su - ubuntu -c "openclaw gateway restart"',
      'echo "[Maxxit] Update flow complete"'
    );

    const result = await runCommandOnInstanceWithOutput(
      instance.container_id,
      commands,
      {
        timeoutSeconds: 300,
        pollIntervalMs: 3000,
      }
    );

    return res.status(200).json({
      success: true,
      type,
      message:
        result.stdout || "Update command completed. Check logs for details.",
    });
  } catch (error: any) {
    console.error("[OpenClaw Update Version] Error:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to run update command",
    });
  }
}

