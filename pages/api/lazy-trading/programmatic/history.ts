import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";

import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;
const AVANTIS_API_BASE_URL = (process.env.AVANTIS_API_BASE_URL || "https://api.avantisfi.com").replace(/\/$/, "");

const AVANTIS_PAIR_LABELS: Record<number, string> = {
  0: "ETH/USD",
  1: "BTC/USD",
  2: "XRP/USD",
  3: "LINK/USD",
  4: "MATIC/USD",
  5: "SOL/USD",
  6: "DOGE/USD",
};

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toInteger(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number.parseInt(String(value), 10);
  return Number.isFinite(num) ? num : null;
}

function toTimestampSeconds(value: any): number | null {
  const direct = toInteger(value);
  if (direct !== null && direct > 0) return direct;
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return null;
}

function buildAvantisTradeId(pairIndex: number | null, tradeIndex: number | null): string | null {
  if (pairIndex === null || tradeIndex === null) return null;
  return `${pairIndex}:${tradeIndex}`;
}

function omitNullish<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== null && value !== undefined)
  ) as Partial<T>;
}

interface HistoryResponse {
  success: boolean;
  venue?: "OSTIUM" | "AVANTIS";
  source?: string;
  history?: any[];
  count?: number;
  stats?: any;
  error?: string;
  details?: {
    url: string;
    status: number;
    statusText: string;
    errorBody: string;
  };
}

/**
 * Get Position History
 * Get raw trading history (includes open, close, cancelled orders, etc.)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HistoryResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // Verify API key
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const {
      address,
      userAddress,
      agentAddress,
      count = 50,
      limit,
      venue,
    } = req.body || {};

    const normalizedVenue =
      String(venue || "OSTIUM").trim().toUpperCase() === "AVANTIS"
        ? "AVANTIS"
        : "OSTIUM";

    if (normalizedVenue === "AVANTIS") {
      const traderAddress = String(userAddress || address || agentAddress || "").trim();
      if (!traderAddress) {
        return res.status(400).json({
          success: false,
          error: "For AVANTIS history, provide userAddress (or address) or agentAddress",
        });
      }
      const parsedLimit = toInteger(limit ?? count);
      const resultLimit = parsedLimit && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;

      const fetchJson = async (url: string) => {
        const response = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = await response.text();
        if (!response.ok) {
          throw {
            url,
            status: response.status,
            statusText: response.statusText,
            errorBody: payload,
          };
        }
        try {
          return JSON.parse(payload);
        } catch {
          throw {
            url,
            status: response.status,
            statusText: response.statusText,
            errorBody: payload,
          };
        }
      };

      const historyRows: any[] = [];
      let page = 1;
      const maxPages = 20;

      while (historyRows.length < resultLimit && page <= maxPages) {
        const pageUrl = `${AVANTIS_API_BASE_URL}/v2/history/portfolio/history/${traderAddress}/${page}`;
        const pagePayload = await fetchJson(pageUrl);
        if (!pagePayload?.success) {
          throw {
            url: pageUrl,
            status: 502,
            statusText: "Bad Gateway",
            errorBody: "Avantis v2 history returned success=false",
          };
        }

        const portfolio = Array.isArray(pagePayload.portfolio) ? pagePayload.portfolio : [];
        if (portfolio.length === 0) break;
        historyRows.push(...portfolio);

        const totalPagesFromPayload = toInteger(pagePayload.pageCount);
        if (totalPagesFromPayload && totalPagesFromPayload > 0) {
          if (page >= totalPagesFromPayload) break;
        }
        page += 1;
      }

      const rows = historyRows.slice(0, resultLimit);
      const normalizedHistory = rows.map((row: any) => {
        const args = row?.event?.args || {};
        const trade = args?.t || {};

        const pairIndex = toInteger(trade?.pairIndex);
        const tradeIndex = toInteger(trade?.index);
        const closedAt = typeof row?.timeStamp === "string" ? row.timeStamp : null;
        const timestamp = toTimestampSeconds(trade?.timestamp) ?? toTimestampSeconds(closedAt);

        return omitNullish({
          id: row?._id ?? null,
          tradeId: buildAvantisTradeId(pairIndex, tradeIndex),
          pairIndex,
          tradeIndex,
          market: pairIndex !== null ? AVANTIS_PAIR_LABELS[pairIndex] || `PAIR-${pairIndex}` : null,
          side: typeof trade?.buy === "boolean" ? (trade.buy ? "long" : "short") : null,
          // User requested collateral sourced from positionSizeUSDC in v2 history payload.
          collateralUsdc: toNumber(args?.positionSizeUSDC ?? trade?.positionSizeUSDC),
          positionSizeUsdc: toNumber(trade?.positionSizeUSDC ?? args?.positionSizeUSDC),
          leverage: toNumber(trade?.leverage),
          entryPrice: toNumber(trade?.openPrice),
          closePrice: toNumber(args?.price),
          usdcSentToTrader: toNumber(args?.usdcSentToTrader),
          grossPnlUsdc: toNumber(row?._grossPnl),
          timestamp,
          closedAt,
        });
      });

      let stats: any = null;
      try {
        const [plByPair, totalSizeByPair, winRateByPair] = await Promise.all([
          fetchJson(`${AVANTIS_API_BASE_URL}/v2/history/portfolio/profit-loss/${traderAddress}/grouped`),
          fetchJson(`${AVANTIS_API_BASE_URL}/v1/history/portfolio/total-size/${traderAddress}/grouped`),
          fetchJson(`${AVANTIS_API_BASE_URL}/v1/history/portfolio/win-rate/${traderAddress}/grouped`),
        ]);

        const plRows = Array.isArray(plByPair?.data) ? plByPair.data : [];
        const sizeRows = Array.isArray(totalSizeByPair?.data) ? totalSizeByPair.data : [];
        const winRows = Array.isArray(winRateByPair?.dataByPairIndex) ? winRateByPair.dataByPairIndex : [];

        const totalPnlUsdc = plRows.reduce((sum: number, row: any) => sum + (toNumber(row?.total) || 0), 0);
        const totalVolumeUsdc = sizeRows.reduce((sum: number, row: any) => sum + (toNumber(row?.total) || 0), 0);
        const totalCollateralUsdc = sizeRows.reduce(
          (sum: number, row: any) => sum + (toNumber(row?.totalCollateral) || 0),
          0
        );
        const avgWinRateRaw =
          winRows.length > 0
            ? winRows.reduce((sum: number, row: any) => sum + (toNumber(row?.winRate) || 0), 0) /
              winRows.length
            : null;

        stats = omitNullish({
          totalPnlUsdc,
          totalVolumeUsdc,
          totalCollateralUsdc,
          overallWinRatePercent:
            avgWinRateRaw === null ? null : avgWinRateRaw <= 1 ? avgWinRateRaw * 100 : avgWinRateRaw,
        });
      } catch {
        stats = null;
      }

      await prismaClient.user_api_keys.update({
        where: { id: apiKeyRecord.id },
        data: { last_used_at: new Date() },
      });

      return res.status(200).json({
        success: true,
        venue: "AVANTIS",
        source: "avantis_api_v2_history",
        history: normalizedHistory,
        count: normalizedHistory.length,
        stats,
      });
    }

    if (!address) {
      return res.status(400).json({ success: false, error: "Address is required" });
    }

    // Call Ostium service to get trading history
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";
    const historyUrl = `${ostiumServiceUrl}/history`;

    console.log("[Ostium] Fetching history from:", historyUrl);

    const historyResponse = await fetch(historyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, count }),
    });

    if (!historyResponse.ok) {
      const errorText = await historyResponse.text();
      console.error("[Ostium] History fetch error:", {
        url: historyUrl,
        status: historyResponse.status,
        statusText: historyResponse.statusText,
        errorBody: errorText,
      });
      return res.status(500).json({
        success: false,
        error: "Failed to fetch history from Ostium service",
        details: {
          url: historyUrl,
          status: historyResponse.status,
          statusText: historyResponse.statusText,
          errorBody: errorText,
        },
      });
    }

    const historyData = await historyResponse.json();

    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      venue: "OSTIUM",
      source: "ostium_subgraph_history",
      history: historyData.history || [],
      count: historyData.count || 0,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading history error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch history",
    });
  }
}
