/**
 * Yahoo Finance Wrapper
 *
 * Fetches market data from Yahoo Finance API and generates trading signals
 * based on technical indicators (price movements, volume, trends)
 */

// Dynamic import for ESM module
let yahooFinance: any = null;

async function getYahooFinance() {
  if (!yahooFinance) {
    // @ts-ignore - yahoo-finance2 is ESM-only, dynamic import works at runtime
    const module = await import("yahoo-finance2");

    // yahoo-finance2 exports a default class that needs to be instantiated
    const YahooFinanceClass: any = module.default;

    // Instantiate the class with 'new'
    if (typeof YahooFinanceClass === "function") {
      yahooFinance = new YahooFinanceClass();
    } else {
      // Fallback: use as-is if it's already an object
      yahooFinance = YahooFinanceClass || module;
    }
  }
  return yahooFinance;
}

export interface YahooFinanceQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  averageVolume?: number;
}

export interface YahooFinanceHistoricalData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

export interface SignalAnalysis {
  token: string;
  side: "LONG" | "SHORT" | null;
  confidence: number; // 0-1
  reasoning: string;
  priceChange: number;
  volumeChange: number;
  technicalIndicators: {
    priceTrend: "bullish" | "bearish" | "neutral";
    volumeTrend: "increasing" | "decreasing" | "stable";
    momentum: number; // -1 to 1
  };
}

/**
 * Convert crypto token symbol to Yahoo Finance ticker
 * Yahoo Finance uses format like BTC-USD, ETH-USD
 */
export function tokenToYahooTicker(token: string): string {
  const upperToken = token.toUpperCase();
  // If already in format like BTC-USD, return as is
  if (upperToken.includes("-")) {
    return upperToken;
  }
  // Otherwise append -USD
  return `${upperToken}-USD`;
}

/**
 * Fetch current quote for a token
 */
export async function fetchQuote(
  token: string
): Promise<YahooFinanceQuote | null> {
  try {
    const yf = await getYahooFinance();
    const ticker = tokenToYahooTicker(token);

    // Debug: Check what we got
    if (!yf || typeof yf.quote !== "function") {
      console.error(
        `[YahooFinance] Invalid module structure. Type: ${typeof yf}, Has quote: ${!!yf?.quote}`
      );
      console.error(
        `[YahooFinance] Module keys:`,
        yf ? Object.keys(yf) : "null"
      );
      return null;
    }

    const quote = await yf.quote(ticker);

    return {
      symbol: quote.symbol || ticker,
      regularMarketPrice: quote.regularMarketPrice,
      regularMarketChange: quote.regularMarketChange,
      regularMarketChangePercent: quote.regularMarketChangePercent,
      regularMarketVolume: quote.regularMarketVolume,
      regularMarketPreviousClose: quote.regularMarketPreviousClose,
      regularMarketOpen: quote.regularMarketOpen,
      regularMarketDayHigh: quote.regularMarketDayHigh,
      regularMarketDayLow: quote.regularMarketDayLow,
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      averageVolume: quote.averageVolume,
    } as YahooFinanceQuote;
  } catch (error: any) {
    console.error(
      `[YahooFinance] Error fetching quote for ${token}:`,
      error.message
    );
    return null;
  }
}

/**
 * Fetch historical data for a token
 * NOTE: Yahoo Finance removed the historical API, so we return null
 * and calculate momentum from current quote data instead
 */
export async function fetchHistoricalData(
  token: string,
  period: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" = "5d",
  interval: "1m" | "5m" | "15m" | "30m" | "1h" | "1d" = "1d"
): Promise<YahooFinanceHistoricalData[] | null> {
  // Historical API has been deprecated by Yahoo Finance
  // We'll use current quote data to calculate momentum instead
  return null;
}

/**
 * Analyze market data and generate trading signal
 */
export async function analyzeTokenSignal(
  token: string
): Promise<SignalAnalysis | null> {
  try {
    // Fetch current quote
    const quote = await fetchQuote(token);
    // console.log("quote", quote);
    if (!quote || !quote.regularMarketPrice) {
      return null;
    }

    // Calculate technical indicators from current quote
    // Note: Historical API is deprecated, so we use current quote data
    const priceChange = quote.regularMarketChangePercent || 0;
    const volumeChange = calculateVolumeChange(quote, null);

    // Calculate momentum from price change (simplified approach)
    // Use price change as momentum indicator (normalized to -1 to 1)
    // A 10% change = 1.0 momentum, -10% change = -1.0 momentum
    const momentum = Math.max(-1, Math.min(1, priceChange / 10));

    // Determine price trend
    let priceTrend: "bullish" | "bearish" | "neutral" = "neutral";
    if (priceChange > 2) priceTrend = "bullish";
    else if (priceChange < -2) priceTrend = "bearish";

    // Determine volume trend
    let volumeTrend: "increasing" | "decreasing" | "stable" = "stable";
    const hasAverageVolumeData =
      quote.averageVolume !== undefined && quote.averageVolume !== null;

    if (hasAverageVolumeData) {
      // We can calculate percentage change and determine trend
      if (volumeChange > 20) volumeTrend = "increasing";
      else if (volumeChange < -20) volumeTrend = "decreasing";
      else volumeTrend = "stable";
    } else {
      // No average volume data - we can't determine if volume is increasing
      // So we treat it as "stable" and don't use volume as a requirement
      volumeTrend = "stable";
    }

    // Generate signal based on indicators
    let side: "LONG" | "SHORT" | null = null;
    let confidence = 0;
    let reasoning = "";

    // Signal generation logic:
    // If we have average volume data: Require increasing volume (more reliable)
    // If we don't have average volume: Only use momentum and price change (simpler, still effective)
    const volumeCondition = hasAverageVolumeData
      ? volumeTrend === "increasing" // When we have average volume, require increasing volume
      : true; // When we don't have average volume, don't block signals based on volume

    if (momentum > 0.3 && volumeCondition && priceChange > 1) {
      side = "LONG";
      confidence = Math.min(0.9, 0.5 + momentum * 0.3 + priceChange / 10);
      let volumeInfo = "";
      if (hasAverageVolumeData) {
        volumeInfo = `volume increasing ${volumeChange.toFixed(1)}%`;
      } else {
        volumeInfo = "volume trend unavailable (using price momentum only)";
      }
      reasoning = `Bullish signal: Strong momentum (${(momentum * 100).toFixed(
        1
      )}%), price up ${priceChange.toFixed(2)}%, ${volumeInfo}`;
    } else if (momentum < -0.3 && volumeCondition && priceChange < -1) {
      side = "SHORT";
      confidence = Math.min(
        0.9,
        0.5 + Math.abs(momentum) * 0.3 + Math.abs(priceChange) / 10
      );
      let volumeInfo = "";
      if (hasAverageVolumeData) {
        volumeInfo = `volume increasing ${volumeChange.toFixed(1)}%`;
      } else {
        volumeInfo = "volume trend unavailable (using price momentum only)";
      }
      reasoning = `Bearish signal: Strong negative momentum (${(
        momentum * 100
      ).toFixed(1)}%), price down ${priceChange.toFixed(2)}%, ${volumeInfo}`;
    } else {
      // No clear signal
      let volumeInfo = "";
      if (hasAverageVolumeData) {
        volumeInfo = `volume change ${volumeChange.toFixed(1)}%`;
      } else {
        volumeInfo = "volume trend unavailable";
      }

      reasoning = `Neutral: Momentum ${(momentum * 100).toFixed(
        1
      )}%, price change ${priceChange.toFixed(2)}%, ${volumeInfo}`;

      // Additional check: If momentum is very strong but volume condition failed, explain why
      if (
        Math.abs(momentum) > 0.5 &&
        hasAverageVolumeData &&
        volumeTrend !== "increasing"
      ) {
        reasoning += ` (volume not increasing - required when volume data available)`;
      }
    }

    return {
      token,
      side,
      confidence,
      reasoning,
      priceChange,
      volumeChange,
      technicalIndicators: {
        priceTrend,
        volumeTrend,
        momentum,
      },
    };
  } catch (error: any) {
    console.error(
      `[YahooFinance] Error analyzing signal for ${token}:`,
      error.message
    );
    return null;
  }
}

/**
 * Calculate volume change percentage
 * Returns percentage change if averageVolume is available
 * Returns 0 if we can't calculate (but regularMarketVolume might still be useful)
 */
function calculateVolumeChange(
  quote: YahooFinanceQuote,
  historical: YahooFinanceHistoricalData[] | null
): number {
  // If we have both volumes, calculate percentage change
  if (quote.regularMarketVolume && quote.averageVolume) {
    const currentVolume = quote.regularMarketVolume;
    const avgVolume = quote.averageVolume;

    if (avgVolume === 0) return 0;

    return ((currentVolume - avgVolume) / avgVolume) * 100;
  }

  // If we only have current volume (no average), return 0
  // But we can still use regularMarketVolume to check if there's meaningful trading activity
  return 0;
}

/**
 * Calculate momentum from price change percentage
 * Returns value between -1 and 1
 * NOTE: Historical API is deprecated, so we use current price change
 */
function calculateMomentumFromPriceChange(priceChangePercent: number): number {
  // Normalize price change to -1 to 1 range
  // A 10% change = 1.0 momentum, -10% change = -1.0 momentum
  return Math.max(-1, Math.min(1, priceChangePercent / 10));
}

/**
 * Check if Yahoo Finance API is available
 */
export function canUseYahooFinance(): boolean {
  // Yahoo Finance doesn't require API key, so always available
  return true;
}
