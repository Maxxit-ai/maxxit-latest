import type { NextApiRequest, NextApiResponse } from "next";
import { prisma as prismaClient } from "../../../lib/prisma";

/**
 * GET /api/eigenai/verifications?userAddress=0x...
 *
 * Returns all openclaw_eigen_verification rows for the given user_address,
 * ordered by created_at descending (newest first).
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res
            .status(405)
            .json({ success: false, error: "Method not allowed. Use GET." });
    }

    const { userAddress } = req.query;

    if (!userAddress || typeof userAddress !== "string") {
        return res
            .status(400)
            .json({ success: false, error: "Missing required query parameter: userAddress" });
    }

    try {
        const records = await prismaClient.openclaw_eigen_verification.findMany({
            where: { user_address: userAddress },
            orderBy: { created_at: "desc" },
        });

        console.log("[EigenAI verifications] Fetched", records.length, "records for", userAddress);
        records.forEach((r, i) => {
            console.log(`[EigenAI verifications] Record ${i} id=${r.id}:`, {
                llm_full_prompt_length: r.llm_full_prompt?.length,
                llm_raw_output_length: r.llm_raw_output?.length,
                llm_signature_length: r.llm_signature?.length,
                llm_model_used: r.llm_model_used,
                llm_chain_id: r.llm_chain_id,
                market: r.market,
                side: r.side,
            });
        });

        return res.status(200).json({
            success: true,
            verifications: records,
            total: records.length,
        });
    } catch (error: any) {
        console.error("[EigenAI] Failed to fetch verifications:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to fetch verification records",
            message: error.message,
        });
    }
}
