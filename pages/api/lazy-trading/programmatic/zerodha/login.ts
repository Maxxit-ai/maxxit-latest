/**
 * Zerodha Login
 *
 * GET — Generate a Zerodha login URL for the user.
 * Reads KITE_API_KEY from SSM.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
    appendKiteRedirectParams,
    createKite,
    getKiteCredsFromSSM,
    pushAccessTokenToUser,
    resolveUserWalletFromRequest,
} from "../../../../../lib/kite-connect";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const userWallet = await resolveUserWalletFromRequest(req, {
            allowUserWalletQuery: true,
        });

        if (!userWallet) {
            return res.status(401).json({
                error: "Missing authentication. Provide X-API-KEY header or userWallet query param.",
            });
        }

        const creds = await getKiteCredsFromSSM(userWallet);

        if (!creds.apiKey) {
            return res.status(400).json({
                error: "KITE_API_KEY not configured. Please set it in your OpenClaw environment variables.",
            });
        }

        if (creds.accessToken) {
            try {
                const { appliedToInstance } = await pushAccessTokenToUser(
                    userWallet,
                    creds.accessToken,
                    creds.userName || undefined
                );
                console.log(
                    `[Zerodha Login] Re-synced existing SSM access token before redirect (appliedToInstance=${appliedToInstance})`
                );
            } catch (syncError) {
                console.error(
                    "[Zerodha Login] Failed to re-sync existing SSM access token before redirect:",
                    syncError
                );
            }
        } else {
            console.log(
                "[Zerodha Login] No existing KITE_ACCESS_TOKEN in SSM to re-sync before redirect."
            );
        }

        const kite = createKite(creds.apiKey);
        const loginUrl = appendKiteRedirectParams(kite.getLoginURL(), {
            userWallet,
        });
        const useRedirect = req.query.redirect === "1";

        if (useRedirect) {
            return res.redirect(loginUrl);
        }

        return res.status(200).json({
            success: true,
            login_url: loginUrl,
            message: "Open the login_url in your browser to authenticate with Zerodha.",
        });
    } catch (error: any) {
        console.error("[Zerodha Login] Error:", error);
        return res.status(500).json({
            error: "Failed to generate Zerodha login URL",
            message: error.message,
        });
    }
}
