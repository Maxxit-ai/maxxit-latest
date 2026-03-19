/**
 * Zerodha GTT
 *
 * GET    — List all GTT triggers or fetch a specific GTT by triggerId
 * POST   — Place a new GTT trigger
 * PUT    — Modify an existing GTT trigger
 * DELETE — Delete an existing GTT trigger
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

type GttOrderInput = {
  transaction_type?: string;
  quantity?: number;
  product?: string;
  order_type?: string;
  price?: number;
};

type GttPayload = {
  trigger_type?: string;
  tradingsymbol?: string;
  exchange?: string;
  trigger_values?: number[];
  last_price?: number;
  orders?: GttOrderInput[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
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
        return handleGetGtt(req, res, kite);
      case "POST":
        return handleCreateGtt(req, res, kite);
      case "PUT":
        return handleModifyGtt(req, res, kite);
      case "DELETE":
        return handleDeleteGtt(req, res, kite);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("[Zerodha GTT] Error:", error);

    if (isKiteSessionError(error)) {
      return res.status(401).json({
        error: KITE_SESSION_EXPIRED_MESSAGE,
      });
    }

    return res.status(500).json({
      error: "Failed to process GTT request",
      message: error.message,
    });
  }
}

async function handleGetGtt(
  req: NextApiRequest,
  res: NextApiResponse,
  kite: Connect,
) {
  const triggerId =
    typeof req.query.triggerId === "string" ? req.query.triggerId : undefined;

  if (triggerId) {
    const gtt = await kite.getGTT(triggerId);
    return res.status(200).json({ success: true, gtt });
  }

  const gtts = await kite.getGTTs();
  return res.status(200).json({ success: true, gtts });
}

async function handleCreateGtt(
  req: NextApiRequest,
  res: NextApiResponse,
  kite: Connect,
) {
  const validationError = validateGttPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const payload = buildGttPayload(req.body);
  const result = await kite.placeGTT(payload);

  return res.status(201).json({
    success: true,
    trigger_id: result.trigger_id,
    message: `GTT created successfully for ${payload.exchange}:${payload.tradingsymbol}`,
  });
}

async function handleModifyGtt(
  req: NextApiRequest,
  res: NextApiResponse,
  kite: Connect,
) {
  const triggerId =
    typeof req.query.triggerId === "string" ? req.query.triggerId : null;
  if (!triggerId) {
    return res.status(400).json({ error: "Missing triggerId query parameter" });
  }

  const validationError = validateGttPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const payload = buildGttPayload(req.body);
  const result = await kite.modifyGTT(triggerId, payload);

  return res.status(200).json({
    success: true,
    trigger_id: result.trigger_id,
    message: "GTT modified successfully",
  });
}

async function handleDeleteGtt(
  req: NextApiRequest,
  res: NextApiResponse,
  kite: Connect,
) {
  const triggerId =
    typeof req.query.triggerId === "string" ? req.query.triggerId : null;
  if (!triggerId) {
    return res.status(400).json({ error: "Missing triggerId query parameter" });
  }

  const result = await kite.deleteGTT(triggerId);

  return res.status(200).json({
    success: true,
    trigger_id: result.trigger_id,
    message: "GTT deleted successfully",
  });
}

function validateGttPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Missing GTT payload";
  }

  const payload = body as GttPayload;
  const requiredFields = [
    "trigger_type",
    "tradingsymbol",
    "exchange",
    "trigger_values",
    "last_price",
    "orders",
  ] as const;

  for (const field of requiredFields) {
    if ((payload as Record<string, unknown>)[field] === undefined) {
      return `Missing required field: ${field}`;
    }
  }

  if (!Array.isArray(payload.trigger_values) || payload.trigger_values.length === 0) {
    return "trigger_values must be a non-empty array";
  }

  if (
    !Array.isArray(payload.orders) ||
    payload.orders.length === 0 ||
    payload.orders.some((order) => !order || typeof order !== "object")
  ) {
    return "orders must be a non-empty array";
  }

  if (payload.trigger_type === "single" && payload.trigger_values.length !== 1) {
    return "single GTT requires exactly 1 trigger value";
  }

  if (payload.trigger_type === "two-leg" && payload.trigger_values.length !== 2) {
    return "two-leg GTT requires exactly 2 trigger values";
  }

  if (
    payload.trigger_type !== "single" &&
    payload.trigger_type !== "two-leg"
  ) {
    return "trigger_type must be either 'single' or 'two-leg'";
  }

  if (
    (payload.trigger_type === "single" && payload.orders.length !== 1) ||
    (payload.trigger_type === "two-leg" && payload.orders.length !== 2)
  ) {
    return `${payload.trigger_type} GTT requires ${payload.trigger_type === "single" ? 1 : 2} order definition(s)`;
  }

  for (const [index, order] of payload.orders.entries()) {
    if (
      !order.transaction_type ||
      order.quantity === undefined ||
      !order.product ||
      !order.order_type ||
      order.price === undefined
    ) {
      return `Order at index ${index} is missing one of: transaction_type, quantity, product, order_type, price`;
    }
  }

  return null;
}

function buildGttPayload(body: unknown) {
  const payload = body as GttPayload;

  return {
    trigger_type: payload.trigger_type as "single" | "two-leg",
    tradingsymbol: String(payload.tradingsymbol),
    exchange: String(payload.exchange) as any,
    trigger_values: payload.trigger_values!.map(Number),
    last_price: Number(payload.last_price),
    orders: payload.orders!.map((order) => ({
      transaction_type: String(order.transaction_type) as any,
      quantity: Number(order.quantity),
      product: String(order.product) as any,
      order_type: String(order.order_type) as any,
      price: Number(order.price),
    })),
  };
}
