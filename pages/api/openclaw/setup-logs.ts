/**
 * Fetch OpenClaw Setup Logs
 * Reads /var/log/openclaw/userdata.log from the EC2 instance via SSM
 * and returns the last N lines so the UI can show live install progress.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { runCommandOnInstanceWithOutput } from "../../../lib/openclaw-instance-manager";

const MAX_LOG_LINES = 80;

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
      return res.status(400).json({ error: "Missing or invalid userWallet query parameter" });
    }

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
      select: { container_id: true, container_status: true },
    });

    if (!instance) {
      return res.status(404).json({ error: "Instance not found" });
    }

    if (!instance.container_id) {
      return res.status(200).json({ success: true, logs: null, ready: false });
    }

    const result = await runCommandOnInstanceWithOutput(
      instance.container_id,
      [
        `tail -n ${MAX_LOG_LINES} /var/log/openclaw/userdata.log 2>/dev/null || echo "(Log file not yet available)"`,
        // Check for the sentinel file that marks full setup completion
        `[ -f /var/log/openclaw/setup-complete ] && echo "__SETUP_COMPLETE__" || true`,
      ],
      { timeoutSeconds: 30 }
    );

    const rawOutput = result.stdout;
    const setupComplete = rawOutput.includes("__SETUP_COMPLETE__");
    const logs = rawOutput.replace("__SETUP_COMPLETE__", "").trim();

    return res.status(200).json({
      success: true,
      logs,
      ready: setupComplete,
    });
  } catch (error: any) {
    // SSM may not be ready yet early in the launch — return empty rather than an error
    console.warn("[setup-logs] SSM command failed (instance may still be starting):", error.message);
    return res.status(200).json({
      success: true,
      logs: null,
      ready: false,
    });
  }
}
