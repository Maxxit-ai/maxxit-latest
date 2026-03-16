import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError, flattenError } from "zod";

import { appConfig } from "./config";
import { HttpError } from "./errors";
import {
  createSessionFromRequestToken,
  destroySession,
  getLoginUrl,
  getStoredSession,
  requireKite,
} from "./kite";
import {
  cancelOrderSchema,
  convertPositionSchema,
  marginOrdersBodySchema,
  modifyOrderSchema,
  placeOrderSchema,
  requestTokenSchema,
} from "./schemas";

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      redirect_url: appConfig.kiteRedirectUrl,
    });
  });

  app.get("/auth/login", (_request, response) => {
    response.json({
      login_url: getLoginUrl(),
      redirect_url: appConfig.kiteRedirectUrl,
    });
  });

  app.get(
    "/auth/session",
    asyncRoute(async (_request, response) => {
      const session = await getStoredSession();
      response.json({
        authenticated: Boolean(session?.access_token),
        session,
      });
    })
  );

  app.post(
    "/auth/session",
    asyncRoute(async (request, response) => {
      const { request_token } = requestTokenSchema.parse(request.body);
      const session = await createSessionFromRequestToken(request_token);

      response.status(201).json({
        message: "Kite session created",
        session,
      });
    })
  );

  app.get(
    "/auth/callback",
    asyncRoute(async (request, response) => {
      const request_token = request.query.request_token;

      if (typeof request_token !== "string" || !request_token) {
        throw new HttpError(400, "Missing request_token in callback URL.");
      }

      const session = await createSessionFromRequestToken(request_token);
      response.json({
        message: "Kite session created",
        session,
      });
    })
  );

  app.delete(
    "/auth/session",
    asyncRoute(async (_request, response) => {
      await destroySession();
      response.status(204).send();
    })
  );

  app.get(
    "/portfolio",
    asyncRoute(async (_request, response) => {
      const { kite, session } = await requireKite();
      const [profile, holdings, positions, margins] = await Promise.all([
        kite.getProfile(),
        kite.getHoldings(),
        kite.getPositions(),
        kite.getMargins(),
      ]);

      response.json({
        session,
        profile,
        holdings,
        positions,
        margins,
      });
    })
  );

  app.get(
    "/portfolio/profile",
    asyncRoute(async (_request, response) => {
      const { kite } = await requireKite();
      response.json(await kite.getProfile());
    })
  );

  app.get(
    "/portfolio/holdings",
    asyncRoute(async (_request, response) => {
      const { kite } = await requireKite();
      response.json(await kite.getHoldings());
    })
  );

  app.get(
    "/portfolio/positions",
    asyncRoute(async (_request, response) => {
      const { kite } = await requireKite();
      response.json(await kite.getPositions());
    })
  );

  app.post(
    "/portfolio/positions/convert",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const body = convertPositionSchema.parse(request.body);
      const result = await kite.convertPosition(body);
      response.json({ success: result });
    })
  );

  app.get(
    "/margins",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const segment =
        request.query.segment === "equity" || request.query.segment === "commodity"
          ? request.query.segment
          : undefined;

      response.json(await kite.getMargins(segment));
    })
  );

  app.get(
    "/instruments",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const exchange =
        request.query.exchange === "NSE" ||
        request.query.exchange === "BSE" ||
        request.query.exchange === "NFO" ||
        request.query.exchange === "BFO" ||
        request.query.exchange === "CDS" ||
        request.query.exchange === "MCX"
          ? request.query.exchange
          : undefined;

      response.json(await kite.getInstruments(exchange));
    })
  );

  app.post(
    "/margins/orders",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const { orders, mode } = marginOrdersBodySchema.parse(request.body);
      response.json(await kite.orderMargins(orders, mode));
    })
  );

  app.post(
    "/margins/basket",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const { orders, consider_positions, mode } = marginOrdersBodySchema.parse(request.body);
      response.json(await kite.orderBasketMargins(orders, consider_positions, mode));
    })
  );

  app.get(
    "/orders",
    asyncRoute(async (_request, response) => {
      const { kite } = await requireKite();
      response.json(await kite.getOrders());
    })
  );

  app.get(
    "/orders/:orderId/history",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const orderId = String(request.params.orderId);
      response.json(await kite.getOrderHistory(orderId));
    })
  );

  app.get(
    "/orders/:orderId/trades",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const orderId = String(request.params.orderId);
      response.json(await kite.getOrderTrades(orderId));
    })
  );

  app.post(
    "/orders",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const { variety, ...params } = placeOrderSchema.parse(request.body);
      const result = await kite.placeOrder(variety, params);
      response.status(201).json(result);
    })
  );

  app.put(
    "/orders/:orderId",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const { variety, ...params } = modifyOrderSchema.parse(request.body);
      const orderId = String(request.params.orderId);
      const result = await kite.modifyOrder(variety, orderId, params);
      response.json(result);
    })
  );

  app.delete(
    "/orders/:orderId",
    asyncRoute(async (request, response) => {
      const { kite } = await requireKite();
      const { variety, parent_order_id } = cancelOrderSchema.parse(request.body ?? {});
      const orderId = String(request.params.orderId);
      const result = await kite.cancelOrder(variety, orderId, {
        parent_order_id,
      });
      response.json(result);
    })
  );

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: "Validation failed",
        issues: flattenError(error),
      });
      return;
    }

    if (error instanceof HttpError) {
      response.status(error.statusCode).json({
        message: error.message,
        details: error.details,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    response.status(500).json({ message });
  });

  return app;
}
