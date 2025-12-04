/**
 * MarketAux Data Provider
 *
 * Fetches financial news with sentiment analysis from MarketAux API (Free tier)
 * API Reference: https://www.marketaux.com/documentation
 *
 * Free tier features:
 * - News with entity sentiment scores
 * - Filter by symbols, entity types
 * - Sentiment score per entity (-1 to +1)
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
} from "./types";

const MARKETAUX_BASE_URL = "https://api.marketaux.com/v1";

// Rate limiting - MarketAux free tier has daily limits, not per-minute
// But we still want to be respectful with request frequency
const REQUEST_INTERVAL_MS = 500; // 500ms between requests

/**
 * Simple rate limiter for API calls
 */
class RateLimiter {
  private lastRequestTime = 0;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < REQUEST_INTERVAL_MS) {
      await this.sleep(REQUEST_INTERVAL_MS - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * MarketAux API response types
 */
interface MarketAuxEntity {
  symbol: string;
  name: string;
  exchange: string | null;
  exchange_long: string | null;
  country: string;
  type: string;
  industry: string;
  match_score: number;
  sentiment_score: number;
  highlights: Array<{
    highlight: string;
    sentiment: number;
    highlighted_in: string;
  }>;
}

interface MarketAuxNewsItem {
  uuid: string;
  title: string;
  description: string;
  keywords: string;
  snippet: string;
  url: string;
  image_url: string;
  language: string;
  published_at: string;
  source: string;
  relevance_score: number | null;
  entities: MarketAuxEntity[];
}

interface MarketAuxNewsResponse {
  meta: {
    found: number;
    returned: number;
    limit: number;
    page: number;
  };
  data: MarketAuxNewsItem[];
}

/**
 * Symbol mapping for MarketAux
 * MarketAux uses standard stock symbols and ETF symbols
 */
const MARKETAUX_SYMBOL_MAP: Record<string, string> = {
  // Stocks - direct mapping
  NVDA: "NVDA",
  GOOG: "GOOGL",
  AMZN: "AMZN",
  META: "META",
  TSLA: "TSLA",
  AAPL: "AAPL",
  MSFT: "MSFT",
  COIN: "COIN",
  HOOD: "HOOD",
  MSTR: "MSTR",

  // Indices - use ETF proxies for news
  SPX: "SPY", // S&P 500 ETF
  DJI: "DIA", // Dow Jones ETF
  NDX: "QQQ", // NASDAQ 100 ETF
  NIK: "EWJ", // Japan ETF
  FTSE: "EWU", // UK ETF
  DAX: "EWG", // Germany ETF
  HSI: "EWH", // Hong Kong ETF

  // Commodities - use ETF proxies
  XAU: "GLD", // Gold ETF
  XAG: "SLV", // Silver ETF
  CL: "USO", // Oil ETF
  HG: "CPER", // Copper ETF
  XPD: "PALL", // Palladium ETF
  XPT: "PPLT", // Platinum ETF

  // Forex - use currency ETFs
  EUR: "FXE", // Euro ETF
  GBP: "FXB", // British Pound ETF
  AUD: "FXA", // Australian Dollar ETF
  USD: "UUP", // US Dollar ETF
  NZD: "BNZ", // New Zealand Dollar (limited availability)
};

/**
 * Get MarketAux symbol for a given Ostium symbol
 */
export function getMarketAuxSymbol(ostiumSymbol: string): string | null {
  return MARKETAUX_SYMBOL_MAP[ostiumSymbol.toUpperCase()] || null;
}

/**
 * MarketAux Data Provider Implementation
 */
export class MarketAuxProvider implements IDataProvider {
  name = "MarketAux";
  private apiKey: string;
  private baseUrl: string;
  private rateLimiter: RateLimiter;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || MARKETAUX_BASE_URL;
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
    url.searchParams.append("api_token", this.apiKey);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.error("[MarketAux] Rate limit exceeded");
        } else if (response.status === 401) {
          console.error("[MarketAux] Invalid API key");
        } else if (response.status === 402) {
          console.error("[MarketAux] Usage limit reached");
        } else {
          console.error(
            `[MarketAux] API error: ${response.status} ${response.statusText}`
          );
        }
        return null;
      }

      const data = await response.json();
      return data as T;
    } catch (error: any) {
      console.error(`[MarketAux] Request failed: ${error.message}`);
      return null;
    }
  }

  /**
   * MarketAux doesn't provide quotes - return null
   * Use Finnhub for quotes instead
   */
  async getQuote(ostiumSymbol: string): Promise<MarketQuote | null> {
    // MarketAux is news-only, no quote data
    return null;
  }

  /**
   * Get news for a symbol with sentiment data
   */
  async getNews(
    ostiumSymbol: string,
    from?: Date,
    to?: Date
  ): Promise<NewsArticle[]> {
    const marketAuxSymbol = getMarketAuxSymbol(ostiumSymbol);

    if (!marketAuxSymbol) {
      console.warn(`[MarketAux] No symbol mapping for: ${ostiumSymbol}`);
      return [];
    }

    const params: Record<string, string> = {
      symbols: marketAuxSymbol,
      filter_entities: "true",
      language: "en",
      limit: "10",
    };

    // Add date filters if provided
    if (from) {
      params.published_after = from.toISOString().split("T")[0];
    }
    if (to) {
      params.published_before = to.toISOString().split("T")[0];
    }

    const data = await this.request<MarketAuxNewsResponse>("/news/all", params);

    if (!data || !data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((article) => {
      // Find sentiment for the specific symbol we're looking for
      const relevantEntity = article.entities?.find(
        (e) => e.symbol.toUpperCase() === marketAuxSymbol.toUpperCase()
      );

      const sentimentScore = relevantEntity?.sentiment_score || 0;
      let sentiment: NewsSentiment = "neutral";
      if (sentimentScore > 0.1) sentiment = "bullish";
      else if (sentimentScore < -0.1) sentiment = "bearish";

      return {
        id: article.uuid,
        headline: article.title,
        summary: article.description || article.snippet,
        source: article.source,
        url: article.url,
        publishedAt: new Date(article.published_at),
        sentiment,
        sentimentScore,
        relatedSymbols: article.entities?.map((e) => e.symbol) || [],
      };
    });
  }

  /**
   * Get news sentiment summary for a symbol
   */
  async getNewsSentiment(
    ostiumSymbol: string
  ): Promise<NewsSentimentSummary | null> {
    const articles = await this.getNews(ostiumSymbol);

    if (articles.length === 0) {
      return null;
    }

    // Calculate sentiment statistics from articles
    let totalSentiment = 0;
    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;

    articles.forEach((article) => {
      const score = article.sentimentScore || 0;
      totalSentiment += score;

      if (score > 0.1) bullishCount++;
      else if (score < -0.1) bearishCount++;
      else neutralCount++;
    });

    const averageSentiment =
      articles.length > 0 ? totalSentiment / articles.length : 0;

    return {
      symbol: ostiumSymbol,
      articleCount: articles.length,
      averageSentiment,
      bullishCount,
      bearishCount,
      neutralCount,
      latestArticles: articles,
    };
  }

  /**
   * Get full normalized asset data
   * Note: MarketAux only provides news, not quotes
   */
  async getAssetData(
    ostiumSymbol: string,
    assetType: AssetType
  ): Promise<NormalizedAssetData> {
    const fetchedAt = new Date();

    // MarketAux only provides news sentiment
    const news = await this.getNewsSentiment(ostiumSymbol);

    return {
      symbol: ostiumSymbol,
      assetType,
      quote: null, // MarketAux doesn't provide quotes
      news,
      fetchedAt,
      provider: this.name,
      error: !news ? "No news data available" : undefined,
    };
  }
}

/**
 * Create a MarketAux provider instance
 */
export function createMarketAuxProvider(): MarketAuxProvider | null {
  const apiKey = process.env.MARKETAUX_API_KEY;

  if (!apiKey) {
    console.warn(
      "[MarketAux] No API key found. Set MARKETAUX_API_KEY environment variable."
    );
    return null;
  }

  return new MarketAuxProvider({ apiKey });
}
