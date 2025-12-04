/**
 * GMX V2 Perpetuals Adapter (V2 - Module-Based)
 * Executes leveraged perpetual positions on GMX through Safe Module
 */

import { ethers } from 'ethers';
import { SafeModuleService, GMXOrderParams, GMXCloseParams, GMXResult } from '../safe-module-service';
import { createGMXReader } from './gmx-reader';

// GMX Market tokens (Arbitrum One)
const GMX_MARKETS: Record<string, string> = {
  'BTC': '0x47c031236e19d024b42f8AE6780E44A573170703', // BTC/USD market
  'ETH': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336', // ETH/USD market
  'SOL': '0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9', // SOL/USD market
  'ARB': '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407', // ARB/USD market
  'LINK': '0x7f1fa204bb700853D36994DA19F830b6Ad18455C', // LINK/USD market
  'WETH': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336', // Same as ETH
};

// GMX Reader (for fetching prices and position data)
const GMX_READER = '0xf60becbba223EEA9495Da3f606753867eC10d139';

export interface GMXTradeParams {
  safeAddress: string;
  tokenSymbol: string;
  collateralUSDC: number;      // Collateral in USDC (e.g., 100 = 100 USDC)
  leverage: number;             // Leverage 1-50x
  isLong: boolean;
  slippage?: number;            // Default 0.5%
  profitReceiver: string;       // Agent creator address
}

export interface GMXClosePositionParams {
  safeAddress: string;
  tokenSymbol: string;
  sizeDeltaUsd: string;         // Size to close in USD (30 decimals)
  isLong: boolean;
  slippage?: number;            // Default 0.5%
  profitReceiver: string;
}

export interface GMXExecutionSummary {
  canExecute: boolean;
  reason?: string;
  collateralUSDC?: number;
  positionSizeUSD?: number;
  leverage?: number;
  executionFeeETH?: number;
  estimatedGas?: string;
}

/**
 * GMX V2 Adapter - Module-Based
 * Uses SafeModuleService to interact with MaxxitTradingModuleV2
 */
export class GMXAdapter {
  private moduleService: SafeModuleService;
  private provider: ethers.providers.Provider;

  constructor(moduleService: SafeModuleService, provider: ethers.providers.Provider) {
    this.moduleService = moduleService;
    this.provider = provider;
  }

  /**
   * Get market address for token symbol
   */
  static getMarket(tokenSymbol: string): string | null {
    return GMX_MARKETS[tokenSymbol.toUpperCase()] || null;
  }

  /**
   * Setup GMX trading for a Safe (one-time)
   */
  async setupGMXForSafe(safeAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    return this.moduleService.setupGMXTrading(safeAddress);
  }

  /**
   * Check if Safe is ready for GMX trading
   */
  async isReadyForGMX(safeAddress: string): Promise<boolean> {
    return this.moduleService.isReadyForGMX(safeAddress);
  }

  /**
   * Get current GMX price for token (using Chainlink oracle via GMX Reader)
   */
  async getGMXPrice(tokenSymbol: string): Promise<number> {
    try {
      const gmxReader = createGMXReader(this.provider);
      const priceData = await gmxReader.getMarketPrice(tokenSymbol);
      
      if (!priceData) {
        throw new Error(`Failed to get GMX price for ${tokenSymbol}`);
      }

      console.log(`[GMXAdapter] Got price for ${tokenSymbol}: $${priceData.price.toFixed(2)}`);
      return priceData.price;
    } catch (error: any) {
      console.error('[GMXAdapter] Get price error:', error);
      throw error; // Re-throw instead of returning 0
    }
  }

  /**
   * Build GMX order parameters with proper formatting
   */
  private async buildGMXOrderParams(params: GMXTradeParams): Promise<GMXOrderParams> {
    const market = GMXAdapter.getMarket(params.tokenSymbol);
    if (!market) {
      throw new Error(`Market not found for ${params.tokenSymbol}`);
    }

    // Get current price
    const currentPrice = await this.getGMXPrice(params.tokenSymbol);
    if (currentPrice === 0) {
      throw new Error(`Failed to get price for ${params.tokenSymbol}`);
    }

    // Convert collateral to wei (USDC has 6 decimals)
    const collateralAmount = ethers.utils.parseUnits(params.collateralUSDC.toString(), 6);

    // Calculate position size with leverage (in USD, 30 decimals)
    const positionSizeUSD = params.collateralUSDC * params.leverage;
    const sizeDeltaUsd = ethers.utils.parseUnits(positionSizeUSD.toString(), 30);

    // Calculate acceptable price with slippage (30 decimals)
    const slippage = params.slippage || 0.5; // Default 0.5%
    const slippageFactor = params.isLong ? (1 + slippage / 100) : (1 - slippage / 100);
    const acceptablePrice = ethers.utils.parseUnits(
      (currentPrice * slippageFactor).toFixed(8),
      30
    );

    // Execution fee: 0.001 ETH for GMX keepers (18 decimals)
    const executionFee = ethers.utils.parseEther('0.001');

    return {
      safeAddress: params.safeAddress,
      market,
      collateralAmount: collateralAmount.toString(),
      sizeDeltaUsd: sizeDeltaUsd.toString(),
      isLong: params.isLong,
      acceptablePrice: acceptablePrice.toString(),
      executionFee: executionFee.toString(),
      profitReceiver: params.profitReceiver,
    };
  }

  /**
   * Open GMX position through module
   */
  async openGMXPosition(params: GMXTradeParams): Promise<GMXResult> {
    try {
      console.log('[GMXAdapter] Opening GMX position:', {
        token: params.tokenSymbol,
        collateral: params.collateralUSDC,
        leverage: params.leverage,
        isLong: params.isLong,
      });

      // Check if GMX is setup
      const isReady = await this.isReadyForGMX(params.safeAddress);
      if (!isReady) {
        console.log('[GMXAdapter] GMX not setup, setting up now...');
        const setupResult = await this.setupGMXForSafe(params.safeAddress);
        if (!setupResult.success) {
          return {
            success: false,
            error: `GMX setup failed: ${setupResult.error}`,
          };
        }
      }

      // Build order params
      const orderParams = await this.buildGMXOrderParams(params);

      // Execute through module
      const result = await this.moduleService.executeGMXOrder(orderParams);

      if (result.success) {
        console.log('[GMXAdapter] GMX position opened:', result.txHash);
      }

      return result;
    } catch (error: any) {
      console.error('[GMXAdapter] Open position error:', error);
      return {
        success: false,
        error: error.message || 'Failed to open GMX position',
      };
    }
  }

  /**
   * Close GMX position through module
   */
  async closeGMXPosition(params: GMXClosePositionParams): Promise<GMXResult> {
    try {
      console.log('[GMXAdapter] Closing GMX position:', {
        token: params.tokenSymbol,
        size: params.sizeDeltaUsd,
        isLong: params.isLong,
      });

      const market = GMXAdapter.getMarket(params.tokenSymbol);
      if (!market) {
        throw new Error(`Market not found for ${params.tokenSymbol}`);
      }

      // Get current price for slippage calculation
      const currentPrice = await this.getGMXPrice(params.tokenSymbol);
      if (currentPrice === 0) {
        throw new Error(`Failed to get price for ${params.tokenSymbol}`);
      }

      // Calculate acceptable price with slippage (opposite direction for closing)
      const slippage = params.slippage || 0.5;
      const slippageFactor = params.isLong ? (1 - slippage / 100) : (1 + slippage / 100);
      const acceptablePrice = ethers.utils.parseUnits(
        (currentPrice * slippageFactor).toFixed(8),
        30
      );

      // Execution fee
      const executionFee = ethers.utils.parseEther('0.001');

      // Build close params
      const closeParams: GMXCloseParams = {
        safeAddress: params.safeAddress,
        market,
        sizeDeltaUsd: params.sizeDeltaUsd,
        isLong: params.isLong,
        acceptablePrice: acceptablePrice.toString(),
        executionFee: executionFee.toString(),
        profitReceiver: params.profitReceiver,
      };

      // Execute through module
      const result = await this.moduleService.closeGMXPosition(closeParams);

      if (result.success) {
        console.log('[GMXAdapter] GMX position closed:', result.txHash);
        console.log('[GMXAdapter] Realized PnL:', result.realizedPnL);
        console.log('[GMXAdapter] Profit share:', result.profitShare);
      }

      return result;
    } catch (error: any) {
      console.error('[GMXAdapter] Close position error:', error);
      return {
        success: false,
        error: error.message || 'Failed to close GMX position',
      };
    }
  }

  /**
   * Get execution summary (pre-trade validation)
   */
  async getExecutionSummary(params: {
    safeAddress: string;
    tokenSymbol: string;
    collateralUSDC: number;
    leverage: number;
  }): Promise<GMXExecutionSummary> {
    try {
      // Check if market exists
      const market = GMXAdapter.getMarket(params.tokenSymbol);
      if (!market) {
        return {
          canExecute: false,
          reason: `Market not available for ${params.tokenSymbol}`,
        };
      }

      // Check if GMX is setup
      const isReady = await this.isReadyForGMX(params.safeAddress);
      if (!isReady) {
        // Auto-setup is possible, so this is not a blocker
        console.log('[GMXAdapter] GMX not setup yet (will auto-setup)');
      }

      // Check ETH balance for execution fees
      const ethBalance = await this.provider.getBalance(params.safeAddress);
      const requiredETH = ethers.utils.parseEther('0.002'); // 0.002 ETH (open + close)

      if (ethBalance.lt(requiredETH)) {
        return {
          canExecute: false,
          reason: `Insufficient ETH for execution fees (need 0.002 ETH, have ${ethers.utils.formatEther(ethBalance)} ETH)`,
        };
      }

      // Check USDC balance
      const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
      const usdcAddress = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC
      const usdc = new ethers.Contract(usdcAddress, usdcAbi, this.provider);
      const usdcBalance = await usdc.balanceOf(params.safeAddress);
      const usdcBalanceFormatted = parseFloat(ethers.utils.formatUnits(usdcBalance, 6));

      if (usdcBalanceFormatted < params.collateralUSDC) {
        return {
          canExecute: false,
          reason: `Insufficient USDC balance (need ${params.collateralUSDC}, have ${usdcBalanceFormatted.toFixed(2)})`,
        };
      }

      // Calculate position size
      const positionSizeUSD = params.collateralUSDC * params.leverage;

      return {
        canExecute: true,
        collateralUSDC: params.collateralUSDC,
        positionSizeUSD,
        leverage: params.leverage,
        executionFeeETH: 0.001,
        estimatedGas: '1500000',
      };
    } catch (error: any) {
      return {
        canExecute: false,
        reason: error.message,
      };
    }
  }
}

/**
 * Create GMX adapter with module service
 */
export function createGMXAdapter(
  moduleService: SafeModuleService,
  provider: ethers.providers.Provider
): GMXAdapter {
  return new GMXAdapter(moduleService, provider);
}
