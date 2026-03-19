/**
 * Check WhatsApp Link Status
 * Reads the QR capture file on the EC2 instance to detect the "Linked!" confirmation
 * that openclaw channels login emits after a successful scan.
 * Once linked: restarts the openclaw gateway and sends a welcome message to the user.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { runCommandOnInstanceWithOutput } from "../../../lib/openclaw-instance-manager";

const QR_CAPTURE_FILE = "/tmp/openclaw_wa_qr.txt";

const WELCOME_MESSAGE = `🎉 Your OpenClaw is Ready!

Hello! I'm your personal AI assistant, powered by OpenClaw on Maxxit.

I'm ready to help you with:

• Answering questions
• Managing tasks
• Analyzing information
• And much more!

Just send me a message and let's get started. 🚀`;

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
    });

    if (!instance) {
      return res.status(404).json({ error: "Instance not found" });
    }

    // Already confirmed linked — skip all SSM calls
    if ((instance as any).whatsapp_linked_at) {
      return res.status(200).json({ success: true, linked: true });
    }

    if (!instance.container_id || instance.container_status !== "running") {
      return res.status(200).json({ success: true, linked: false });
    }

    // Read the QR capture file and check whether openclaw printed "Linked!" to it.
    // openclaw channels login outputs "✅ Linked! Credentials saved for future sends."
    // right after the user scans the QR code.
    const captureResult = await runCommandOnInstanceWithOutput(
      instance.container_id,
      [`cat ${QR_CAPTURE_FILE} 2>/dev/null || echo ""`],
      { timeoutSeconds: 30 }
    );

    const captureContent = captureResult.stdout;
    const linked =
      captureContent.toLowerCase().includes("linked") &&
      captureContent.toLowerCase().includes("credentials saved");

    if (linked) {
      const phoneNumber = (instance as any).whatsapp_phone_number as string | null;

      // 1. Restart openclaw gateway so the WhatsApp session takes effect
      try {
        await runCommandOnInstanceWithOutput(
          instance.container_id,
          [`su - ubuntu -c "openclaw gateway restart" 2>&1 || true`],
          { timeoutSeconds: 30 }
        );
        console.log("[whatsapp-status] Gateway restarted after WhatsApp link");
      } catch {
        console.warn("[whatsapp-status] Gateway restart failed (non-fatal)");
      }

      // 2. Send welcome message — give the gateway a moment to come back up first
      if (phoneNumber) {
        try {
          // Escape single quotes in the message for safe shell embedding
          const escapedMessage = WELCOME_MESSAGE.replace(/'/g, "'\\''");
          await runCommandOnInstanceWithOutput(
            instance.container_id,
            [
              `sleep 5`,
              `su - ubuntu -c "openclaw message send --channel whatsapp --target '${phoneNumber}' --message '${escapedMessage}'" 2>&1 || true`,
            ],
            { timeoutSeconds: 60 }
          );
          console.log(`[whatsapp-status] Welcome message sent to ${phoneNumber}`);
        } catch {
          console.warn("[whatsapp-status] Failed to send WhatsApp welcome message (non-fatal)");
        }
      }

      // 3. Persist linked state to database
      await prisma.openclaw_instances.update({
        where: { user_wallet: userWallet },
        data: {
          whatsapp_linked_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    return res.status(200).json({ success: true, linked });
  } catch (error: any) {
    console.error("[whatsapp-status] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to check WhatsApp status",
    });
  }
}
