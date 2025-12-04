/**
 * Data Provider Types
 *
 * Shared interfaces for all market data providers (Finnhub, etc.)
 * Designed for modularity - new providers can implement these interfaces
 */

/**
 * Asset type categories
 */
export type AssetType =
  | "stocks"
  | "indices"
  | "forex"
  | "commodities"
  | "crypto";

/**
 * News sentiment values
 */
export type NewsSentiment = "bullish" | "bearish" | "neutral";

/**
 * Normalized market quote data
 */
export interface MarketQuote {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  timestamp: Date;
}

/**
 * News article with sentiment
 */
export interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: Date;
  sentiment?: NewsSentiment;
  sentimentScore?: number; // -1 to 1
  relatedSymbols?: string[];
}

/**
 * Aggregated news sentiment for a symbol
 */
export interface NewsSentimentSummary {
  symbol: string;
  articleCount: number;
  averageSentiment: number; // -1 to 1
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  latestArticles: NewsArticle[];
}

/**
 * Normalized asset data combining price and news
 */
export interface NormalizedAssetData {
  symbol: string;
  assetType: AssetType;
  quote: MarketQuote | null;
  news: NewsSentimentSummary | null;
  fetchedAt: Date;
  provider: string;
  error?: string;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  rateLimit?: number; // requests per minute
}

/**
 * Data provider interface - implement this for new providers
 */
export interface IDataProvider {
  name: string;

  /**
   * Check if the provider is available/configured
   */
  isAvailable(): boolean;

  /**
   * Get quote for a symbol
   */
  getQuote(symbol: string): Promise<MarketQuote | null>;

  /**
   * Get news for a symbol
   */
  getNews(symbol: string, from?: Date, to?: Date): Promise<NewsArticle[]>;

  /**
   * Get news sentiment summary for a symbol
   */
  getNewsSentiment(symbol: string): Promise<NewsSentimentSummary | null>;

  /**
   * Get full normalized data for a symbol
   */
  getAssetData(
    symbol: string,
    assetType: AssetType
  ): Promise<NormalizedAssetData>;
}

/**
 * Symbol mapping for provider
 */
export interface SymbolMapping {
  ostiumSymbol: string;
  providerSymbol: string;
  assetType: AssetType;
  marketName: string;
}
