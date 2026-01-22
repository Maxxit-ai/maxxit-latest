import { createHash } from "crypto";
import type { NextApiRequest } from "next";
import { prisma } from "./prisma";

const BEARER_PREFIX = "bearer ";
const prismaClient = prisma as any;

export const hashLazyTradingApiKey = (apiKey: string) =>
  createHash("sha256").update(apiKey).digest("hex");

export const extractApiKeyFromRequest = (req: NextApiRequest) => {
  const apiKeyHeader = req.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    const normalizedHeader = authHeader.toLowerCase();
    if (normalizedHeader.startsWith(BEARER_PREFIX)) {
      return authHeader.slice(BEARER_PREFIX.length).trim();
    }
  }

  return null;
};

export const resolveLazyTradingApiKey = async (req: NextApiRequest) => {
  const apiKey = extractApiKeyFromRequest(req);
  if (!apiKey) {
    return null;
  }

  const apiKeyHash = hashLazyTradingApiKey(apiKey);

  return prismaClient.user_api_keys.findFirst({
    where: { key_hash: apiKeyHash, revoked_at: null },
  });
};
