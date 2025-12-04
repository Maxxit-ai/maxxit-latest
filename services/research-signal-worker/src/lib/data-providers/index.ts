/**
 * Data Providers Index
 *
 * Factory for creating data provider instances
 * Designed for easy expansion with additional providers
 */

export * from "./types";
export * from "./symbol-mapper";
export { FinnhubProvider, createFinnhubProvider } from "./finnhub-provider";
export {
  MarketAuxProvider,
  createMarketAuxProvider,
  getMarketAuxSymbol,
} from "./marketaux-provider";

import { IDataProvider, NormalizedAssetData, AssetType } from "./types";
import { createFinnhubProvider, FinnhubProvider } from "./finnhub-provider";
import {
  createMarketAuxProvider,
  MarketAuxProvider,
} from "./marketaux-provider";

/**
 * Provider types
 */
export type ProviderType = "finnhub" | "marketaux";

/**
 * Get a data provider by type
 */
export function getDataProvider(type: ProviderType): IDataProvider | null {
  switch (type) {
    case "finnhub":
      return createFinnhubProvider();
    case "marketaux":
      return createMarketAuxProvider();
    default:
      console.warn(`[DataProvider] Unknown provider type: ${type}`);
      return null;
  }
}

/**
 * Get the default data provider (Finnhub for quotes)
 */
export function getDefaultProvider(): IDataProvider | null {
  return getDataProvider("finnhub");
}

/**
 * Get the news/sentiment provider (MarketAux)
 */
export function getNewsProvider(): IDataProvider | null {
  return getDataProvider("marketaux");
}

/**
 * Check if any data provider is available
 */
export function isAnyProviderAvailable(): boolean {
  const finnhub = createFinnhubProvider();
  const marketaux = createMarketAuxProvider();
  return finnhub?.isAvailable() || marketaux?.isAvailable() || false;
}

/**
 * Check which providers are available
 */
export function getAvailableProviders(): {
  finnhub: boolean;
  marketaux: boolean;
} {
  const finnhub = createFinnhubProvider();
  const marketaux = createMarketAuxProvider();
  return {
    finnhub: finnhub?.isAvailable() || false,
    marketaux: marketaux?.isAvailable() || false,
  };
}

/**
 * Hybrid data fetcher that combines Finnhub (quotes) + MarketAux (news sentiment)
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

  async getQuote(symbol: string) {
    // Use Finnhub for quotes (it's better for this)
    if (this.finnhub?.isAvailable()) {
      return this.finnhub.getQuote(symbol);
    }
    return null;
  }

  async getNews(symbol: string, from?: Date, to?: Date) {
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

  async getNewsSentiment(symbol: string) {
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
