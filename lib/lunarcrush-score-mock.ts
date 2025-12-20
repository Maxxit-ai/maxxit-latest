/**
 * LunarCrush Trading Score System - MOCK DATA VERSION
 * For testing the scoring logic without needing a working API
 */

import { LunarCrushScorer } from './lunarcrush-score';

// Mock LunarCrush data (realistic values)
const MOCK_DATA: Record<string, any> = {
  BTC: {
    galaxy_score: 85,
    alt_rank: 1,
    social_volume: 50000,
    percent_change_24h_social_volume: 15,
    sentiment: 0.72,
    percent_change_24h: 5.2,
    volatility: 45,
    correlation_rank: 1
  },
  ETH: {
    galaxy_score: 78,
    alt_rank: 2,
    social_volume: 35000,
    percent_change_24h_social_volume: 8,
    sentiment: 0.68,
    percent_change_24h: 3.8,
    volatility: 50,
    correlation_rank: 2
  },
  SOL: {
    galaxy_score: 72,
    alt_rank: 5,
    social_volume: 25000,
    percent_change_24h_social_volume: 25,
    sentiment: 0.75,
    percent_change_24h: 8.5,
    volatility: 65,
    correlation_rank: 8
  },
  DOGE: {
    galaxy_score: 55,
    alt_rank: 15,
    social_volume: 20000,
    percent_change_24h_social_volume: -5,
    sentiment: 0.52,
    percent_change_24h: -2.1,
    volatility: 75,
    correlation_rank: 25
  },
  SHIB: {
    galaxy_score: 48,
    alt_rank: 25,
    social_volume: 15000,
    percent_change_24h_social_volume: -15,
    sentiment: 0.45,
    percent_change_24h: -5.5,
    volatility: 85,
    correlation_rank: 40
  },
  ARB: {
    galaxy_score: 68,
    alt_rank: 35,
    social_volume: 12000,
    percent_change_24h_social_volume: 18,
    sentiment: 0.65,
    percent_change_24h: 6.2,
    volatility: 55,
    correlation_rank: 45
  },
  MATIC: {
    galaxy_score: 65,
    alt_rank: 20,
    social_volume: 18000,
    percent_change_24h_social_volume: 10,
    sentiment: 0.62,
    percent_change_24h: 4.1,
    volatility: 52,
    correlation_rank: 30
  },
  LINK: {
    galaxy_score: 70,
    alt_rank: 18,
    social_volume: 22000,
    percent_change_24h_social_volume: 12,
    sentiment: 0.66,
    percent_change_24h: 3.5,
    volatility: 48,
    correlation_rank: 22
  }
};

export class MockLunarCrushScorer extends LunarCrushScorer {
  constructor() {
    super('MOCK_API_KEY');
  }

  /**
   * Override to return mock data instead of calling API
   */
  protected async fetchMetrics(symbol: string): Promise<any> {
    const mockData = MOCK_DATA[symbol.toUpperCase()];
    
    if (!mockData) {
      // Generate random but realistic data for unknown tokens
      const data = {
        galaxy_score: 40 + Math.random() * 40, // 40-80
        alt_rank: Math.floor(Math.random() * 100) + 1, // 1-100
        social_volume: Math.floor(Math.random() * 30000) + 5000, // 5k-35k
        percent_change_24h_social_volume: (Math.random() * 60) - 30, // -30 to +30
        sentiment: 0.3 + (Math.random() * 0.5), // 0.3-0.8
        percent_change_24h: (Math.random() * 20) - 10, // -10 to +10
        volatility: 30 + Math.random() * 60, // 30-90
        correlation_rank: Math.floor(Math.random() * 100) + 1 // 1-100
      };
      
      // Map to expected interface
      return {
        galaxy_score: data.galaxy_score,
        alt_rank: data.alt_rank,
        social_volume: data.social_volume,
        social_volume_24h_change: data.percent_change_24h_social_volume,
        sentiment: data.sentiment,
        price_change_24h: data.percent_change_24h,
        volatility: data.volatility,
        correlation_rank: data.correlation_rank
      };
    }

    // Map mock data to expected interface
    return {
      galaxy_score: mockData.galaxy_score,
      alt_rank: mockData.alt_rank,
      social_volume: mockData.social_volume,
      social_volume_24h_change: mockData.percent_change_24h_social_volume,
      sentiment: mockData.sentiment,
      price_change_24h: mockData.percent_change_24h,
      volatility: mockData.volatility,
      correlation_rank: mockData.correlation_rank
    };
  }
}

/**
 * Create mock LunarCrush scorer for testing
 */
export function createMockLunarCrushScorer(): MockLunarCrushScorer {
  return new MockLunarCrushScorer();
}

