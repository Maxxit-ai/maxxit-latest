/**
 * Store Skill API Key in SSM
 * Stores the Maxxit API key securely for use during EC2 instance creation
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { storeUserMaxxitApiKey } from "../../../lib/ssm";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { userWallet, apiKey } = req.body;

        if (!userWallet || typeof userWallet !== "string") {
            return res.status(400).json({ error: "userWallet is required" });
        }

        if (!apiKey || typeof apiKey !== "string") {
            return res.status(400).json({ error: "apiKey is required" });
        }

        await storeUserMaxxitApiKey(userWallet, apiKey);

        return res.status(200).json({
            success: true,
            message: "API key stored securely",
        });
    } catch (error: any) {
        console.error("[OpenClaw Store Skill Key] Error:", error);
        return res.status(500).json({
            error: "Failed to store API key",
            message: error.message,
        });
    }
}
