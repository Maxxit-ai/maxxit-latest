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

    // Primary check: credentials file existence — this is the definitive indicator
    // that openclaw has a live WhatsApp session (same file openclaw status shows).
    // Secondary: also read the QR capture file for display purposes.
    const WA_CREDENTIALS_FILE = "/home/ubuntu/.openclaw/credentials/whatsapp/default";

    const checkResult = await runCommandOnInstanceWithOutput(
      instance.container_id,
      [
        `test -f ${WA_CREDENTIALS_FILE} && echo "__WA_LINKED__" || echo "__WA_NOT_LINKED__"`,
        `cat ${QR_CAPTURE_FILE} 2>/dev/null || echo ""`,
      ],
      { timeoutSeconds: 30 }
    );

    const checkOutput = checkResult.stdout;

    // Strip the sentinel markers to get clean capture content
    const captureOutput = checkOutput
      .replace("__WA_LINKED__", "")
      .replace("__WA_NOT_LINKED__", "")
      .trim() || null;

    // Primary: credentials file exists (definitive session indicator)
    // Fallback: capture file contains the "Credentials saved" confirmation
    //   (handles race where file isn't written yet when the test runs)
    const linkedByFile = checkOutput.includes("__WA_LINKED__");
    const linkedByCapture =
      !!captureOutput &&
      captureOutput.toLowerCase().includes("linked") &&
      captureOutput.toLowerCase().includes("credentials saved");
    const linked = linkedByFile || linkedByCapture;

    if (linked) {
      // 1. Persist linked state to database (fast — do this before responding)
      await prisma.openclaw_instances.update({
        where: { user_wallet: userWallet },
        data: {
          whatsapp_linked_at: new Date(),
          updated_at: new Date(),
        },
      });

      // 2. Respond immediately so the frontend gets the linked state
      res.status(200).json({ success: true, linked: true, captureOutput });

      // 3. Fire-and-forget: restart gateway + send welcome message
      //    (response already sent — these run in the background)
      const containerId = instance.container_id!;
      const phoneNumber = (instance as any).whatsapp_phone_number as string | null;

      (async () => {
        try {
          await runCommandOnInstanceWithOutput(
            containerId,
            [`su - ubuntu -c "openclaw gateway restart" 2>&1 || true`],
            { timeoutSeconds: 30 }
          );
          console.log("[whatsapp-status] Gateway restarted after WhatsApp link");
        } catch {
          console.warn("[whatsapp-status] Gateway restart failed (non-fatal)");
        }

        if (phoneNumber) {
          try {
            const escapedMessage = WELCOME_MESSAGE.replace(/'/g, "'\\''");
            await runCommandOnInstanceWithOutput(
              containerId,
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
      })();

      return; // Response already sent above
    }

    return res.status(200).json({ success: true, linked: false, captureOutput });
  } catch (error: any) {
    console.error("[whatsapp-status] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to check WhatsApp status",
    });
  }
}
