import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";

/**
 * GET endpoint: Fetch OHLC data from CoinGecko for a token
 * Worker calls this to get price data for calculations
 * 
 * Query params:
 * - tokenSymbol: string (required)
 * - signalDate: ISO date string (required)
 */

// CoinGecko API key (read only inside Next.js / Vercel env)
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";

// Path to static CoinGecko coins list JSON
const COINGECKO_CACHE_FILE = path.join(
  process.cwd(),
  "services",
  "coingecko-coins-cache.json"
);

// Well-known major coins mapping
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
    return;
  }

  try {
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
  } catch (error: any) {
    console.error("[ImpactFactorAPI] Failed to load CoinGecko cache:", error.message);
    throw new Error(`CoinGecko cache file not found: ${COINGECKO_CACHE_FILE}`);
  }
}

/**
 * Map token symbol to CoinGecko ID
 * TODO: For duplicate symbols, prioritize by market cap/volume via CoinGecko search API
 */
function getCoinGeckoId(symbol: string): string | null {
  if (!coinGeckoIdMap) return null;
  const symbolUpper = symbol.toUpperCase();
  const result = coinGeckoIdMap.get(symbolUpper);
  return result || symbol.toLowerCase();
}

/**
 * Calculate days between two dates
 */
function getDaysBetween(startDate: Date, endDate: Date): number {
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tokenSymbol, signalDate } = req.query;

  if (!tokenSymbol || typeof tokenSymbol !== "string") {
    return res.status(400).json({ error: "tokenSymbol query param required" });
  }

  if (!signalDate || typeof signalDate !== "string") {
    return res.status(400).json({ error: "signalDate query param required" });
  }

  try {
    await loadCoinGeckoIdMap();

    const coinGeckoId = getCoinGeckoId(tokenSymbol);
    if (!coinGeckoId) {
      return res.status(404).json({ error: `Could not resolve CoinGecko ID for ${tokenSymbol}` });
    }

    const signalDateObj = new Date(signalDate);
    const now = new Date();
    const daysElapsed = getDaysBetween(signalDateObj, now);

    let days: number;
    if (daysElapsed <= 1) days = 1;
    else if (daysElapsed <= 7) days = 7;
    else if (daysElapsed <= 14) days = 14;
    else if (daysElapsed <= 30) days = 30;
    else if (daysElapsed <= 90) days = 90;
    else if (daysElapsed <= 180) days = 180;
    else days = 365;

    const url = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/ohlc?vs_currency=usd&days=${days}`;

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    };

    if (COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `CoinGecko API failed: ${response.status}` 
      });
    }

    // OHLC format: [[timestamp, open, high, low, close], ...]
    const data = (await response.json()) as Array<
      [number, number, number, number, number]
    >;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: `No OHLC data for ${tokenSymbol}` });
    }

    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (const candle of data) {
      const [, , high, low] = candle;
      if (high > highestHigh) highestHigh = high;
      if (low < lowestLow) lowestLow = low;
    }

    const currentPrice = data[data.length - 1][4]; // close price of last candle

    return res.status(200).json({
      high: highestHigh,
      low: lowestLow,
      currentPrice,
    });
  } catch (error: any) {
    console.error("[OHLC API] Error fetching OHLC:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}
