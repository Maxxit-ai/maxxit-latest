/**
 * Zerodha Portfolio
 *
 * GET — Fetch portfolio data (profile, holdings, positions, margins).
 * Agent passes X-KITE-API-KEY + X-KITE-ACCESS-TOKEN headers.
 * Use ?type=profile|holdings|positions|margins to select data.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import {
    isKiteSessionError,
    KITE_MISSING_CREDENTIALS_MESSAGE,
    KITE_SESSION_EXPIRED_MESSAGE,
    resolveKiteFromRequest,
} from "../../../../../lib/kite-connect";

const ALLOWED_MARGIN_SEGMENTS = ["equity", "commodity"] as const;

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const kite = await resolveKiteFromRequest(req);
        if (!kite) {
            return res.status(401).json({
                error: KITE_MISSING_CREDENTIALS_MESSAGE,
            });
        }

        const type = (req.query.type as string) || "all";

        switch (type) {
            case "profile": {
                const profile = await kite.getProfile();
                return res.status(200).json({ success: true, profile });
            }

            case "holdings": {
                const holdings = await kite.getHoldings();
                return res.status(200).json({ success: true, holdings });
            }

            case "positions": {
                const positions = await kite.getPositions();
                return res.status(200).json({ success: true, positions });
            }

            case "margins": {
                const segment =
                    typeof req.query.segment === "string"
                        ? req.query.segment.toLowerCase()
                        : undefined;

                if (
                    segment &&
                    !ALLOWED_MARGIN_SEGMENTS.includes(
                        segment as (typeof ALLOWED_MARGIN_SEGMENTS)[number]
                    )
                ) {
                    return res.status(400).json({
                        error: `Invalid segment. Expected one of: ${ALLOWED_MARGIN_SEGMENTS.join(", ")}`,
                    });
                }

                const margins = segment
                    ? await kite.getMargins(
                          segment as (typeof ALLOWED_MARGIN_SEGMENTS)[number]
                      )
                    : await kite.getMargins();
                return res.status(200).json({ success: true, margins });
            }

            case "all":
            default: {
                const [profile, holdings, positions, margins] = await Promise.allSettled([
                    kite.getProfile(),
                    kite.getHoldings(),
                    kite.getPositions(),
                    kite.getMargins(),
                ]);

                return res.status(200).json({
                    success: true,
                    profile:
                        profile.status === "fulfilled" ? profile.value : null,
                    holdings:
                        holdings.status === "fulfilled" ? holdings.value : null,
                    positions:
                        positions.status === "fulfilled" ? positions.value : null,
                    margins:
                        margins.status === "fulfilled" ? margins.value : null,
                });
            }
        }
    } catch (error: any) {
        console.error("[Zerodha Portfolio] Error:", error);

        if (isKiteSessionError(error)) {
            return res.status(401).json({
                error: KITE_SESSION_EXPIRED_MESSAGE,
            });
        }

        return res.status(500).json({
            error: "Failed to fetch portfolio data",
            message: error.message,
        });
    }
}
