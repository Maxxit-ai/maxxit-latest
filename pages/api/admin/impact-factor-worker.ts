import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { prisma } from "@maxxit/database";

/**
 * Admin endpoint to run the Influencer Impact Factor worker logic once.
 *
 * This route owns:
 * - All Prisma CRUD on `telegram_posts`
 * - All CoinGecko OHLC fetching and MFE/MAE calculations
 * - Final impact_factor computation and persistence
 *
 * The external worker service should ONLY call this API (no direct DB or CoinGecko access).
 */

// CoinGecko API key (read only inside Next.js / Vercel env)
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";

// Path to static CoinGecko coins list JSON (same file the worker previously used)
// Resolved from repo root so it works in Next.js runtime as well.
const COINGECKO_CACHE_FILE = path.join(
  process.cwd(),
  "services",
  "coingecko-coins-cache.json"
);

// Default values for signals without TP/SL/timeline
const DEFAULT_TAKE_PROFIT_PCT = 10; // 10%
const DEFAULT_STOP_LOSS_PCT = 5; // 5%
const DEFAULT_TIMELINE_DAYS = 7; // 7 days

// Trade states
type TradeState =
  | "OPEN"
  | "CLOSED_TP"
  | "CLOSED_PARTIAL_TP"
  | "CLOSED_SL"
  | "CLOSED_TIME";

// Well-known major coins mapping (same as worker)
const MAJOR_COINS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  BNB: "binancecoin",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  LTC: "litecoin",
  TRX: "tron",
  SHIB: "shiba-inu",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  PEPE: "pepe",
  HBAR: "hedera-hashgraph",
  FIL: "filecoin",
  ICP: "internet-computer",
  VET: "vechain",
  AAVE: "aave",
  MKR: "maker",
  GRT: "the-graph",
  FTM: "fantom",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  CRV: "curve-dao-token",
  SNX: "havven",
  COMP: "compound-governance-token",
  YFI: "yearn-finance",
  SUSHI: "sushi",
  "1INCH": "1inch",
  ENS: "ethereum-name-service",
  LDO: "lido-dao",
  RPL: "rocket-pool",
  IMX: "immutable-x",
  GMX: "gmx",
  BLUR: "blur",
  WLD: "worldcoin-wld",
  SEI: "sei-network",
  TIA: "celestia",
  INJ: "injective-protocol",
  RUNE: "thorchain",
  KAVA: "kava",
  ALGO: "algorand",
  XLM: "stellar",
  EOS: "eos",
  XTZ: "tezos",
  FLOW: "flow",
  EGLD: "elrond-erd-2",
  HYPE: "hyperliquid",
};

// In-memory cache for CoinGecko coin list (per lambda/container)
let coinGeckoIdMap: Map<string, string> | null = null;

/**
 * Load CoinGecko coins list from the static JSON file
 */
async function loadCoinGeckoIdMap(): Promise<void> {
  if (coinGeckoIdMap) {
    // already loaded in this runtime
    return;
  }

  try {
    console.log("[ImpactFactorAPI][CoinGecko] Loading coins list from static JSON file...");
    const fileContent = await fs.readFile(COINGECKO_CACHE_FILE, "utf-8");
    const cachedData = JSON.parse(fileContent) as {
      timestamp: number;
      coins: Array<{ id: string; symbol: string; name: string }>;
    };

    coinGeckoIdMap = new Map<string, string>();

    for (const [symbol, id] of Object.entries(MAJOR_COINS)) {
      coinGeckoIdMap.set(symbol, id);
    }

    for (const coin of cachedData.coins) {
      const symbolUpper = coin.symbol.toUpperCase();
      if (!coinGeckoIdMap.has(symbolUpper)) {
        coinGeckoIdMap.set(symbolUpper, coin.id);
      }
    }

    console.log(
      `[ImpactFactorAPI][CoinGecko] ✅ Loaded ${coinGeckoIdMap.size} coin mappings`
    );
  } catch (error: any) {
    console.error(
      "[ImpactFactorAPI][CoinGecko] ❌ Failed to load coins list:",
      error.message
    );
    throw new Error(
      `CoinGecko cache file not found: ${COINGECKO_CACHE_FILE}`
    );
  }
}

/**
 * Map token symbol to CoinGecko ID
 */
function getCoinGeckoId(symbol: string): string | null {
  if (!coinGeckoIdMap) return null;
  const symbolUpper = symbol.toUpperCase();
  return coinGeckoIdMap.get(symbolUpper) || symbol.toLowerCase();
}

/**
 * Calculate days between two dates
 */
function getDaysBetween(startDate: Date, endDate: Date): number {
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Fetch OHLC data from CoinGecko for the ENTIRE trade duration
 * CRITICAL: Fetch from signal creation date to NOW, not just last 24h
 * Returns { high, low, currentPrice } for the period
 */
async function fetchOHLCData(
  tokenSymbol: string,
  signalDate: Date
): Promise<{ high: number; low: number; currentPrice: number } | null> {
  try {
    const coinGeckoId = getCoinGeckoId(tokenSymbol);
    if (!coinGeckoId) {
      console.warn(
        `[ImpactFactorAPI][CoinGecko] Could not resolve ID for ${tokenSymbol}`
      );
      return null;
    }

    const now = new Date();
    const daysElapsed = getDaysBetween(signalDate, now);

    let days: number;
    if (daysElapsed <= 1) days = 1;
    else if (daysElapsed <= 7) days = 7;
    else if (daysElapsed <= 14) days = 14;
    else if (daysElapsed <= 30) days = 30;
    else if (daysElapsed <= 90) days = 90;
    else if (daysElapsed <= 180) days = 180;
    else days = 365;

    const url = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/ohlc?vs_currency=usd&days=${days}`;
    console.log(
      `[ImpactFactorAPI][CoinGecko] Fetching OHLC for ${tokenSymbol} (${coinGeckoId}) - ${days} days from signal date`
    );

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    };

    if (COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.warn(
        `[ImpactFactorAPI][CoinGecko] Failed to fetch OHLC: ${response.status}`
      );
      return null;
    }

    // OHLC format: [[timestamp, open, high, low, close], ...]
    const data = (await response.json()) as Array<
      [number, number, number, number, number]
    >;

    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn(
        `[ImpactFactorAPI][CoinGecko] No OHLC data for ${tokenSymbol}`
      );
      return null;
    }

    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (const candle of data) {
      const [, , high, low] = candle;
      if (high > highestHigh) highestHigh = high;
      if (low < lowestLow) lowestLow = low;
    }

    const currentPrice = data[data.length - 1][4]; // close price of last candle

    console.log(
      `[ImpactFactorAPI][CoinGecko] ${tokenSymbol} OHLC (${days}d): High=$${highestHigh.toFixed(
        2
      )}, Low=$${lowestLow.toFixed(2)}, Current=$${currentPrice.toFixed(2)}`
    );

    return { high: highestHigh, low: lowestLow, currentPrice };
  } catch (error: any) {
    console.error(
      `[ImpactFactorAPI][CoinGecko] Error fetching OHLC for ${tokenSymbol}:`,
      error.message
    );
    return null;
  }
}

/**
 * Calculate MFE (Maximum Favorable Excursion) as percentage
 */
function calculateMFE(
  entryPrice: number,
  highestPrice: number,
  lowestPrice: number,
  isLong: boolean
): number {
  if (isLong) {
    return ((highestPrice - entryPrice) / entryPrice) * 100;
  } else {
    // For SHORT: favorable if price goes down
    return ((entryPrice - lowestPrice) / entryPrice) * 100;
  }
}

/**
 * Calculate MAE (Maximum Adverse Excursion) as percentage
 */
function calculateMAE(
  entryPrice: number,
  lowestPrice: number,
  highestPrice: number,
  isLong: boolean
): number {
  if (isLong) {
    // For LONG: adverse if price goes down
    return ((entryPrice - lowestPrice) / entryPrice) * 100;
  } else {
    // For SHORT: adverse if price goes up
    return ((highestPrice - entryPrice) / entryPrice) * 100;
  }
}

/**
 * Get MFE bonus based on standardized table
 */
function getMFEBonus(mfePct: number): number {
  if (mfePct >= 15) return 0.5; // ≥ +15%
  if (mfePct >= 8) return 0.3; // 8-15%
  if (mfePct >= 4) return 0.1; // 4-8%
  return 0; // <4%
}

/**
 * Get MAE penalty based on standardized table
 */
function getMAEPenalty(maePct: number): number {
  if (maePct > 6) return 0.5; // >6%
  if (maePct >= 4) return 0.3; // 4-6%
  if (maePct >= 2) return 0.1; // 2-4%
  return 0; // <2%
}

/**
 * Get Trade Outcome Score (TOS) based on final state and P&L
 */
function getTOS(pnlPct: number, state: TradeState, tpPct: number): number {
  if (state === "CLOSED_TP") return 1.0;
  if (state === "CLOSED_SL") return -1.0;

  // Partial TP (≥ +6% but didn't hit full TP)
  if (state === "CLOSED_PARTIAL_TP" || (pnlPct >= 6 && pnlPct < tpPct)) {
    return 0.5;
  }

  // Time-stopped trades
  if (state === "CLOSED_TIME") {
    if (pnlPct >= -3 && pnlPct <= 3) return 0; // Breakeven
    if (pnlPct < -3 && pnlPct >= -5) return -0.5; // Time stop loss
  }

  return 0;
}

/**
 * Determine trade state based on high/low prices vs TP/SL and time
 * - Checks TP/SL over ENTIRE trade duration (path-dependent via high/low)
 * - Then checks timeline expiry (7 days by default)
 */
function determineTradeState(
  high: number,
  low: number,
  currentPrice: number,
  entryPrice: number,
  tpPct: number,
  slPct: number,
  messageDate: Date,
  timelineDays: number,
  isLong: boolean
): TradeState {
  const now = new Date();
  const expiryDate = new Date(messageDate);
  expiryDate.setDate(expiryDate.getDate() + timelineDays);

  const tpPrice = isLong
    ? entryPrice * (1 + tpPct / 100)
    : entryPrice * (1 - tpPct / 100);

  const slPrice = isLong
    ? entryPrice * (1 - slPct / 100)
    : entryPrice * (1 + slPct / 100);

  const isExpired = now >= expiryDate;

  // PRIORITY 1: Check if TP/SL hit during ENTIRE period
  if (isLong) {
    if (high >= tpPrice) return "CLOSED_TP";
    if (low <= slPrice) return "CLOSED_SL";
  } else {
    if (low <= tpPrice) return "CLOSED_TP";
    if (high >= slPrice) return "CLOSED_SL";
  }

  // PRIORITY 2: If neither TP/SL hit, check if timeline expired
  if (isExpired) {
    const finalPnl = isLong
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

    // Check if current price at expiry itself satisfies TP
    if (isLong) {
      if (currentPrice >= tpPrice) return "CLOSED_TP";
    } else {
      if (currentPrice <= tpPrice) return "CLOSED_TP";
    }

    // Partial TP at expiry
    if (finalPnl >= 6 && finalPnl < tpPct) {
      return "CLOSED_PARTIAL_TP";
    }

    return "CLOSED_TIME";
  }

  return "OPEN";
}

/**
 * Parse timeline_window to number of days
 */
function parseTimelineDays(timelineWindow: string | null): number {
  if (!timelineWindow) return DEFAULT_TIMELINE_DAYS;

  const daysMatch = timelineWindow.match(/(\d+)\s*day/i);
  if (daysMatch) return parseInt(daysMatch[1], 10);

  const date = new Date(timelineWindow);
  if (!isNaN(date.getTime())) {
    const now = new Date();
    const diffDays = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(1, diffDays);
  }

  return DEFAULT_TIMELINE_DAYS;
}

/**
 * Core logic: process and update impact_factor for all active signals.
 * This is the same logic that previously lived in the worker service.
 */
async function processImpactFactorOnce() {
  console.log(
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );
  console.log(
    "  📊 IMPACT FACTOR WORKER (24-Hour Cycle) - API EXECUTION"
  );
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    await loadCoinGeckoIdMap();

    const signals = await prisma.telegram_posts.findMany({
      where: {
        impact_factor_flag: true,
        is_signal_candidate: true,
        token_price: { not: null },
        extracted_tokens: { isEmpty: false },
      },
      select: {
        id: true,
        extracted_tokens: true,
        token_price: true,
        signal_type: true,
        pnl: true,
        message_created_at: true,
        take_profit: true,
        stop_loss: true,
        timeline_window: true,
        max_favorable_excursion: true,
        max_adverse_excursion: true,
      },
      orderBy: {
        message_created_at: "asc",
      },
      take: 100,
    });

    if (signals.length === 0) {
      console.log("✅ No active signals to monitor\n");
      return;
    }

    console.log(
      `📋 Found ${signals.length} active signal(s) to evaluate\n`
    );

    let totalProcessed = 0;
    let totalClosed = 0;
    let totalErrors = 0;

    for (const signal of signals) {
      try {
        if (!signal.extracted_tokens?.length || !signal.token_price) {
          continue;
        }

        const primaryToken = signal.extracted_tokens[0].toUpperCase();
        const entryPrice = signal.token_price;
        const isLong = signal.signal_type !== "SHORT";

        const tpPct =
          signal.take_profit && signal.take_profit > 0
            ? signal.take_profit
            : DEFAULT_TAKE_PROFIT_PCT;
        const slPct =
          signal.stop_loss && signal.stop_loss > 0
            ? signal.stop_loss
            : DEFAULT_STOP_LOSS_PCT;
        const timelineDays = parseTimelineDays(signal.timeline_window);

        console.log(
          `[Signal ${signal.id}] ${primaryToken} | Entry: $${entryPrice} | TP: ${tpPct}% | SL: ${slPct}% | Timeline: ${timelineDays}d`
        );

        const ohlcData = await fetchOHLCData(
          primaryToken,
          signal.message_created_at
        );
        if (!ohlcData) {
          console.log(
            `[Signal ${signal.id}] ⚠️ Could not fetch OHLC data, skipping`
          );
          totalErrors++;
          continue;
        }

        const { high, low, currentPrice } = ohlcData;

        const mfe = calculateMFE(entryPrice, high, low, isLong);
        const mae = calculateMAE(entryPrice, low, high, isLong);

        const prevMaxMFE = signal.max_favorable_excursion
          ? parseFloat(signal.max_favorable_excursion.toString())
          : 0;
        const prevMaxMAE = signal.max_adverse_excursion
          ? parseFloat(signal.max_adverse_excursion.toString())
          : 0;

        const lifetimeMFE = Math.max(mfe, prevMaxMFE);
        const lifetimeMAE = Math.max(mae, prevMaxMAE);

        console.log(
          `[Signal ${signal.id}] Current MFE: ${mfe.toFixed(
            2
          )}% | Lifetime MFE: ${lifetimeMFE.toFixed(2)}%`
        );
        console.log(
          `[Signal ${signal.id}] Current MAE: ${mae.toFixed(
            2
          )}% | Lifetime MAE: ${lifetimeMAE.toFixed(2)}%`
        );

        const state = determineTradeState(
          high,
          low,
          currentPrice,
          entryPrice,
          tpPct,
          slPct,
          signal.message_created_at,
          timelineDays,
          isLong
        );

        let pnlPct: number;
        if (state === "CLOSED_TP") {
          pnlPct = tpPct;
        } else if (state === "CLOSED_SL") {
          pnlPct = -slPct;
        } else if (state === "CLOSED_PARTIAL_TP") {
          pnlPct = isLong
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - currentPrice) / entryPrice) * 100;
        } else {
          pnlPct = isLong
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - currentPrice) / entryPrice) * 100;
        }

        console.log(
          `[Signal ${signal.id}] MFE: ${mfe.toFixed(2)}% | MAE: ${mae.toFixed(
            2
          )}% | P&L: ${pnlPct.toFixed(2)}% | State: ${state}`
        );

        if (state !== "OPEN") {
          const tos = getTOS(pnlPct, state, tpPct);
          const mfeBonus = getMFEBonus(lifetimeMFE);
          const maePenalty = getMAEPenalty(lifetimeMAE);
          const impactFactor = tos + mfeBonus - maePenalty;

          console.log(
            `[Signal ${signal.id}] ✅ CLOSED | TOS: ${tos.toFixed(
              2
            )} | MFE Bonus: ${mfeBonus.toFixed(
              2
            )} | MAE Penalty: ${maePenalty.toFixed(
              2
            )} | Impact Factor: ${impactFactor.toFixed(2)}`
          );

          await prisma.telegram_posts.update({
            where: { id: signal.id },
            data: {
              pnl: pnlPct,
              impact_factor_flag: false,
              max_favorable_excursion: lifetimeMFE,
              max_adverse_excursion: lifetimeMAE,
              impact_factor: impactFactor,
            },
          });

          totalClosed++;
        } else {
          await prisma.telegram_posts.update({
            where: { id: signal.id },
            data: {
              pnl: pnlPct,
              max_favorable_excursion: lifetimeMFE,
              max_adverse_excursion: lifetimeMAE,
            },
          });

          console.log(
            `[Signal ${signal.id}] ⏳ Still OPEN, continuing to monitor...`
          );
        }

        totalProcessed++;

        // Be nice to CoinGecko free tier
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (error: any) {
        totalErrors++;
        console.error(
          `[Signal ${signal.id}] ❌ Error:`,
          error.message
        );
      }
    }

    console.log(
      "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log("📊 PROCESSING SUMMARY");
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log(`  Signals Evaluated: ${totalProcessed}`);
    console.log(`  Trades Closed: ${totalClosed}`);
    console.log(`  Still Open: ${totalProcessed - totalClosed}`);
    console.log(`  Errors: ${totalErrors}`);
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    );
  } catch (error: any) {
    console.error(
      "[ImpactFactorAPI] ❌ Fatal error while processing impact factor:",
      error.message
    );
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await processImpactFactorOnce();
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

