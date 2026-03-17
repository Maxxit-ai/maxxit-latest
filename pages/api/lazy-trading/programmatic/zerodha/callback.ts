/**
 * Zerodha OAuth Callback
 *
 * GET — Zerodha redirects here after user login.
 * Receives request_token and resolves the user via redirect_params.
 * Exchanges for access_token, stores in SSM, pushes to EC2 if running.
 * Redirects browser to /openclaw?zerodha=success
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
    createKite,
    getKiteCredsFromSSM,
    pushAccessTokenToUser,
} from "../../../../../lib/kite-connect";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const requestToken = req.query.request_token;
        const userWallet =
            typeof req.query.userWallet === "string" && req.query.userWallet
                ? req.query.userWallet
                : typeof req.query.state === "string" && req.query.state
                  ? req.query.state
                  : null;

        if (typeof requestToken !== "string" || !requestToken) {
            return res.redirect(
                `/openclaw?zerodha=error&message=${encodeURIComponent("Missing request_token from Zerodha")}`
            );
        }

        if (typeof userWallet !== "string" || !userWallet) {
            return res.redirect(
                `/openclaw?zerodha=error&message=${encodeURIComponent("Missing user state. Please try authenticating again.")}`
            );
        }

        // Read credentials from SSM
        const creds = await getKiteCredsFromSSM(userWallet);

        if (!creds.apiKey || !creds.apiSecret) {
            return res.redirect(
                `/openclaw?zerodha=error&message=${encodeURIComponent("KITE_API_KEY or KITE_API_SECRET not found. Please save your credentials first.")}`
            );
        }

        // Exchange request_token for access_token
        const kite = createKite(creds.apiKey);
        const session = await kite.generateSession(requestToken, creds.apiSecret);

        if (!session.access_token) {
            return res.redirect(
                `/openclaw?zerodha=error&message=${encodeURIComponent("Failed to get access token from Zerodha")}`
            );
        }

        // Store access token in SSM and push to running EC2 if available
        await pushAccessTokenToUser(userWallet, session.access_token);

        // Also store the Zerodha user name for display
        const userName = session.user_name || session.user_shortname || "";
        await pushAccessTokenToUser(
            userWallet,
            session.access_token,
            userName || undefined
        );

        console.log(
            `[Zerodha Callback] Session created for wallet ${userWallet.substring(0, 10)}... (user: ${userName})`
        );

        return res.redirect(`/openclaw?zerodha=success`);
    } catch (error: any) {
        console.error("[Zerodha Callback] Error:", error);
        return res.redirect(
            `/openclaw?zerodha=error&message=${encodeURIComponent(error.message || "Authentication failed")}`
        );
    }
}
