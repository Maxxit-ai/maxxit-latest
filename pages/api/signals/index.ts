import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { bucket6hUtc } from "../../../lib/time-utils";
import { serializePrisma } from "../../../lib/prisma-serializer";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function parsePagination(query: NextApiRequest["query"]) {
  const page = Math.max(1, parseInt((query.page as string) || "1", 10));
  const pageSizeRaw = parseInt(
    (query.pageSize as string) || `${DEFAULT_PAGE_SIZE}`,
    10
  );
  const pageSize = Math.min(
    Math.max(1, pageSizeRaw || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { agentId, tokenSymbol, venue, side, from, to } = req.query;
    const { page, pageSize, skip } = parsePagination(req.query);

    const where: any = {
      // Enforce Ostium venue by default
      venue: "OSTIUM",
    };
    if (agentId) where.agent_id = agentId;
    if (tokenSymbol)
      where.token_symbol = {
        contains: tokenSymbol as string,
        mode: "insensitive",
      };
    // Allow overriding venue filter only if explicitly provided (still constrained to OSTIUM)
    if (venue) where.venue = venue;
    if (side) where.side = side;

    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(from as string);
      if (to) where.created_at.lte = new Date(to as string);
    }

    const [total, signals] = await Promise.all([
      prisma.signals.count({ where }),
      prisma.signals.findMany({
        where,
        orderBy: {
          created_at: "desc",
        },
        skip,
        take: pageSize,
      }),
    ]);

    // Add 6h bucket to each signal and serialize to ensure JSON-safe response
    const signalsWithBucket = signals.map((signal) => {
      const bucket6h = bucket6hUtc(signal.created_at);
      const serialized = serializePrisma(signal);
      return {
        ...serialized,
        bucket6h: bucket6h.toISOString(),
      };
    });

    return res.status(200).json({
      data: signalsWithBucket,
      page,
      pageSize,
      total,
    });
  } catch (error: any) {
    console.error("[API /signals] Error:", error.message);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}
