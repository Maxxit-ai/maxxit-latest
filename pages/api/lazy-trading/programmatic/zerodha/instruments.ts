/**
 * Zerodha Instruments
 *
 * GET — Fetch available instruments.
 * Use ?exchange=NSE|BSE|NFO|BFO|CDS|MCX to filter by exchange.
 * Agent passes X-KITE-API-KEY + X-KITE-ACCESS-TOKEN headers.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { Exchanges } from "kiteconnect";
import {
    isKiteSessionError,
    KITE_MISSING_CREDENTIALS_MESSAGE,
    KITE_SESSION_EXPIRED_MESSAGE,
    resolveKiteFromRequest,
} from "../../../../../lib/kite-connect";

const ALLOWED_EXCHANGES: Exchanges[] = [
    "NSE",
    "BSE",
    "NFO",
    "CDS",
    "BCD",
    "BFO",
    "MCX",
];

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

        const exchange =
            typeof req.query.exchange === "string"
                ? req.query.exchange.toUpperCase()
                : undefined;

        let instruments;
        if (exchange) {
            if (!ALLOWED_EXCHANGES.includes(exchange as Exchanges)) {
                return res.status(400).json({
                    error: `Invalid exchange. Expected one of: ${ALLOWED_EXCHANGES.join(", ")}`,
                });
            }

            instruments = await kite.getInstruments(exchange as Exchanges);
        } else {
            instruments = await kite.getInstruments();
        }

        return res.status(200).json({
            success: true,
            count: instruments.length,
            instruments,
        });
    } catch (error: any) {
        console.error("[Zerodha Instruments] Error:", error);

        if (isKiteSessionError(error)) {
            return res.status(401).json({
                error: KITE_SESSION_EXPIRED_MESSAGE,
            });
        }

        return res.status(500).json({
            error: "Failed to fetch instruments",
            message: error.message,
        });
    }
}
