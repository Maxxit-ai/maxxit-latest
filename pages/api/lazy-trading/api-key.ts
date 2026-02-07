import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import { prisma } from "../../../lib/prisma";
import { hashLazyTradingApiKey } from "../../../lib/lazy-trading-api";
import { storeUserMaxxitApiKey } from "../../../lib/ssm";

const API_KEY_PREFIX = "lt_";
const API_KEY_PREFIX_LENGTH = 12;
const prismaClient = prisma as any;

const createApiKeyValue = () =>
  `${API_KEY_PREFIX}${randomBytes(32).toString("hex")}`;

const getActiveApiKey = async (userWallet: string) =>
  prismaClient.user_api_keys.findFirst({
    where: { user_wallet: userWallet, revoked_at: null },
    orderBy: { created_at: "desc" },
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userWallet =
    req.method === "GET" ? req.query.userWallet : req.body?.userWallet;

  if (!userWallet || typeof userWallet !== "string") {
    return res.status(400).json({ error: "userWallet is required" });
  }

  const normalizedWallet = userWallet.toLowerCase();

  try {
    if (req.method === "GET") {
      const activeKey = await getActiveApiKey(normalizedWallet);

      return res.status(200).json({
        success: true,
        apiKey: activeKey
          ? {
            prefix: activeKey.key_prefix,
            created_at: activeKey.created_at.toISOString(),
            last_used_at: activeKey.last_used_at
              ? activeKey.last_used_at.toISOString()
              : null,
          }
          : null,
      });
    }

    const lazyTraderAgent = await prisma.agents.findFirst({
      where: {
        creator_wallet: normalizedWallet,
        name: { startsWith: "Lazy Trader -" },
      },
      select: { id: true },
    });
    console.log("lazyTraderAgent", lazyTraderAgent);

    if (!lazyTraderAgent) {
      return res.status(404).json({
        error: "Lazy trader agent not found",
        message: "Complete Lazy Trading setup before creating an API key.",
      });
    }

    await prismaClient.user_api_keys.updateMany({
      where: { user_wallet: normalizedWallet, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    const apiKeyValue = createApiKeyValue();
    const apiKeyPrefix = apiKeyValue.slice(0, API_KEY_PREFIX_LENGTH);

    const createdKey = await prismaClient.user_api_keys.create({
      data: {
        user_wallet: normalizedWallet,
        key_hash: hashLazyTradingApiKey(apiKeyValue),
        key_prefix: apiKeyPrefix,
      },
    });

    // Store the API key in SSM for OpenClaw EC2 instances to retrieve
    await storeUserMaxxitApiKey(normalizedWallet, apiKeyValue);

    return res.status(201).json({
      success: true,
      apiKey: {
        value: apiKeyValue,
        prefix: apiKeyPrefix,
        created_at: createdKey.created_at.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[API] Lazy trading api key error:", error);
    return res.status(500).json({
      error: "Failed to process API key request",
      message: error.message,
    });
  }
}
