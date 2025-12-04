/**
 * Symbol Mapper
 *
 * Maps Ostium venue symbols to Finnhub API symbols
 * Different providers use different ticker formats
 */

import { AssetType, SymbolMapping } from "./types";

/**
 * Mapping configuration for Ostium symbols to Finnhub tickers
 * Finnhub uses standard market symbols
 */
const FINNHUB_SYMBOL_MAP: Record<
  string,
  { symbol: string; assetType: AssetType }
> = {
  // Indices - Use index symbols
  SPX: { symbol: "^GSPC", assetType: "indices" }, // S&P 500
  DJI: { symbol: "^DJI", assetType: "indices" }, // Dow Jones
  NDX: { symbol: "^NDX", assetType: "indices" }, // NASDAQ 100
  NIK: { symbol: "^N225", assetType: "indices" }, // Nikkei 225
  FTSE: { symbol: "^FTSE", assetType: "indices" }, // FTSE 100
  DAX: { symbol: "^GDAXI", assetType: "indices" }, // DAX
  HSI: { symbol: "^HSI", assetType: "indices" }, // Hang Seng

  // Stocks - Use standard ticker symbols
  NVDA: { symbol: "NVDA", assetType: "stocks" },
  GOOG: { symbol: "GOOGL", assetType: "stocks" }, // Finnhub uses GOOGL
  AMZN: { symbol: "AMZN", assetType: "stocks" },
  META: { symbol: "META", assetType: "stocks" },
  TSLA: { symbol: "TSLA", assetType: "stocks" },
  AAPL: { symbol: "AAPL", assetType: "stocks" },
  MSFT: { symbol: "MSFT", assetType: "stocks" },
  COIN: { symbol: "COIN", assetType: "stocks" },
  HOOD: { symbol: "HOOD", assetType: "stocks" },
  MSTR: { symbol: "MSTR", assetType: "stocks" },
  // Note: CRCL, BMNR, SBET, GLXY may not be available on Finnhub

  // Forex - Use OANDA format for Finnhub
  EUR: { symbol: "OANDA:EUR_USD", assetType: "forex" },
  GBP: { symbol: "OANDA:GBP_USD", assetType: "forex" },
  USD: { symbol: "OANDA:USD_CHF", assetType: "forex" }, // USD/CHF
  AUD: { symbol: "OANDA:AUD_USD", assetType: "forex" },
  NZD: { symbol: "OANDA:NZD_USD", assetType: "forex" },

  // Commodities - Finnhub commodity symbols vary
  XAU: { symbol: "OANDA:XAU_USD", assetType: "commodities" }, // Gold
  XAG: { symbol: "OANDA:XAG_USD", assetType: "commodities" }, // Silver
  CL: { symbol: "OANDA:WTICO_USD", assetType: "commodities" }, // Crude Oil (WTI)
  HG: { symbol: "OANDA:XCU_USD", assetType: "commodities" }, // Copper
  XPD: { symbol: "OANDA:XPD_USD", assetType: "commodities" }, // Palladium
  XPT: { symbol: "OANDA:XPT_USD", assetType: "commodities" }, // Platinum
};

/**
 * Alternative stock symbol lookup for news
 * Finnhub news API uses plain stock symbols without exchange prefix
 */
const FINNHUB_NEWS_SYMBOL_MAP: Record<string, string> = {
  SPX: "SPY", // S&P 500 ETF for news
  DJI: "DIA", // Dow Jones ETF for news
  NDX: "QQQ", // NASDAQ 100 ETF for news
  NIK: "EWJ", // Japan ETF for news
  FTSE: "EWU", // UK ETF for news
  DAX: "EWG", // Germany ETF for news
  HSI: "EWH", // Hong Kong ETF for news
  XAU: "GLD", // Gold ETF for news
  XAG: "SLV", // Silver ETF for news
  CL: "USO", // Oil ETF for news
  HG: "CPER", // Copper ETF for news
  // Forex doesn't have direct news - use currency ETFs
  EUR: "FXE",
  GBP: "FXB",
  AUD: "FXA",
};

/**
 * Get Finnhub symbol for a given Ostium symbol
 */
export function getFinnhubSymbol(ostiumSymbol: string): string | null {
  const mapping = FINNHUB_SYMBOL_MAP[ostiumSymbol.toUpperCase()];
  return mapping?.symbol || null;
}

/**
 * Get Finnhub news symbol for a given Ostium symbol
 * Uses ETF proxies for indices/commodities since Finnhub news works best with stocks
 */
export function getFinnhubNewsSymbol(ostiumSymbol: string): string | null {
  const upper = ostiumSymbol.toUpperCase();

  // Check if there's a specific news symbol mapping
  if (FINNHUB_NEWS_SYMBOL_MAP[upper]) {
    return FINNHUB_NEWS_SYMBOL_MAP[upper];
  }

  // For stocks, use the direct symbol
  const mapping = FINNHUB_SYMBOL_MAP[upper];
  if (mapping?.assetType === "stocks") {
    // Strip any prefix for news API
    return mapping.symbol.replace(/^[A-Z]+:/, "");
  }

  return null;
}

/**
 * Get asset type for a symbol
 */
export function getAssetType(ostiumSymbol: string): AssetType | null {
  const mapping = FINNHUB_SYMBOL_MAP[ostiumSymbol.toUpperCase()];
  return mapping?.assetType || null;
}

/**
 * Get full symbol mapping
 */
export function getSymbolMapping(
  ostiumSymbol: string,
  marketName: string
): SymbolMapping | null {
  const finnhubSymbol = getFinnhubSymbol(ostiumSymbol);
  const assetType = getAssetType(ostiumSymbol);

  if (!finnhubSymbol || !assetType) {
    return null;
  }

  return {
    ostiumSymbol: ostiumSymbol.toUpperCase(),
    providerSymbol: finnhubSymbol,
    assetType,
    marketName,
  };
}

/**
 * Get all supported non-crypto symbols
 */
export function getSupportedNonCryptoSymbols(): string[] {
  return Object.entries(FINNHUB_SYMBOL_MAP)
    .filter(([_, value]) => value.assetType !== "crypto")
    .map(([key, _]) => key);
}

/**
 * Check if a symbol is supported
 */
export function isSymbolSupported(ostiumSymbol: string): boolean {
  return ostiumSymbol.toUpperCase() in FINNHUB_SYMBOL_MAP;
}
