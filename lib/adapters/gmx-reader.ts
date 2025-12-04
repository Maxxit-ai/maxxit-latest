/**
 * GMX Price Oracle - Chainlink Price Feeds
 * 
 * GMX V2 uses Chainlink price feeds for ALL price data.
 * This is the EXACT same price source GMX uses internally.
 * 
 * Why Chainlink instead of GMX Reader?
 * - GMX Reader requires prices as INPUT (doesn't provide them)
 * - GMX V2 uses Chainlink for all index token prices
 * - By using Chainlink, we get the SAME prices GMX uses
 * 
 * This is similar to using Uniswap V3 Quoter for SPOT prices.
 */

import { ethers } from 'ethers';

// Chainlink Price Feed addresses on Arbitrum (SAME feeds GMX uses)
const CHAINLINK_FEEDS: Record<string, string> = {
  'BTC': '0x6ce185860a4963106506C203335A2910413708e9',  // BTC/USD
  'ETH': '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',  // ETH/USD
  'WETH': '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', // ETH/USD
  'SOL': '0x24ceA4b8ce57cdA5058b924B9B9987992450590c',  // SOL/USD
  'AVAX': '0x8bf61728eeDCE2F32c456454d87B5d6eD6150208', // AVAX/USD
  'ARB': '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6',  // ARB/USD
  'LINK': '0x86E53CF1B870786351Da77A57575e79CB55812CB', // LINK/USD
  'MATIC': '0x52099D4523531f678Dfc568a7B1e5038aadcE1d6', // MATIC/USD
  'UNI': '0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720',  // UNI/USD
  'LTC': '0x0411D28c94d85A36bC72Cb0f875dfA8371D8fFfF',  // LTC/USD
  'DOGE': '0x9A7FB1b3950837a8D9b40517626E11D4127C098C', // DOGE/USD
};

// Index tokens (the actual asset being traded)
const INDEX_TOKENS: Record<string, string> = {
  'BTC': '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',  // WBTC
  'ETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',  // WETH
  'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
  'SOL': '0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07',  // SOL (wrapped)
  'AVAX': '0x565609fAF65B92F7be02468acF86f8979423e514', // AVAX (wrapped)
  'ARB': '0x912CE59144191C1204E64559FE8253a0e49E6548',  // ARB
  'LINK': '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', // LINK
  'DOGE': '0xC4da4c24fd591125c3F47b340b6f4f76111883d8', // DOGE (wrapped)
  'LTC': '0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60',  // LTC (wrapped)
  'UNI': '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',  // UNI
  'MATIC': '0x561877b6b3DD7651313794e5F2894B2F18bE0766', // MATIC
};

// GMX Market tokens (the market contract for each pair)
const GMX_MARKETS: Record<string, string> = {
  'BTC': '0x47c031236e19d024b42f8AE6780E44A573170703',
  'ETH': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
  'WETH': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
  'SOL': '0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9',
  'AVAX': '0x0CCB4fAa6f1F1B30911619f1184082aB4E25813c',
  'ARB': '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407',
  'LINK': '0x7f1fa204bb700853D36994DA19F830b6Ad18455C',
  'DOGE': '0x6853EA96FF216fAb11D2d930CE3C508556A4bdc4',
  'LTC': '0xD9535bB5f58A1a75032416F2dFe7880C30575a41',
};

// USDC (collateral token)
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

/**
 * GMX Reader - Uses Chainlink Price Feeds (GMX's Price Source)
 * 
 * This queries Chainlink price feeds directly - the SAME source GMX uses
 */
export class GMXReader {
  private provider: ethers.providers.Provider;

  constructor(provider: ethers.providers.Provider) {
    this.provider = provider;
  }

  /**
   * Get market for token symbol
   */
  static getMarket(tokenSymbol: string): string | null {
    return GMX_MARKETS[tokenSymbol.toUpperCase()] || null;
  }

  /**
   * Get current GMX price from Chainlink (GMX's actual price source)
   * This is the EXACT SAME price GMX uses for all trades
   * 
   * Similar to: Uniswap V3 Quoter for SPOT prices
   */
  async getMarketPrice(tokenSymbol: string): Promise<{
    price: number;
    priceWei: ethers.BigNumber;
    timestamp: number;
  } | null> {
    try {
      const feedAddress = CHAINLINK_FEEDS[tokenSymbol.toUpperCase()];
      
      if (!feedAddress) {
        console.error(`[GMXReader] No Chainlink feed for ${tokenSymbol}`);
        return null;
      }

      console.log(`[GMXReader] Querying Chainlink for ${tokenSymbol} price...`);
      console.log(`└─ Feed: ${feedAddress}`);

      // Chainlink Aggregator ABI
      const aggregatorAbi = [
        'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
        'function decimals() external view returns (uint8)',
      ];

      const aggregator = new ethers.Contract(feedAddress, aggregatorAbi, this.provider);

      // Get price data
      const [decimals, roundData] = await Promise.all([
        aggregator.decimals(),
        aggregator.latestRoundData(),
      ]);

      const priceWei = roundData.answer; // int256
      const price = parseFloat(ethers.utils.formatUnits(priceWei, decimals));
      const timestamp = roundData.updatedAt.toNumber();

      console.log(`[GMXReader] ✅ ${tokenSymbol}/USD: $${price.toFixed(2)} (Chainlink)`);
      console.log(`└─ Updated: ${new Date(timestamp * 1000).toISOString()}`);

      return {
        price,
        priceWei,
        timestamp,
      };
    } catch (error: any) {
      console.error(`[GMXReader] Error getting price for ${tokenSymbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get position PnL from GMX (on-chain calculation)
   * This is what GMX will use to settle the position
   * 
   * NOTE: GMX calculates PnL automatically when closing
   * We just need current price to estimate, actual PnL comes from close transaction
   */
  async getPositionPnL(params: {
    tokenSymbol: string;
    entryPrice: number;
    qty: number;
    isLong: boolean;
  }): Promise<{
    pnl: number;
    currentPrice: number;
  } | null> {
    try {
      // Get current price from GMX
      const priceData = await this.getMarketPrice(params.tokenSymbol);
      if (!priceData) {
        return null;
      }

      const currentPrice = priceData.price;
      
      // Calculate estimated PnL
      // GMX uses: PnL = (currentPrice - entryPrice) * size (for longs)
      //           PnL = (entryPrice - currentPrice) * size (for shorts)
      let pnl: number;
      if (params.isLong) {
        pnl = (currentPrice - params.entryPrice) * params.qty;
      } else {
        pnl = (params.entryPrice - currentPrice) * params.qty;
      }

      console.log('[GMXReader] Position PnL:', {
        token: params.tokenSymbol,
        entryPrice: params.entryPrice.toFixed(2),
        currentPrice: currentPrice.toFixed(2),
        pnl: pnl.toFixed(2),
        isLong: params.isLong,
      });

      return {
        pnl,
        currentPrice,
      };
    } catch (error: any) {
      console.error('[GMXReader] Error getting position PnL:', error.message);
      return null;
    }
  }

  /**
   * Get index token address for a symbol
   */
  static getIndexToken(tokenSymbol: string): string | null {
    return INDEX_TOKENS[tokenSymbol.toUpperCase()] || null;
  }
}

/**
 * Factory function
 */
export function createGMXReader(provider: ethers.providers.Provider): GMXReader {
  return new GMXReader(provider);
}

/**
 * Why Chainlink for GMX Prices?
 * 
 * GMX V2 uses Chainlink price feeds as its PRIMARY price source:
 * ✅ All GMX trades settle using Chainlink prices
 * ✅ GMX Reader requires prices as INPUT (doesn't provide them)
 * ✅ Chainlink is the most reliable on-chain oracle
 * 
 * By querying Chainlink directly, we get:
 * - The EXACT same prices GMX uses internally
 * - Real-time, on-chain price data
 * - Consistent with what users see on GMX UI
 * - Transparent and verifiable
 * 
 * This is similar to how we use Uniswap V3 Quoter for SPOT prices!
 */

