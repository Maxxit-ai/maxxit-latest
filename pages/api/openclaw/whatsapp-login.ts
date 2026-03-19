/**
 * Initiate WhatsApp QR Login
 * Launches `openclaw channels login --channel whatsapp` in the background on the EC2 instance,
 * waits a few seconds for the QR code to be generated, then reads and returns it.
 * The login process continues running on the instance after this call returns.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { runCommandOnInstanceWithOutput } from "../../../lib/openclaw-instance-manager";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet } = req.body;

    if (!userWallet) {
      return res.status(400).json({ error: "Missing required field: userWallet" });
    }

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (!instance) {
      return res.status(404).json({ error: "Instance not found" });
    }

    if (!instance.container_id) {
      return res.status(400).json({ error: "Instance has not been launched yet" });
    }

    if (instance.container_status !== "running") {
      return res.status(400).json({ error: "Instance is not running yet" });
    }

    const QR_CAPTURE_FILE = "/tmp/openclaw_wa_qr.txt";

    // Kill any existing login process and start fresh
    const launchScript = [
      // Kill any previous login attempt
      `pkill -f "openclaw channels login" 2>/dev/null || true`,
      // Clear old QR capture
      `rm -f ${QR_CAPTURE_FILE}`,
      // Start login in background as ubuntu user, capturing output to file
      `su - ubuntu -c "openclaw channels login --channel whatsapp > ${QR_CAPTURE_FILE} 2>&1 &"`,
      // Wait for QR code to appear (the QR renders within a few seconds)
      `sleep 8`,
      // Output the captured content so SSM returns it
      `cat ${QR_CAPTURE_FILE} 2>/dev/null || echo "QR code not yet available"`,
    ];

    const result = await runCommandOnInstanceWithOutput(
      instance.container_id,
      launchScript,
      { timeoutSeconds: 60 }
    );

    const rawOutput = result.stdout.trim();

    if (!rawOutput || rawOutput === "QR code not yet available") {
      return res.status(202).json({
        success: false,
        error: "QR code not yet generated. Please try again in a moment.",
      });
    }

    // Extract only the QR code block from the output.
    // The login command emits doctor warnings and plugin notices before the QR.
    // We split at the "Scan this QR" prompt line and take everything after it.
    const QR_MARKER = "Scan this QR in WhatsApp";
    const markerIndex = rawOutput.indexOf(QR_MARKER);
    const qrCode = markerIndex !== -1
      ? rawOutput.slice(markerIndex).trim()
      : rawOutput;

    return res.status(200).json({
      success: true,
      qrCode,
    });
  } catch (error: any) {
    console.error("[whatsapp-login] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate WhatsApp QR code",
    });
  }
}
