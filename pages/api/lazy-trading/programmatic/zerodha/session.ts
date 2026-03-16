/**
 * Zerodha Session Check
 *
 * GET — Verify if the user has a valid Zerodha session.
 *       Agent passes X-KITE-API-KEY + X-KITE-ACCESS-TOKEN headers.
 *       Returns session status and profile info.
 * DELETE — Invalidate session and remove KITE_ACCESS_TOKEN from SSM.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
    getKiteCredsFromSSM,
    createKite,
    isKiteSessionError,
    KITE_SESSION_EXPIRED_MESSAGE,
    removeKiteSessionFromUser,
    resolveKiteFromRequest,
    resolveUserWalletFromRequest,
} from "../../../../../lib/kite-connect";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method === "GET") {
        return handleGet(req, res);
    }
    if (req.method === "DELETE") {
        return handleDelete(req, res);
    }
    return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
    try {
        const userWallet = await resolveUserWalletFromRequest(req, {
            allowUserWalletQuery: true,
        });
        const kite = await resolveKiteFromRequest(req, {
            allowUserWalletQuery: true,
        });

        if (!kite) {
            if (!userWallet) {
                return res.status(200).json({
                    success: true,
                    authenticated: false,
                    message: "No credentials provided",
                });
            }

            const creds = await getKiteCredsFromSSM(userWallet);
            return res.status(200).json({
                success: true,
                authenticated: false,
                hasApiKey: !!creds.apiKey,
                message: creds.apiKey
                    ? "API key found but no active session. Please authenticate with Zerodha."
                    : "KITE_API_KEY not configured.",
            });
        }

        try {
            const profile = await kite.getProfile();

            return res.status(200).json({
                success: true,
                authenticated: true,
                profile: {
                    user_id: profile.user_id,
                    user_name: profile.user_name,
                    user_shortname: profile.user_shortname,
                    email: profile.email,
                    broker: profile.broker,
                    exchanges: profile.exchanges,
                    products: profile.products,
                    order_types: profile.order_types,
                },
            });
        } catch (profileError: any) {
            if (!isKiteSessionError(profileError)) {
                throw profileError;
            }

            return res.status(200).json({
                success: true,
                authenticated: false,
                expired: true,
                message: KITE_SESSION_EXPIRED_MESSAGE,
            });
        }
    } catch (error: any) {
        console.error("[Zerodha Session] Error:", error);
        return res.status(500).json({
            error: "Failed to check Zerodha session",
            message: error.message,
        });
    }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
    try {
        const userWallet = await resolveUserWalletFromRequest(req, {
            allowUserWalletQuery: true,
        });

        if (!userWallet) {
            return res
                .status(401)
                .json({ error: "Missing authentication" });
        }

        // Try to invalidate the token on Zerodha's side
        const creds = await getKiteCredsFromSSM(userWallet);
        if (creds.apiKey && creds.accessToken) {
            try {
                const kite = createKite(creds.apiKey, creds.accessToken);
                await kite.invalidateAccessToken(creds.accessToken);
            } catch {
                // Best effort — continue with local cleanup
            }
        }

        await removeKiteSessionFromUser(userWallet);

        return res.status(200).json({
            success: true,
            message: "Zerodha session destroyed",
        });
    } catch (error: any) {
        console.error("[Zerodha Session Delete] Error:", error);
        return res.status(500).json({
            error: "Failed to destroy Zerodha session",
            message: error.message,
        });
    }
}
