/**
 * Finnhub Data Provider for Hybrid Institute
 *
 * Fetches market data and news from Finnhub API (Free tier)
 * Rate limit: 60 requests/minute
 *
 * API Reference: https://finnhub.io/docs/api
 */

import {
  IDataProvider,
  MarketQuote,
  NewsArticle,
  NewsSentimentSummary,
  NormalizedAssetData,
  AssetType,
  ProviderConfig,
  NewsSentiment,
} from "../../providers/types";
import {
  getFinnhubSymbol,
  getFinnhubNewsSymbol,
  getAssetType,
} from "./symbol-mapper";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

// Rate limiting configuration
const RATE_LIMIT_PER_MINUTE = 60;
const REQUEST_INTERVAL_MS = Math.ceil(60000 / RATE_LIMIT_PER_MINUTE) + 100; // ~1100ms between requests

/**
 * Simple rate limiter for API calls
 */
class RateLimiter {
  private lastRequestTime = 0;
  private requestQueue: Array<() => void> = [];
  private processing = false;

  async waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      this.requestQueue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < REQUEST_INTERVAL_MS) {
        await this.sleep(REQUEST_INTERVAL_MS - timeSinceLastRequest);
      }

      this.lastRequestTime = Date.now();
      const resolve = this.requestQueue.shift();
      if (resolve) resolve();
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Finnhub API response types
 */
interface FinnhubQuoteResponse {
  c: number; // Current price
  d: number; // Change
  dp: number; // Percent change
  h: number; // High price of the day
  l: number; // Low price of the day
  o: number; // Open price of the day
  pc: number; // Previous close price
  t: number; // Timestamp
}

interface FinnhubNewsResponse {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

interface FinnhubNewsSentimentResponse {
  buzz?: {
    articlesInLastWeek: number;
    weeklyAverage: number;
    buzz: number;
  };
  sentiment?: {
    bearishPercent: number;
    bullishPercent: number;
  };
  companyNewsScore?: number;
  sectorAverageBullishPercent?: number;
  sectorAverageNewsScore?: number;
  symbol?: string;
}

/**
 * Finnhub Data Provider Implementation
 */
export class FinnhubProvider implements IDataProvider {
  name = "Finnhub";
  private apiKey: string;
  private baseUrl: string;
  private rateLimiter: RateLimiter;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || FINNHUB_BASE_URL;
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Check if provider is configured
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Make API request with rate limiting
   */
  private async request<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T | null> {
    await this.rateLimiter.waitForSlot();

    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append("token", this.apiKey);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.error("[Finnhub] Rate limit exceeded");
        } else if (response.status === 401) {
          console.error("[Finnhub] Invalid API key");
        } else {
          console.error(
            `[Finnhub] API error: ${response.status} ${response.statusText}`
          );
        }
        return null;
      }

      const data = await response.json();
      return data as T;
    } catch (error: any) {
      console.error(`[Finnhub] Request failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get quote for a symbol
   */
  async getQuote(ostiumSymbol: string): Promise<MarketQuote | null> {
    const finnhubSymbol = getFinnhubSymbol(ostiumSymbol);

    if (!finnhubSymbol) {
      console.warn(`[Finnhub] No mapping for symbol: ${ostiumSymbol}`);
      return null;
    }

    // For OANDA forex/commodity symbols, Finnhub uses a different endpoint
    if (finnhubSymbol.startsWith("OANDA:")) {
      return this.getForexQuote(ostiumSymbol, finnhubSymbol);
    }

    // For indices with ^ prefix, use quote endpoint with the symbol
    // Finnhub may not support index quotes directly on free tier
    if (finnhubSymbol.startsWith("^")) {
      console.warn(
        `[Finnhub] Index quotes may not be available on free tier: ${finnhubSymbol}`
      );
      // Try anyway - Finnhub sometimes supports these
    }

    const data = await this.request<FinnhubQuoteResponse>("/quote", {
      symbol: finnhubSymbol.replace("^", ""),
    });

    if (!data || data.c === 0) {
      return null;
    }

    return {
      symbol: ostiumSymbol,
      currentPrice: data.c,
      previousClose: data.pc,
      change: data.d,
      changePercent: data.dp,
      high: data.h,
      low: data.l,
      open: data.o,
      timestamp: new Date(data.t * 1000),
    };
  }

  /**
   * Get forex/commodity quote using Finnhub forex endpoint
   */
  private async getForexQuote(
    ostiumSymbol: string,
    finnhubSymbol: string
  ): Promise<MarketQuote | null> {
    // Finnhub free tier has limited forex support
    // Use the candle endpoint for a recent price
    const to = Math.floor(Date.now() / 1000);
    const from = to - 86400; // Last 24 hours

    const data = await this.request<{
      c: number[];
      h: number[];
      l: number[];
      o: number[];
      t: number[];
      s: string;
    }>("/forex/candle", {
      symbol: finnhubSymbol,
      resolution: "D",
      from: from.toString(),
      to: to.toString(),
    });

    if (!data || data.s !== "ok" || !data.c?.length) {
      // Forex may not be available on free tier
      console.warn(`[Finnhub] Forex data not available for: ${finnhubSymbol}`);
      return null;
    }

    const lastIndex = data.c.length - 1;
    const prevClose =
      data.c.length > 1 ? data.c[lastIndex - 1] : data.o[lastIndex];

    return {
      symbol: ostiumSymbol,
      currentPrice: data.c[lastIndex],
      previousClose: prevClose,
      change: data.c[lastIndex] - prevClose,
      changePercent: ((data.c[lastIndex] - prevClose) / prevClose) * 100,
      high: data.h[lastIndex],
      low: data.l[lastIndex],
      open: data.o[lastIndex],
      timestamp: new Date(data.t[lastIndex] * 1000),
    };
  }

  /**
   * Get news for a symbol
   */
  async getNews(
    ostiumSymbol: string,
    from?: Date,
    to?: Date
  ): Promise<NewsArticle[]> {
    const newsSymbol = getFinnhubNewsSymbol(ostiumSymbol);

    if (!newsSymbol) {
      console.warn(`[Finnhub] No news symbol mapping for: ${ostiumSymbol}`);
      return [];
    }

    const now = new Date();
    const fromDate = from || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
    const toDate = to || now;

    const data = await this.request<FinnhubNewsResponse[]>("/company-news", {
      symbol: newsSymbol,
      from: fromDate.toISOString().split("T")[0],
      to: toDate.toISOString().split("T")[0],
    });

    if (!data || !Array.isArray(data)) {
      return [];
    }

    // Limit to most recent 10 articles
    return data.slice(0, 10).map((article) => ({
      id: article.id.toString(),
      headline: article.headline,
      summary: article.summary,
      source: article.source,
      url: article.url,
      publishedAt: new Date(article.datetime * 1000),
      relatedSymbols: article.related?.split(",").filter(Boolean) || [],
    }));
  }

  /**
   * Get news sentiment summary for a symbol
   */
  async getNewsSentiment(
    ostiumSymbol: string
  ): Promise<NewsSentimentSummary | null> {
    const newsSymbol = getFinnhubNewsSymbol(ostiumSymbol);

    if (!newsSymbol) {
      return null;
    }

    // Fetch both sentiment data and recent news
    const [sentimentData, articles] = await Promise.all([
      this.request<FinnhubNewsSentimentResponse>("/news-sentiment", {
        symbol: newsSymbol,
      }),
      this.getNews(ostiumSymbol),
    ]);

    if (!sentimentData && articles.length === 0) {
      return null;
    }

    // Calculate sentiment from Finnhub data
    let averageSentiment = 0;
    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;

    if (sentimentData?.sentiment) {
      const bullishPct = sentimentData.sentiment.bullishPercent || 0;
      const bearishPct = sentimentData.sentiment.bearishPercent || 0;

      // Convert percentages to -1 to 1 scale
      averageSentiment = (bullishPct - bearishPct) / 100;

      // Estimate counts based on article count
      const totalArticles =
        sentimentData.buzz?.articlesInLastWeek || articles.length;
      bullishCount = Math.round(totalArticles * (bullishPct / 100));
      bearishCount = Math.round(totalArticles * (bearishPct / 100));
      neutralCount = totalArticles - bullishCount - bearishCount;
    }

    // Add sentiment to articles based on overall sentiment
    const articlesWithSentiment = articles.map((article) => {
      let sentiment: NewsSentiment = "neutral";
      if (averageSentiment > 0.1) sentiment = "bullish";
      else if (averageSentiment < -0.1) sentiment = "bearish";

      return {
        ...article,
        sentiment,
        sentimentScore: averageSentiment,
      };
    });

    return {
      symbol: ostiumSymbol,
      articleCount: sentimentData?.buzz?.articlesInLastWeek || articles.length,
      averageSentiment,
      bullishCount,
      bearishCount,
      neutralCount,
      latestArticles: articlesWithSentiment,
    };
  }

  /**
   * Get full normalized asset data
   */
  async getAssetData(
    ostiumSymbol: string,
    assetType: AssetType
  ): Promise<NormalizedAssetData> {
    const fetchedAt = new Date();

    // Fetch quote and news in parallel
    const [quote, news] = await Promise.all([
      this.getQuote(ostiumSymbol),
      this.getNewsSentiment(ostiumSymbol),
    ]);

    return {
      symbol: ostiumSymbol,
      assetType,
      quote,
      news,
      fetchedAt,
      provider: this.name,
      error: !quote && !news ? "No data available" : undefined,
    };
  }
}

/**
 * Create a Finnhub provider instance
 */
export function createFinnhubProvider(): FinnhubProvider | null {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    console.warn(
      "[Finnhub] No API key found. Set FINNHUB_API_KEY environment variable."
    );
    return null;
  }

  return new FinnhubProvider({ apiKey });
}

