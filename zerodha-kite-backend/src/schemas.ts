import { z } from "zod";

const exchanges = ["NSE", "BSE", "NFO", "BFO", "CDS", "MCX"] as const;
const transactionTypes = ["BUY", "SELL"] as const;
const products = ["CNC", "NRML", "MIS"] as const;
const orderTypes = ["MARKET", "LIMIT", "SL", "SL-M"] as const;
const validities = ["DAY", "IOC", "TTL"] as const;
const varieties = ["regular", "amo", "co", "iceberg", "auction"] as const;
const positionTypes = ["day", "overnight"] as const;

export const requestTokenSchema = z.object({
  request_token: z.string().min(1),
});

export const placeOrderSchema = z.object({
  variety: z.enum(varieties).default("regular"),
  exchange: z.enum(exchanges),
  tradingsymbol: z.string().min(1),
  transaction_type: z.enum(transactionTypes),
  quantity: z.number().positive(),
  product: z.enum(products),
  order_type: z.enum(orderTypes),
  validity: z.enum(validities).optional(),
  price: z.number().nonnegative().optional(),
  disclosed_quantity: z.number().int().positive().optional(),
  trigger_price: z.number().nonnegative().optional(),
  squareoff: z.number().positive().optional(),
  stoploss: z.number().positive().optional(),
  trailing_stoploss: z.number().positive().optional(),
  validity_ttl: z.number().int().positive().optional(),
  iceberg_legs: z.number().int().positive().optional(),
  iceberg_quantity: z.number().int().positive().optional(),
  auction_number: z.number().int().positive().optional(),
  tag: z.string().max(20).optional(),
});

export const modifyOrderSchema = z
  .object({
    variety: z.enum(varieties).default("regular"),
    quantity: z.number().positive().optional(),
    price: z.number().nonnegative().optional(),
    order_type: z.enum(orderTypes).optional(),
    validity: z.enum(validities).optional(),
    disclosed_quantity: z.number().int().positive().optional(),
    trigger_price: z.number().nonnegative().optional(),
    parent_order_id: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "variety"), {
    message: "At least one mutable order field is required",
  });

export const cancelOrderSchema = z.object({
  variety: z.enum(varieties).default("regular"),
  parent_order_id: z.string().min(1).optional(),
});

export const convertPositionSchema = z.object({
  exchange: z.enum(exchanges),
  tradingsymbol: z.string().min(1),
  transaction_type: z.enum(transactionTypes),
  position_type: z.enum(positionTypes),
  quantity: z.number().positive(),
  old_product: z.enum(products),
  new_product: z.enum(products),
});

export const marginModeSchema = z.object({
  mode: z.string().optional(),
  consider_positions: z.boolean().optional(),
});

export const marginOrderSchema = z.object({
  exchange: z.enum(exchanges),
  tradingsymbol: z.string().min(1),
  transaction_type: z.enum(transactionTypes),
  variety: z.enum(varieties),
  product: z.enum(products),
  order_type: z.enum(orderTypes),
  quantity: z.number().positive(),
  price: z.number().nonnegative().default(0),
  trigger_price: z.number().nonnegative().default(0),
});

export const marginOrdersBodySchema = marginModeSchema.extend({
  orders: z.array(marginOrderSchema).min(1),
});
