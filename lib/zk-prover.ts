/**
 * SP1 ZK Prover Integration for Alpha Marketplace
 *
 * This library handles:
 * 1. Fetching trader performance data from Ostium and Avantis
 * 2. Computing trading metrics (PnL, win rate, trade count)
 * 3. Generating ZK proofs via the SP1 host binary (when available)
 * 4. Submitting proofs to the PositionRegistry contract on-chain
 *
 * Environment variables:
 *   SP1_PROVER_MODE             — "execute" (fast/test), "prove" (ZK proof), or empty (simulation)
 *   SP1_HOST_BINARY             — Path to compiled SP1 host binary
 *   POSITION_REGISTRY_ADDRESS   — Deployed PositionRegistry contract address
 *   SP1_PRIVATE_KEY             — Private key for on-chain submission
 *   ARBITRUM_SEPOLIA_RPC        — RPC URL
 *   AVANTIS_SERVICE_URL         — Avantis service base URL (for /positions)
 *   AVANTIS_API_BASE_URL        — Avantis API base URL (for history/metrics)
 *
 * @module lib/zk-prover
 */

import { spawn } from "child_process";
import * as path from "path";
import { ethers } from "ethers";
import {
  decodeAvantisOpenTradeId,
  encodeAvantisOpenTradeId,
  normalizeAlphaVenue,
  type SupportedAlphaVenue,
} from "./alpha-trade-reference";

// ============================================================================
// Config
// ============================================================================

const OSTIUM_SUBGRAPH_URL =
  "https://api.subgraph.ormilabs.com/api/public/67a599d5-c8d2-4cc4-9c4d-2975a97bc5d8/subgraphs/ost-prod/live/gn";

const SP1_PROVER_MODE = process.env.SP1_PROVER_MODE || ""; // "" = simulation

const SP1_HOST_BINARY = path.resolve(process.cwd(), "../ostium-trader-host");

const POSITION_REGISTRY_ADDRESS =
  process.env.POSITION_REGISTRY_ADDRESS || process.env.TRADER_REGISTRY_ADDRESS;
const ARBITRUM_SEPOLIA_RPC =
  process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
const SP1_PRIVATE_KEY = process.env.SP1_PRIVATE_KEY;

const AVANTIS_SERVICE_URL = process.env.AVANTIS_SERVICE_URL || "http://localhost:5003";
const AVANTIS_API_BASE_URL = process.env.AVANTIS_API_BASE_URL || "https://api.avantisfi.com";
const AVANTIS_SERVICE_FALLBACK_URLS = Array.from(
  new Set([AVANTIS_SERVICE_URL, "http://localhost:5003", "http://localhost:5004"])
);

const POSITION_REGISTRY_ABI = [
  "function verifyAlpha(bytes calldata publicValues, bytes calldata proofBytes) external",
  "function registry(bytes32 key) external view returns (uint32 tradeCount, uint32 winCount, int64 totalPnl, uint64 totalCollateral, uint64 startTimestamp, uint64 endTimestamp, uint64 featuredTradeId, uint32 featuredPairIndex, bool featuredIsBuy, uint32 featuredLeverage, uint64 featuredCollateral, uint128 featuredEntryPrice, bool featuredIsOpen, uint64 featuredTimestamp, uint256 verifiedAt)",
  "function getTraderAlphaCount(address trader) external view returns (uint256)",
  "function getTraderKeys(address trader) external view returns (bytes32[])",
];

// ============================================================================
// Types
// ============================================================================

interface SubgraphTrade {
  id: string;
  trader: string;
  index: string;
  isBuy: boolean;
  isOpen: boolean;
  collateral: string;
  leverage: string;
  openPrice: string;
  closePrice: string;
  timestamp: string;
  closeInitiated: string;
  funding: string;
  rollover: string;
  notional: string;
  pair: {
    id: string;
    from: string;
    to: string;
  };
}

interface AvantisPosition {
  market?: string;
  marketFull?: string;
  side?: "long" | "short" | string;
  collateral?: number | string;
  entryPrice?: number | string;
  leverage?: number | string;
  tradeId?: string | number;
  pairIndex?: string | number;
  tradeIndex?: string | number;
  timestamp?: number | string;
}

interface AvantisHistoryResponse {
  success?: boolean;
  portfolio?: any[];
  pageCount?: number;
}

export interface FeaturedPosition {
  trader: string;
  trade_id: number;
  pair_index: number;
  is_buy: boolean;
  leverage: string; // 2 decimals (e.g. "500" = 5x)
  collateral: string; // 6 decimals (USDC raw)
  entry_price: string; // 18 decimals
  is_open: boolean;
  timestamp: string;
}

export interface TraderMetrics {
  totalPnl: number;
  tradeCount: number;
  winCount: number;
  totalCollateral: number;
  startBlock: number | null;
  endBlock: number | null;
}

export interface FeaturedPositionResult {
  tradeId: number;
  pairIndex: number;
  isBuy: boolean;
  leverage: number;
  collateral: number;
  entryPrice: number;
  isOpen: boolean;
  timestamp: number;
}

export interface ProofGenerationOptions {
  venue?: SupportedAlphaVenue | string | null;
}

export interface ProofResult {
  success: boolean;
  venue: SupportedAlphaVenue;
  metrics: TraderMetrics;
  featured: FeaturedPositionResult | null;
  proofId: string | null;
  proof: string | null;
  publicValues: string | null;
  txHash: string | null;
  isSimulated: boolean;
  error?: string;
}

// ============================================================================
// Utility helpers
// ============================================================================

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function toFiniteInt(value: unknown, fallback = 0): number {
  const n = Math.trunc(toFiniteNumber(value, fallback));
  return Number.isFinite(n) ? n : fallback;
}

function decimalToScaledIntegerString(input: unknown, decimals: number): string {
  const raw = String(input ?? "").trim();
  if (!raw || raw.toLowerCase() === "nan" || raw.toLowerCase() === "infinity") {
    return "0";
  }

  const unsigned = raw.replace(/^[+-]/, "");
  const isNegative = raw.startsWith("-");
  if (isNegative) return "0";

  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw.replace(/[^0-9]/g, "") || "0";
  const fracPart = fracPartRaw.replace(/[^0-9]/g, "");
  const scaledFrac = (fracPart + "0".repeat(decimals)).slice(0, decimals);

  const joined = `${intPart}${scaledFrac}`.replace(/^0+/, "") || "0";
  return joined;
}

function normalizeTradeId(input?: string | number | null): string | null {
  if (input === undefined || input === null) return null;
  const v = String(input).trim();
  return v.length > 0 ? v : null;
}

function toChecksumAddressIfPossible(address: string): string {
  try {
    return ethers.utils.getAddress(String(address || "").trim());
  } catch {
    return String(address || "").trim();
  }
}

function resolveAvantisPositionIndices(position: AvantisPosition): {
  pairIndex: string | null;
  tradeIndex: string | null;
  rawTradeId: string | null;
  composite: string | null;
} {
  const rawPairIndex = normalizeTradeId(position.pairIndex);
  const rawTradeIndex = normalizeTradeId(position.tradeIndex);
  const rawTradeId = normalizeTradeId(position.tradeId);
  const parsedTradeId = decodeAvantisOpenTradeId(rawTradeId);

  const pairIndex = rawPairIndex || normalizeTradeId(parsedTradeId.pairIndex);
  const tradeIndex = rawTradeIndex || normalizeTradeId(parsedTradeId.tradeIndex) || rawTradeId;
  const composite = encodeAvantisOpenTradeId(pairIndex, tradeIndex);

  return {
    pairIndex,
    tradeIndex,
    rawTradeId,
    composite,
  };
}

function resolveAvantisTradeIdentifierFromPosition(position: AvantisPosition): string | null {
  const { pairIndex, tradeIndex, rawTradeId, composite } = resolveAvantisPositionIndices(position);
  if (composite) return composite;
  if (rawTradeId) return rawTradeId;
  return tradeIndex;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
}

function featuredPositionToResult(featured: FeaturedPosition): FeaturedPositionResult {
  return {
    tradeId: toFiniteInt(featured.trade_id, 0),
    pairIndex: toFiniteInt(featured.pair_index, 0),
    isBuy: Boolean(featured.is_buy),
    leverage: toFiniteNumber(featured.leverage) / 100,
    collateral: toFiniteNumber(featured.collateral) / 1e6,
    entryPrice: toFiniteNumber(featured.entry_price) / 1e18,
    isOpen: Boolean(featured.is_open),
    timestamp: toFiniteInt(featured.timestamp, 0),
  };
}

function emptyMetrics(): TraderMetrics {
  return {
    totalPnl: 0,
    tradeCount: 0,
    winCount: 0,
    totalCollateral: 0,
    startBlock: null,
    endBlock: null,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Request failed (${response.status}) ${method} ${url}: ${text.slice(0, 240)}`);
    }
    return (await response.json()) as T;
  } catch (error: any) {
    const causeCode = error?.cause?.code ? ` [${error.cause.code}]` : "";
    throw new Error(`Network error on ${method} ${url}: ${error?.message || String(error)}${causeCode}`);
  }
}

// ============================================================================
// Ostium subgraph queries
// ============================================================================

/**
 * Fetch ALL closed trades for a trader from the Ostium subgraph.
 */
async function fetchClosedTrades(traderAddress: string): Promise<SubgraphTrade[]> {
  const allTrades: SubgraphTrade[] = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    const query = `
      query GetClosedTrades($trader: String!, $first: Int!, $skip: Int!) {
        trades(
          where: {
            trader: $trader,
            isOpen: false
          }
          orderBy: timestamp
          orderDirection: desc
          first: $first
          skip: $skip
        ) {
          id
          trader
          index
          isBuy
          isOpen
          collateral
          leverage
          openPrice
          closePrice
          timestamp
          closeInitiated
          funding
          rollover
          notional
          pair {
            id
            from
            to
          }
        }
      }
    `;

    let response: Response;
    try {
      response = await fetch(OSTIUM_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: {
            trader: traderAddress.toLowerCase(),
            first: batchSize,
            skip,
          },
        }),
      });
    } catch (e: any) {
      console.error("[sp1] Fetch failed at URL:", OSTIUM_SUBGRAPH_URL, e);
      throw e;
    }

    const result = (await response.json()) as {
      data?: { trades: SubgraphTrade[] };
      errors?: any[];
    };

    if (result.errors) {
      console.error("[sp1] Subgraph errors:", result.errors);
      throw new Error(`Subgraph query failed: ${JSON.stringify(result.errors)}`);
    }

    const trades = result.data?.trades || [];
    allTrades.push(...trades);

    if (trades.length < batchSize) break;
    skip += batchSize;

    if (allTrades.length >= 10000) break;
  }

  return allTrades;
}

/**
 * Fetch all open trades for a trader (for total collateral calculation).
 */
async function fetchOpenTrades(traderAddress: string): Promise<SubgraphTrade[]> {
  const query = `
    query GetOpenTrades($trader: String!, $first: Int!) {
      trades(
        where: {
          trader: $trader,
          isOpen: true
        }
        orderBy: timestamp
        orderDirection: desc
        first: $first
      ) {
        id
        trader
        index
        collateral
        leverage
        openPrice
        timestamp
        isBuy
        isOpen
        notional
        pair {
          id
          from
          to
        }
      }
    }
  `;

  let response: Response;
  try {
    response = await fetch(OSTIUM_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          trader: traderAddress.toLowerCase(),
          first: 1000,
        },
      }),
    });
  } catch (e: any) {
    console.error("[sp1] Open trades fetch failed:", e);
    throw e;
  }

  const result = (await response.json()) as {
    data?: { trades: SubgraphTrade[] };
    errors?: any[];
  };

  if (result.errors) {
    console.error("[sp1] Subgraph open trades errors:", result.errors);
    throw new Error("Subgraph query failed");
  }

  return result.data?.trades || [];
}

/**
 * Fetch a specific trade by its subgraph trade ID (index).
 * Returns the open trade matching the tradeId for the given trader.
 */
export async function fetchTradeById(
  traderAddress: string,
  tradeId: string
): Promise<SubgraphTrade | null> {
  const query = `
    query GetTradeById($tradeId: ID!) {
      trade(id: $tradeId) {
        id
        trader
        index
        isBuy
        isOpen
        collateral
        leverage
        openPrice
        closePrice
        timestamp
        closeInitiated
        funding
        rollover
        notional
        pair {
          id
          from
          to
        }
      }
    }
  `;

  let response: Response;
  try {
    response = await fetch(OSTIUM_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { tradeId },
      }),
    });
  } catch (e: any) {
    console.error("[sp1] Fetch trade by id failed:", e);
    throw e;
  }

  const result = (await response.json()) as {
    data?: { trade: SubgraphTrade | null };
    errors?: any[];
  };

  if (result.errors) {
    throw new Error(`Subgraph query failed: ${JSON.stringify(result.errors)}`);
  }

  const trade = result.data?.trade || null;
  if (trade && trade.trader.toLowerCase() !== traderAddress.toLowerCase()) {
    return null;
  }

  return trade;
}

/**
 * Convert a SubgraphTrade to the FeaturedPosition format expected by SP1.
 */
export function subgraphTradeToFeatured(trade: SubgraphTrade): FeaturedPosition {
  return {
    trader: trade.trader,
    trade_id: parseInt(trade.id, 10),
    pair_index: parseInt(trade.pair.id, 10),
    is_buy: trade.isBuy,
    leverage: trade.leverage,
    collateral: trade.collateral,
    entry_price: trade.openPrice,
    is_open: trade.isOpen,
    timestamp: trade.timestamp,
  };
}

// ============================================================================
// Avantis proof data providers
// ============================================================================

async function fetchAvantisPositions(traderAddress: string): Promise<AvantisPosition[]> {
  const errors: string[] = [];

  for (const baseUrl of AVANTIS_SERVICE_FALLBACK_URLS) {
    const url = `${baseUrl}/positions`;

    try {
      const payload = await fetchJson<any>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: traderAddress }),
      });

      if (!payload || payload.success !== true || !Array.isArray(payload.positions)) {
        errors.push(`Invalid response from ${url}`);
        continue;
      }

      return payload.positions as AvantisPosition[];
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }
  }

  throw new Error(
    `Failed to fetch Avantis positions for ${traderAddress}. Tried ${AVANTIS_SERVICE_FALLBACK_URLS.join(", ")}. ${errors.join(" | ")}`
  );
}

function mapAvantisHistoryRowToProofTrade(row: any, fallbackTrader: string): SubgraphTrade | null {
  const args = row?.event?.args || {};
  const trade = args?.t || {};

  const trader = String(trade?.trader || fallbackTrader).toLowerCase();
  const pairIndex = toFiniteInt(trade?.pairIndex, 0);
  const tradeIndex = toFiniteInt(trade?.index, 0);

  if (!trade || trader.length === 0) {
    return null;
  }

  const openPrice = decimalToScaledIntegerString(trade?.openPrice, 18);
  const closePrice = decimalToScaledIntegerString(args?.price ?? trade?.openPrice ?? 0, 18);

  return {
    id: String(row?._id || `${pairIndex}-${tradeIndex}-${trade?.timestamp || Date.now()}`),
    trader,
    index: String(tradeIndex),
    isBuy: Boolean(trade?.buy),
    isOpen: false,
    collateral: decimalToScaledIntegerString(trade?.initialPosToken, 6),
    leverage: decimalToScaledIntegerString(trade?.leverage, 2),
    openPrice,
    closePrice,
    timestamp: String(toFiniteInt(trade?.timestamp, 0)),
    closeInitiated: "0",
    funding: "0",
    rollover: "0",
    notional: decimalToScaledIntegerString(trade?.positionSizeUSDC || args?.positionSizeUSDC || 0, 6),
    pair: {
      id: String(pairIndex),
      from: String(trade?.fromSymbol || row?.market || `Pair-${pairIndex}`),
      to: "USD",
    },
  };
}

async function fetchAvantisClosedTrades(traderAddress: string): Promise<SubgraphTrade[]> {
  const trades: SubgraphTrade[] = [];
  let page = 1;
  let pageCount: number | null = null;
  const maxPages = 50;

  while (page <= maxPages) {
    const url = `${AVANTIS_API_BASE_URL}/v2/history/portfolio/history/${traderAddress}/${page}`;
    const payload = await fetchJson<AvantisHistoryResponse>(url);

    if (!payload || payload.success !== true) {
      throw new Error(`Invalid Avantis history payload at page ${page}`);
    }

    const rows = Array.isArray(payload.portfolio) ? payload.portfolio : [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const mapped = mapAvantisHistoryRowToProofTrade(row, traderAddress);
      if (mapped) trades.push(mapped);
    }

    if (pageCount === null) {
      pageCount = toFiniteInt(payload.pageCount, 0) || null;
    }

    if (pageCount !== null && page >= pageCount) {
      break;
    }

    page += 1;
  }

  return trades;
}

function avantisPositionToFeatured(position: AvantisPosition, traderAddress: string): FeaturedPosition {
  const resolved = resolveAvantisPositionIndices(position);
  const tradeId = toFiniteInt(resolved.tradeIndex, 0);
  const pairIndex = toFiniteInt(resolved.pairIndex, 0);

  return {
    trader: traderAddress.toLowerCase(),
    trade_id: Number.isFinite(tradeId) ? tradeId : 0,
    pair_index: pairIndex,
    is_buy: String(position.side || "").toLowerCase() !== "short",
    leverage: decimalToScaledIntegerString(position.leverage ?? 0, 2),
    collateral: decimalToScaledIntegerString(position.collateral ?? 0, 6),
    entry_price: decimalToScaledIntegerString(position.entryPrice ?? 0, 18),
    is_open: true,
    timestamp: String(toFiniteInt(position.timestamp, 0)),
  };
}

async function resolveAvantisFeaturedPosition(
  traderAddress: string,
  featuredTradeId?: string
): Promise<
  | {
      ok: true;
      featuredPosition: FeaturedPosition;
      openPositions: AvantisPosition[];
    }
  | {
      ok: false;
      error: string;
      openPositions: AvantisPosition[];
    }
> {
  const openPositions = await fetchAvantisPositions(traderAddress);

  if (featuredTradeId) {
    const requested = decodeAvantisOpenTradeId(featuredTradeId);
    const targetPair = requested.pairIndex;
    const targetTrade = requested.tradeIndex;
    const targetComposite = encodeAvantisOpenTradeId(targetPair, targetTrade);

    const matched = openPositions.find((position) => {
      const resolved = resolveAvantisPositionIndices(position);

      if (targetPair && targetTrade) {
        return (
          (resolved.pairIndex === targetPair && resolved.tradeIndex === targetTrade) ||
          (targetComposite !== null && resolved.rawTradeId === targetComposite) ||
          (targetComposite !== null && resolved.composite === targetComposite)
        );
      }

      if (targetTrade) {
        return (
          resolved.tradeIndex === targetTrade ||
          resolved.rawTradeId === targetTrade ||
          resolved.composite === targetTrade
        );
      }

      return false;
    });

    if (!matched) {
      return {
        ok: false,
        error: `Trade ${featuredTradeId} not found for trader ${traderAddress}. Use /avantis/positions tradeId format '<pairIndex>:<tradeIndex>'`,
        openPositions,
      };
    }

    return {
      ok: true,
      featuredPosition: avantisPositionToFeatured(matched, traderAddress),
      openPositions,
    };
  }

  if (openPositions.length > 0) {
    return {
      ok: true,
      featuredPosition: avantisPositionToFeatured(openPositions[0], traderAddress),
      openPositions,
    };
  }

  return {
    ok: true,
    featuredPosition: {
      trader: traderAddress.toLowerCase(),
      trade_id: 0,
      pair_index: 0,
      is_buy: false,
      leverage: "0",
      collateral: "0",
      entry_price: "0",
      is_open: false,
      timestamp: "0",
    },
    openPositions,
  };
}

async function fetchAvantisGroupedProfitLoss(traderAddress: string): Promise<{ totalPnl: number; totalCollateral: number }> {
  const url = `${AVANTIS_API_BASE_URL}/v2/history/portfolio/profit-loss/${traderAddress}/grouped`;
  const payload = await fetchJson<any>(url);

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  let totalPnl = 0;
  let totalCollateral = 0;

  for (const row of rows) {
    totalPnl += toFiniteNumber(row?.total, 0);
    totalCollateral += toFiniteNumber(row?.totalCollateral, 0);
  }

  return {
    totalPnl,
    totalCollateral,
  };
}

async function fetchAvantisGroupedTotalSize(traderAddress: string): Promise<{ totalSize: number; totalCollateral: number }> {
  const url = `${AVANTIS_API_BASE_URL}/v1/history/portfolio/total-size/${traderAddress}/grouped`;
  const payload = await fetchJson<any>(url);

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  let totalSize = 0;
  let totalCollateral = 0;

  for (const row of rows) {
    totalSize += toFiniteNumber(row?.total, 0);
    totalCollateral += toFiniteNumber(row?.totalCollateral, 0);
  }

  return {
    totalSize,
    totalCollateral,
  };
}

async function fetchAvantisGroupedWinRate(traderAddress: string): Promise<number> {
  const url = `${AVANTIS_API_BASE_URL}/v1/history/portfolio/win-rate/${traderAddress}/grouped`;
  const payload = await fetchJson<any>(url);

  const rows = Array.isArray(payload?.dataByPairIndex)
    ? payload.dataByPairIndex
    : Array.isArray(payload?.dataByPairGroup)
      ? payload.dataByPairGroup
      : [];

  const values = rows
    .map((row: any) => toFiniteNumber(row?.winRate, 0))
    .filter((value: number) => Number.isFinite(value));

  if (values.length === 0) return 0;

  const normalized = values.map((value: number) => (value <= 1 ? value * 100 : value));
  return average(normalized);
}

function openPositionsToTradeLikeRows(
  traderAddress: string,
  openPositions: AvantisPosition[]
): SubgraphTrade[] {
  return openPositions.map((position) => {
    const resolved = resolveAvantisPositionIndices(position);
    const pairIndex = toFiniteInt(resolved.pairIndex, 0);
    const tradeIndex = toFiniteInt(resolved.tradeIndex, 0);

    return {
      id: `open-${tradeIndex}-${pairIndex}`,
      trader: traderAddress.toLowerCase(),
      index: String(tradeIndex),
      isBuy: String(position.side || "").toLowerCase() !== "short",
      isOpen: true,
      collateral: decimalToScaledIntegerString(position.collateral ?? 0, 6),
      leverage: decimalToScaledIntegerString(position.leverage ?? 0, 2),
      openPrice: decimalToScaledIntegerString(position.entryPrice ?? 0, 18),
      closePrice: "0",
      timestamp: String(toFiniteInt(position.timestamp, 0)),
      closeInitiated: "0",
      funding: "0",
      rollover: "0",
      notional: "0",
      pair: {
        id: String(pairIndex),
        from: String(position.market || position.marketFull || `Pair-${pairIndex}`),
        to: "USD",
      },
    };
  });
}

async function computeAvantisMetrics(
  traderAddress: string,
  closedTrades: SubgraphTrade[],
  openPositions: AvantisPosition[]
): Promise<TraderMetrics> {
  const fallback = computeMetrics(closedTrades, openPositionsToTradeLikeRows(traderAddress, openPositions));

  const [profitLossResult, totalSizeResult, winRateResult] = await Promise.allSettled([
    fetchAvantisGroupedProfitLoss(traderAddress),
    fetchAvantisGroupedTotalSize(traderAddress),
    fetchAvantisGroupedWinRate(traderAddress),
  ]);

  if (profitLossResult.status === "rejected") {
    console.warn(`[sp1] Avantis grouped profit-loss failed for ${traderAddress}: ${profitLossResult.reason?.message || String(profitLossResult.reason)}`);
  }
  if (totalSizeResult.status === "rejected") {
    console.warn(`[sp1] Avantis grouped total-size failed for ${traderAddress}: ${totalSizeResult.reason?.message || String(totalSizeResult.reason)}`);
  }
  if (winRateResult.status === "rejected") {
    console.warn(`[sp1] Avantis grouped win-rate failed for ${traderAddress}: ${winRateResult.reason?.message || String(winRateResult.reason)}`);
  }

  const totalPnl =
    profitLossResult.status === "fulfilled"
      ? Math.round(profitLossResult.value.totalPnl * 100) / 100
      : fallback.totalPnl;

  const totalCollateral =
    totalSizeResult.status === "fulfilled" && totalSizeResult.value.totalCollateral > 0
      ? Math.round(totalSizeResult.value.totalCollateral * 100) / 100
      : profitLossResult.status === "fulfilled" && profitLossResult.value.totalCollateral > 0
        ? Math.round(profitLossResult.value.totalCollateral * 100) / 100
        : fallback.totalCollateral;

  const winRatePercent =
    winRateResult.status === "fulfilled" ? Math.max(0, Math.min(100, winRateResult.value)) :
      fallback.tradeCount > 0
        ? (fallback.winCount / fallback.tradeCount) * 100
        : 0;

  const tradeCount = closedTrades.length;
  const winCount = tradeCount > 0 ? Math.round((winRatePercent / 100) * tradeCount) : 0;

  const timestamps = closedTrades
    .map((trade) => toFiniteInt(trade.timestamp, 0))
    .filter((value) => value > 0);

  const startBlock = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const endBlock = timestamps.length > 0 ? Math.max(...timestamps) : null;

  return {
    totalPnl,
    tradeCount,
    winCount,
    totalCollateral,
    startBlock,
    endBlock,
  };
}

// ============================================================================
// Metric computation fallback (TypeScript; mirrors guest logic)
// ============================================================================

/**
 * Compute trader performance metrics from trade-level data.
 */
export function computeMetrics(
  closedTrades: SubgraphTrade[],
  openTrades: SubgraphTrade[] = []
): TraderMetrics {
  let totalPnl = 0;
  let winCount = 0;
  let totalCollateral = 0;

  for (const trade of closedTrades) {
    const collateral = Number(trade.collateral) / 1e6;
    totalCollateral += collateral;

    let tradePnl = 0;
    if (trade.closePrice && trade.openPrice) {
      const openPrice = Number(trade.openPrice) / 1e18;
      const closePrice = Number(trade.closePrice) / 1e18;
      const leverage = parseFloat(trade.leverage) / 100;

      if (openPrice > 0) {
        if (trade.isBuy) {
          tradePnl = collateral * leverage * ((closePrice - openPrice) / openPrice);
        } else {
          tradePnl = collateral * leverage * ((openPrice - closePrice) / openPrice);
        }
      }

      const fundingFee = trade.funding ? Number(trade.funding) / 1e18 : 0;
      const rolloverFee = trade.rollover ? Number(trade.rollover) / 1e18 : 0;
      tradePnl -= Math.abs(fundingFee) + Math.abs(rolloverFee);
    }

    totalPnl += tradePnl;
    if (tradePnl > 0) winCount += 1;
  }

  for (const trade of openTrades) {
    totalCollateral += Number(trade.collateral) / 1e6;
  }

  const allTimestamps = closedTrades
    .map((trade) => parseInt(trade.timestamp, 10))
    .filter((value) => !Number.isNaN(value));

  const startBlock = allTimestamps.length > 0 ? Math.min(...allTimestamps) : null;
  const endBlock = allTimestamps.length > 0 ? Math.max(...allTimestamps) : null;

  return {
    totalPnl: Math.round(totalPnl * 100) / 100,
    tradeCount: closedTrades.length,
    winCount,
    totalCollateral: Math.round(totalCollateral * 100) / 100,
    startBlock,
    endBlock,
  };
}

// ============================================================================
// SP1 proof generation
// ============================================================================

/**
 * Generate a ZK proof via the SP1 host binary.
 * Sends combined input (trades + featured position) to the host via stdin.
 */
async function generateSP1Proof(
  closedTrades: SubgraphTrade[],
  featuredPosition: FeaturedPosition,
  _metrics: TraderMetrics
): Promise<{
  proofId: string | null;
  proof: string | null;
  publicValues: string | null;
  txHash: string | null;
  isSimulated: boolean;
  featured: FeaturedPositionResult | null;
}> {
  if (!SP1_PROVER_MODE) {
    console.log("[sp1] No SP1_PROVER_MODE configured — using simulation mode");
    return {
      proofId: null,
      proof: null,
      publicValues: null,
      txHash: null,
      isSimulated: true,
      featured: featuredPositionToResult(featuredPosition),
    };
  }

  try {
    const guestTrades = closedTrades.map((trade) => ({
      trader: trade.trader,
      is_buy: trade.isBuy,
      collateral: trade.collateral,
      leverage: trade.leverage,
      open_price: trade.openPrice,
      close_price: trade.closePrice || "0",
      timestamp: trade.timestamp,
      funding: trade.funding || "0",
      rollover: trade.rollover || "0",
    }));

    const hostInput = {
      trades: guestTrades,
      featured: featuredPosition,
    };

    const inputJson = JSON.stringify(hostInput);

    console.log(
      `[sp1] Running SP1 host in '${SP1_PROVER_MODE}' mode with ${closedTrades.length} trades + featured tradeId = ${featuredPosition.trade_id}`
    );

    const result = await new Promise<any>((resolve, reject) => {
      const child = spawn(SP1_HOST_BINARY, ["--mode", SP1_PROVER_MODE], {
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("SP1 host timed out after 30 minutes"));
      }, 1_800_000);

      child.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on("close", (code: number | null) => {
        clearTimeout(timeout);

        if (stderr) {
          console.log(`[sp1] Host stderr: ${stderr}`);
        }

        if (code !== 0) {
          reject(new Error(`SP1 host exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const jsonStart = stdout.indexOf("{");
          const jsonEnd = stdout.lastIndexOf("}");
          if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error("No JSON object found in output");
          }
          const jsonStr = stdout.slice(jsonStart, jsonEnd + 1);
          resolve(JSON.parse(jsonStr));
        } catch {
          reject(new Error(`Failed to parse SP1 output: ${stdout.slice(0, 500)}`));
        }
      });

      child.stdin.write(inputJson);
      child.stdin.end();
    });

    if (!result.success) {
      throw new Error(result.error || "SP1 proof generation failed");
    }

    console.log(
      `[sp1] Proof generated: mode=${result.mode}, trades=${result.metrics.trade_count}, featured_tradeId=${result.featured?.trade_id}`
    );

    const featuredResult: FeaturedPositionResult | null = result.featured
      ? {
          tradeId: result.featured.trade_id,
          pairIndex: result.featured.pair_index,
          isBuy: result.featured.is_buy,
          leverage: result.featured.leverage,
          collateral: result.featured.collateral,
          entryPrice: result.featured.entry_price,
          isOpen: result.featured.is_open,
          timestamp: result.featured.timestamp,
        }
      : featuredPositionToResult(featuredPosition);

    return {
      proofId: result.vkey_hash || null,
      proof: result.proof || null,
      publicValues: result.public_values || null,
      txHash: null,
      isSimulated: result.mode === "execute",
      featured: featuredResult,
    };
  } catch (error: any) {
    console.error("[sp1] ZK proof generation failed:", error.message);
    console.log("[sp1] Falling back to simulation mode");
    return {
      proofId: null,
      proof: null,
      publicValues: null,
      txHash: null,
      isSimulated: true,
      featured: featuredPositionToResult(featuredPosition),
    };
  }
}

/**
 * Submits a generated SP1 proof to the PositionRegistry contract.
 */
export async function submitProofToRegistry(
  publicValues: string,
  proof: string
): Promise<string> {
  if (!POSITION_REGISTRY_ADDRESS || !SP1_PRIVATE_KEY) {
    throw new Error("Missing POSITION_REGISTRY_ADDRESS or SP1_PRIVATE_KEY in environment");
  }

  console.log(`[sp1] Submitting proof to registry at ${POSITION_REGISTRY_ADDRESS}...`);

  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
  const wallet = new ethers.Wallet(SP1_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(POSITION_REGISTRY_ADDRESS, POSITION_REGISTRY_ABI, wallet);

  const publicValuesHex = (publicValues.startsWith("0x") ? publicValues : `0x${publicValues}`).trim();
  const proofHex = (proof.startsWith("0x") ? proof : `0x${proof}`).trim();

  console.log(`[sp1] publicValues length: ${(publicValuesHex.length - 2) / 2} bytes`);
  console.log(`[sp1] proofBytes length: ${(proofHex.length - 2) / 2} bytes`);

  const tx = await contract.verifyAlpha(publicValuesHex, proofHex);
  console.log(`[sp1] Submission transaction sent: ${tx.hash}`);

  await tx.wait();
  console.log("[sp1] Submission verified on-chain");

  return tx.hash;
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Generate a proof of trading performance + a featured position.
 *
 * OSTIUM flow:
 * 1. Fetch closed trades from Ostium subgraph
 * 2. Resolve featured open trade from subgraph
 * 3. Compute metrics from trade-level data
 * 4. Generate SP1 proof
 *
 * AVANTIS flow:
 * 1. Fetch closed trades from Avantis history API
 * 2. Resolve featured open trade from Avantis /positions
 * 3. Compute display metrics from Avantis grouped profit-loss/win-rate APIs
 * 4. Generate SP1 proof from trade-level rows
 */
export async function generateProof(
  traderAddress: string,
  featuredTradeId?: string,
  options?: ProofGenerationOptions
): Promise<ProofResult> {
  const venue = normalizeAlphaVenue(options?.venue);

  try {
    console.log(
      `[sp1] Generating proof for trader=${traderAddress}, venue=${venue}${featuredTradeId ? `, featuredTradeId=${featuredTradeId}` : ""}`
    );

    if (venue === "AVANTIS") {
      const avantisTraderAddress = toChecksumAddressIfPossible(traderAddress);
      if (avantisTraderAddress !== traderAddress) {
        console.log(
          `[sp1] Normalized Avantis trader address ${traderAddress} -> ${avantisTraderAddress}`
        );
      }

      const [closedTrades, featuredResolution] = await Promise.all([
        fetchAvantisClosedTrades(avantisTraderAddress),
        resolveAvantisFeaturedPosition(avantisTraderAddress, featuredTradeId),
      ]);

      console.log(
        `[sp1] Avantis closed trades fetched: ${closedTrades.length} for ${avantisTraderAddress}`
      );

      if (featuredResolution.ok === false) {
        return {
          success: false,
          venue,
          metrics: emptyMetrics(),
          featured: null,
          proofId: null,
          proof: null,
          publicValues: null,
          txHash: null,
          isSimulated: true,
          error: featuredResolution.error,
        };
      }

      const metrics = await computeAvantisMetrics(
        avantisTraderAddress,
        closedTrades,
        featuredResolution.openPositions
      );

      console.log(
        `[sp1] Avantis metrics: pnl=${metrics.totalPnl}, trades=${metrics.tradeCount}, wins=${metrics.winCount}, collateral=${metrics.totalCollateral}`
      );

      const sp1Result = await generateSP1Proof(
        closedTrades,
        featuredResolution.featuredPosition,
        metrics
      );

      return {
        success: true,
        venue,
        metrics,
        featured: sp1Result.featured,
        proofId: sp1Result.proofId,
        txHash: sp1Result.txHash,
        isSimulated: sp1Result.isSimulated,
        proof: sp1Result.proof,
        publicValues: sp1Result.publicValues,
      };
    }

    // Default OSTIUM flow.
    const [closedTrades, openTrades] = await Promise.all([
      fetchClosedTrades(traderAddress),
      fetchOpenTrades(traderAddress),
    ]);

    console.log(`[sp1] Fetched ${closedTrades.length} closed, ${openTrades.length} open trades`);

    let featuredPosition: FeaturedPosition;

    if (featuredTradeId) {
      const trade = await fetchTradeById(traderAddress, featuredTradeId);
      if (!trade) {
        return {
          success: false,
          venue,
          metrics: emptyMetrics(),
          featured: null,
          proofId: null,
          proof: null,
          publicValues: null,
          txHash: null,
          isSimulated: true,
          error: `Trade ${featuredTradeId} not found for trader ${traderAddress}`,
        };
      }

      if (!trade.isOpen) {
        return {
          success: false,
          venue,
          metrics: emptyMetrics(),
          featured: null,
          proofId: null,
          proof: null,
          publicValues: null,
          txHash: null,
          isSimulated: true,
          error: `Trade ${featuredTradeId} is not open — can only feature open positions`,
        };
      }

      featuredPosition = subgraphTradeToFeatured(trade);
    } else if (openTrades.length > 0) {
      featuredPosition = subgraphTradeToFeatured(openTrades[0]);
      console.log(`[sp1] No tradeId specified, using most recent open trade: ${featuredPosition.trade_id}`);
    } else {
      featuredPosition = {
        trader: traderAddress.toLowerCase(),
        trade_id: 0,
        pair_index: 0,
        is_buy: false,
        leverage: "0",
        collateral: "0",
        entry_price: "0",
        is_open: false,
        timestamp: "0",
      };
      console.log("[sp1] No open trades, using empty featured position");
    }

    const metrics = computeMetrics(closedTrades, openTrades);
    console.log(
      `[sp1] Computed metrics: PnL=${metrics.totalPnl}, trades=${metrics.tradeCount}, wins=${metrics.winCount}, collateral=${metrics.totalCollateral}`
    );

    const sp1Result = await generateSP1Proof(closedTrades, featuredPosition, metrics);

    return {
      success: true,
      venue,
      metrics,
      featured: sp1Result.featured,
      proofId: sp1Result.proofId,
      txHash: sp1Result.txHash,
      isSimulated: sp1Result.isSimulated,
      proof: sp1Result.proof,
      publicValues: sp1Result.publicValues,
    };
  } catch (error: any) {
    console.error("[sp1] Proof generation failed:", error.message);
    return {
      success: false,
      venue,
      metrics: emptyMetrics(),
      featured: null,
      proofId: null,
      proof: null,
      publicValues: null,
      txHash: null,
      isSimulated: true,
      error: error.message,
    };
  }
}

/**
 * Check if SP1 prover is configured.
 */
export function isSP1Configured(): boolean {
  return !!SP1_PROVER_MODE;
}

/**
 * Get the current SP1 configuration status.
 */
export function getProverConfig() {
  return {
    mode: SP1_PROVER_MODE || "simulation",
    hostBinary: SP1_HOST_BINARY,
    isConfigured: !!SP1_PROVER_MODE,
  };
}
