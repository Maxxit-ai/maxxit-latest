/**
 * Hybrid Data Provider for Hybrid Institute
 *
 * Combines Finnhub (quotes) + MarketAux (news sentiment)
 * This provider gets the best of both worlds:
 * - Finnhub: Real-time quotes, price data
 * - MarketAux: News articles with sentiment scores
 */

import {
  IDataProvider,
  MarketQuote,
  NewsArticle,
  NewsSentimentSummary,
  NormalizedAssetData,
  AssetType,
} from "../../providers/types";
import { FinnhubProvider, createFinnhubProvider } from "./finnhub-provider";
import { MarketAuxProvider, createMarketAuxProvider } from "./marketaux-provider";

/**
 * Hybrid data provider that combines Finnhub (quotes) + MarketAux (news sentiment)
 */
export class HybridDataProvider implements IDataProvider {
  name = "Hybrid (Finnhub + MarketAux)";
  private finnhub: FinnhubProvider | null;
  private marketaux: MarketAuxProvider | null;

  constructor() {
    this.finnhub = createFinnhubProvider();
    this.marketaux = createMarketAuxProvider();
  }

  isAvailable(): boolean {
    // At least one provider should be available
    return (
      this.finnhub?.isAvailable() ||
      false ||
      this.marketaux?.isAvailable() ||
      false
    );
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    // Use Finnhub for quotes (it's better for this)
    if (this.finnhub?.isAvailable()) {
      return this.finnhub.getQuote(symbol);
    }
    return null;
  }

  async getNews(symbol: string, from?: Date, to?: Date): Promise<NewsArticle[]> {
    // Prefer MarketAux for news (has sentiment)
    if (this.marketaux?.isAvailable()) {
      return this.marketaux.getNews(symbol, from, to);
    }
    // Fall back to Finnhub
    if (this.finnhub?.isAvailable()) {
      return this.finnhub.getNews(symbol, from, to);
    }
    return [];
  }

  async getNewsSentiment(symbol: string): Promise<NewsSentimentSummary | null> {
    // Prefer MarketAux for sentiment (primary purpose)
    if (this.marketaux?.isAvailable()) {
      return this.marketaux.getNewsSentiment(symbol);
    }
    // Fall back to Finnhub (though it may not work on free tier)
    if (this.finnhub?.isAvailable()) {
      return this.finnhub.getNewsSentiment(symbol);
    }
    return null;
  }

  async getAssetData(
    symbol: string,
    assetType: AssetType
  ): Promise<NormalizedAssetData> {
    const fetchedAt = new Date();

    // Get quote from Finnhub (works for stocks)
    const quote = await this.getQuote(symbol);

    // Get news sentiment from MarketAux (has better sentiment data)
    const news = await this.getNewsSentiment(symbol);

    // Determine provider name based on what we got
    let providerName = "None";
    if (quote && news) {
      providerName = "Finnhub + MarketAux";
    } else if (quote) {
      providerName = "Finnhub";
    } else if (news) {
      providerName = "MarketAux";
    }

    return {
      symbol,
      assetType,
      quote,
      news,
      fetchedAt,
      provider: providerName,
      error:
        !quote && !news ? "No data available from any provider" : undefined,
    };
  }
}

/**
 * Create a hybrid provider that uses both Finnhub and MarketAux
 */
export function createHybridProvider(): HybridDataProvider {
  return new HybridDataProvider();
}

