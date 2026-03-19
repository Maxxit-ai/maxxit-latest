/**
 * Connect WhatsApp Channel
 * Store the WhatsApp phone number for the user's OpenClaw instance
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { storeUserWhatsappPhone } from "../../../lib/ssm";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userWallet, phoneNumber } = req.body;

  if (!userWallet || !phoneNumber) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate phone number format (E.164)
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  if (!phoneRegex.test(phoneNumber)) {
    return res.status(400).json({
      error: "Invalid phone number format. Use E.164 format (e.g., +15551234567)",
    });
  }

  try {
    // Check if instance exists
    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    if (!instance) {
      return res.status(404).json({ error: "Instance not found" });
    }

    // Store in SSM
    await storeUserWhatsappPhone(userWallet, phoneNumber);

    // Update database
    await prisma.openclaw_instances.update({
      where: { user_wallet: userWallet },
      data: {
        whatsapp_phone_number: phoneNumber,
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      phoneNumber,
    });
  } catch (error: any) {
    console.error("[connect-whatsapp] Error:", error);
    res.status(500).json({
      error: "Failed to save WhatsApp phone number",
    });
  }
}
