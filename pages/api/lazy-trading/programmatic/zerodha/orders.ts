/**
 * Zerodha Orders
 *
 * GET    — List all orders or a specific order's history
 * POST   — Place a new order
 * PUT    — Modify an existing order
 * DELETE — Cancel an order
 *
 * Agent passes X-KITE-API-KEY + X-KITE-ACCESS-TOKEN headers.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { Connect } from "kiteconnect";
import {
    isKiteSessionError,
    KITE_MISSING_CREDENTIALS_MESSAGE,
    KITE_SESSION_EXPIRED_MESSAGE,
    resolveKiteFromRequest,
} from "../../../../../lib/kite-connect";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        const kite = await resolveKiteFromRequest(req);
        if (!kite) {
            return res.status(401).json({
                error: KITE_MISSING_CREDENTIALS_MESSAGE,
            });
        }

        switch (req.method) {
            case "GET":
                return handleGetOrders(req, res, kite);
            case "POST":
                return handlePlaceOrder(req, res, kite);
            case "PUT":
                return handleModifyOrder(req, res, kite);
            case "DELETE":
                return handleCancelOrder(req, res, kite);
            default:
                return res.status(405).json({ error: "Method not allowed" });
        }
    } catch (error: any) {
        console.error("[Zerodha Orders] Error:", error);

        if (isKiteSessionError(error)) {
            return res.status(401).json({
                error: KITE_SESSION_EXPIRED_MESSAGE,
            });
        }

        return res.status(500).json({
            error: "Failed to process order request",
            message: error.message,
        });
    }
}

async function handleGetOrders(
    req: NextApiRequest,
    res: NextApiResponse,
    kite: Connect
) {
    const orderId =
        typeof req.query.orderId === "string" ? req.query.orderId : undefined;

    if (orderId) {
        const orderHistory = await kite.getOrderHistory(orderId);
        return res.status(200).json({ success: true, order_history: orderHistory });
    }

    const orders = await kite.getOrders();
    return res.status(200).json({ success: true, orders });
}

async function handlePlaceOrder(
    req: NextApiRequest,
    res: NextApiResponse,
    kite: Connect
) {
    const {
        variety = "regular",
        exchange,
        tradingsymbol,
        transaction_type,
        quantity,
        product,
        order_type,
        validity,
        price,
        disclosed_quantity,
        trigger_price,
        squareoff,
        stoploss,
        trailing_stoploss,
        tag,
    } = req.body;

    // Validate required fields
    if (!exchange || !tradingsymbol || !transaction_type || !quantity || !product || !order_type) {
        return res.status(400).json({
            error: "Missing required fields: exchange, tradingsymbol, transaction_type, quantity, product, order_type",
        });
    }

    const orderParams: any = {
        exchange,
        tradingsymbol,
        transaction_type,
        quantity,
        product,
        order_type,
    };

    // Add optional params
    if (validity) orderParams.validity = validity;
    if (price !== undefined) orderParams.price = price;
    if (disclosed_quantity) orderParams.disclosed_quantity = disclosed_quantity;
    if (trigger_price !== undefined) orderParams.trigger_price = trigger_price;
    if (squareoff) orderParams.squareoff = squareoff;
    if (stoploss) orderParams.stoploss = stoploss;
    if (trailing_stoploss) orderParams.trailing_stoploss = trailing_stoploss;
    if (tag) orderParams.tag = tag;

    const result = await kite.placeOrder(variety, orderParams);

    return res.status(201).json({
        success: true,
        order_id: result.order_id,
        message: `Order placed successfully (${transaction_type} ${quantity} ${tradingsymbol})`,
    });
}

async function handleModifyOrder(
    req: NextApiRequest,
    res: NextApiResponse,
    kite: Connect
) {
    const orderId =
        typeof req.query.orderId === "string" ? req.query.orderId : null;
    if (!orderId) {
        return res.status(400).json({ error: "Missing orderId query parameter" });
    }

    const { variety = "regular", ...modifyParams } = req.body;

    const result = await kite.modifyOrder(variety, orderId, modifyParams);

    return res.status(200).json({
        success: true,
        order_id: result.order_id,
        message: "Order modified successfully",
    });
}

async function handleCancelOrder(
    req: NextApiRequest,
    res: NextApiResponse,
    kite: Connect
) {
    const orderId =
        typeof req.query.orderId === "string" ? req.query.orderId : null;
    if (!orderId) {
        return res.status(400).json({ error: "Missing orderId query parameter" });
    }

    const { variety = "regular" } = req.body || {};

    const result = await kite.cancelOrder(variety, orderId);

    return res.status(200).json({
        success: true,
        order_id: result.order_id,
        message: "Order cancelled successfully",
    });
}
