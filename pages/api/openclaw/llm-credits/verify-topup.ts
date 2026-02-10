/**
 * POST /api/openclaw/llm-credits/verify-topup 
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@lib/stripe";
import { LLMCreditService } from "@lib/llm-credit-service";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { userWallet } = req.body;

        // Validate userWallet
        if (!userWallet || typeof userWallet !== "string") {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid userWallet",
            });
        }

        const normalizedWallet = userWallet.toLowerCase().trim();
        console.log(`[verify-topup] Checking for paid sessions for wallet: ${normalizedWallet}`);

        const recentSessions = await stripe.checkout.sessions.list({
            limit: 10,
            expand: ["data.payment_intent"],
        });

        let creditedCount = 0;
        let alreadyCreditedCount = 0;

        for (const session of recentSessions.data) {
            if (
                session.metadata?.type === "llm_topup" &&
                session.metadata?.userWallet?.toLowerCase() === normalizedWallet &&
                session.payment_status === "paid"
            ) {
                console.log(`[verify-topup] Found paid session: ${session.id}`);
                const result = await verifyAndCreditSession(session.id, normalizedWallet);
                if (result.credited) {
                    creditedCount++;
                } else if (result.alreadyCredited) {
                    alreadyCreditedCount++;
                }
            }
        }

        const balance = await LLMCreditService.getBalance(normalizedWallet);

        console.log(`[verify-topup] Result: credited=${creditedCount}, alreadyCredited=${alreadyCreditedCount}, balance=${balance.balanceCents}`);

        return res.status(200).json({
            success: true,
            credited: creditedCount > 0,
            alreadyCredited: alreadyCreditedCount > 0,
            sessionsProcessed: creditedCount + alreadyCreditedCount,
            balance: balance.balanceCents,
            totalPurchased: balance.totalPurchased,
            totalUsed: balance.totalUsed,
            limitReached: balance.limitReached,
        });
    } catch (error: any) {
        console.error("[verify-topup] Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to verify top-up",
        });
    }
}

/**
 * Verifies a specific Stripe session and credits the user if valid
 */
async function verifyAndCreditSession(
    sessionId: string,
    userWallet: string
): Promise<{ success: boolean; credited?: boolean; alreadyCredited?: boolean; error?: string }> {
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
            return { success: false, error: "Session not paid" };
        }

        if (session.metadata?.type !== "llm_topup") {
            return { success: false, error: "Not an LLM top-up session" };
        }

        if (session.metadata?.userWallet?.toLowerCase() !== userWallet) {
            return { success: false, error: "Wallet mismatch" };
        }

        const llmCreditsCents = parseInt(session.metadata?.llmCreditsCents || "0");
        if (llmCreditsCents <= 0) {
            return { success: false, error: "Invalid credit amount" };
        }

        try {
            const entry = await LLMCreditService.addCredits(
                userWallet,
                llmCreditsCents,
                "Stripe LLM Top-Up",
                sessionId,
                {
                    stripeSessionId: sessionId,
                    amount_total: session.amount_total,
                    customer: session.customer,
                    verifiedAt: new Date().toISOString(),
                }
            );

            const isNew = Date.now() - new Date(entry.created_at).getTime() < 2000;

            await LLMCreditService.clearLimitReached(userWallet);

            if (isNew) {
                console.log(`✅ [verify-topup] Credited ${llmCreditsCents} cents to ${userWallet}`);
                return { success: true, credited: true };
            } else {
                console.log(`ℹ️ [verify-topup] Credits already existed for session ${sessionId}`);
                return { success: true, alreadyCredited: true };
            }
        } catch (creditError: any) {
            if (creditError.message?.includes("Unique constraint") ||
                creditError.code === "P2002") {
                return { success: true, alreadyCredited: true };
            }
            throw creditError;
        }
    } catch (error: any) {
        console.error(`[verify-topup] Error verifying session ${sessionId}:`, error);
        return { success: false, error: error.message };
    }
}
