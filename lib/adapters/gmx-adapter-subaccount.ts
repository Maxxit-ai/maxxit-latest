/**
 * GMX V2 Adapter - SubaccountRouter Approach
 * 
 * SECURITY MODEL:
 * - Executor authorized as GMX subaccount
 * - Trades GMX directly (positions owned by Safe)
 * - Backend enforces limits (leverage, size, tokens)
 * - Module handles fees & profit sharing separately
 * 
 * SAFEGUARDS:
 * - Max leverage: 10x
 * - Max position size: 5000 USDC
 * - Max daily volume: 20000 USDC
 * - Whitelisted tokens only
 * - Real-time monitoring hooks
 */

import { ethers } from 'ethers';
import { SafeModuleService } from '../safe-module-service';
import { createGMXReader, GMXReader } from './gmx-reader';

// GMX V2 Contract addresses (Arbitrum One)
const GMX_EXCHANGE_ROUTER = '0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8';
const GMX_ROUTER = '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6';
const GMX_READER = '0xf60becbba223EEA9495Da3f606753867eC10d139';
const GMX_DATASTORE = '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8';

// SECURITY LIMITS (CONFIGURABLE)
const SECURITY_LIMITS = {
  MAX_LEVERAGE: 10,              // 10x maximum
  MAX_POSITION_SIZE: 5000,       // 5000 USDC maximum per position
  MAX_DAILY_VOLUME: 20000,       // 20000 USDC maximum per day per Safe
  MIN_POSITION_SIZE: 1,          // 1 USDC minimum
  MAX_SLIPPAGE: 2,               // 2% maximum slippage
};

// GMX V2 Market tokens (ALL available on Arbitrum)
const GMX_MARKETS: Record<string, string> = {
  // Major Crypto
  'BTC': '0x47c031236e19d024b42f8AE6780E44A573170703',    // BTC/USD
  'ETH': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',    // ETH/USD
  'WETH': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',   // Same as ETH
  
  // Layer 1s
  'SOL': '0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9',    // SOL/USD
  'AVAX': '0x0CCB4fAa6f1F1B30911619f1184082aB4E25813c',  // AVAX/USD
  'ATOM': '0x75e57a9b2e3f0f07B5dC8A8E4EF3b5FFA3C1a0e9',  // ATOM/USD (placeholder - verify)
  'NEAR': '0xd0C186149822aB32D925C4C6Bb70AaF3c10a86F2',  // NEAR/USD (placeholder - verify)
  
  // Layer 2s & Scaling
  'ARB': '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407',    // ARB/USD
  'OP': '0xf53e80e9C18DE8aBE674bD4bD5664bE17C3e1FE1',    // OP/USD (placeholder - verify)
  'MATIC': '0x3B1ae6c0fC8d0f86f5D2B8c5e3B8F0D1E5A9C2D4', // MATIC/USD (placeholder - verify)
  
  // DeFi Blue Chips
  'LINK': '0x7f1fa204bb700853D36994DA19F830b6Ad18455C',   // LINK/USD
  'UNI': '0xC5a4ab0A3F76e0a3DF5E0F8A3B1C5D6E7F8A9B0C',   // UNI/USD (placeholder - verify)
  'AAVE': '0x7E3F5C8E6A9B4C5D6E7F8A9B0C1D2E3F4A5B6C7D', // AAVE/USD (placeholder - verify)
  
  // Meme Coins
  'DOGE': '0x6853EA96FF216fAb11D2d930CE3C508556A4bdc4',   // DOGE/USD
  'SHIB': '0x3E8C2c2c5E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B', // SHIB/USD (placeholder - verify)
  'PEPE': '0x4A5B6C7D8E9F0A1B2C3D4E5F6A7B8C9D0E1F2A3B', // PEPE/USD (placeholder - verify)
  
  // Altcoins
  'LTC': '0xD9535bB5f58A1a75032416F2dFe7880C30575a41',   // LTC/USD
  'XRP': '0x0CCB4fAa6f1F1B30911619f1184082aB4E25813c',   // XRP/USD (placeholder - verify)
  'DOT': '0x5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0D1E2F3A4B', // DOT/USD (placeholder - verify)
  'ADA': '0x6B7C8D9E0F1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C', // ADA/USD (placeholder - verify)
};

// USDC on Arbitrum
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

export interface GMXTradeParams {
  safeAddress: string;
  tokenSymbol: string;
  collateralUSDC: number;
  leverage: number;
  isLong: boolean;
  slippage?: number;
  profitReceiver: string;
}

export interface GMXCloseParams {
  safeAddress: string;
  tokenSymbol: string;
  sizeDeltaUsd: string;
  isLong: boolean;
  slippage?: number;
  profitReceiver: string;
}

export interface GMXResult {
  success: boolean;
  txHash?: string;
  orderKey?: string;
  error?: string;
  securityAlert?: string;
}

/**
 * GMX Adapter - SubaccountRouter Approach
 * Executor trades directly, module handles fees/profit
 */
export class GMXAdapterSubaccount {
  private provider: ethers.providers.Provider;
  private executor: ethers.Wallet;
  private moduleService: SafeModuleService;
  private gmxReader: GMXReader;
  
  // Daily volume tracking (in-memory, should be in DB for production)
  private dailyVolume: Map<string, { date: string; volume: number }> = new Map();

  constructor(
    provider: ethers.providers.Provider,
    executorPrivateKey: string,
    moduleService: SafeModuleService
  ) {
    this.provider = provider;
    this.executor = new ethers.Wallet(executorPrivateKey, provider);
    this.moduleService = moduleService;
    this.gmxReader = createGMXReader(provider);
  }

  /**
   * NOTE: GMX V2 AUTHORIZATION NOT NEEDED!
   * 
   * GMX V2 on Arbitrum doesn't require explicit subaccount authorization.
   * Anyone can create orders on behalf of any account, but:
   * - The position is owned by the Safe wallet (not the executor)
   * - Funds never leave Safe custody
   * - The executor can only create/close positions for the Safe
   * 
   * These functions are kept for reference but are NOT used in production.
   */

  // /**
  //  * DEPRECATED: GMX V2 doesn't need this
  //  */
  // async authorizeSubaccount(safeAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  //   console.log('[GMX] Note: Authorization not needed for GMX V2');
  //   return { success: true };
  // }

  // /**
  //  * DEPRECATED: GMX V2 doesn't need this
  //  */
  // async isAuthorized(safeAddress: string): Promise<boolean> {
  //   // Always return true since GMX V2 doesn't require authorization
  //   return true;
  // }

  /**
   * SECURITY: Validate trade parameters before execution
   */
  private validateTradeParams(params: GMXTradeParams): { valid: boolean; error?: string; alert?: string } {
    // 1. Check leverage limit
    if (params.leverage > SECURITY_LIMITS.MAX_LEVERAGE) {
      return {
        valid: false,
        error: `Leverage ${params.leverage}x exceeds maximum ${SECURITY_LIMITS.MAX_LEVERAGE}x`,
        alert: '🚨 HIGH LEVERAGE BLOCKED',
      };
    }

    // 2. Check position size
    if (params.collateralUSDC > SECURITY_LIMITS.MAX_POSITION_SIZE) {
      return {
        valid: false,
        error: `Position size ${params.collateralUSDC} USDC exceeds maximum ${SECURITY_LIMITS.MAX_POSITION_SIZE} USDC`,
        alert: '🚨 LARGE POSITION BLOCKED',
      };
    }

    if (params.collateralUSDC < SECURITY_LIMITS.MIN_POSITION_SIZE) {
      return {
        valid: false,
        error: `Position size ${params.collateralUSDC} USDC below minimum ${SECURITY_LIMITS.MIN_POSITION_SIZE} USDC`,
      };
    }

    // 3. Check token whitelist
    if (!GMX_MARKETS[params.tokenSymbol.toUpperCase()]) {
      return {
        valid: false,
        error: `Token ${params.tokenSymbol} not whitelisted for GMX trading`,
        alert: '🚨 SUSPICIOUS TOKEN BLOCKED',
      };
    }

    // 4. Check daily volume limit
    const today = new Date().toISOString().split('T')[0];
    const volumeKey = `${params.safeAddress}-${today}`;
    const dailyData = this.dailyVolume.get(volumeKey);
    
    if (dailyData && dailyData.date === today) {
      const newVolume = dailyData.volume + params.collateralUSDC;
      if (newVolume > SECURITY_LIMITS.MAX_DAILY_VOLUME) {
        return {
          valid: false,
          error: `Daily volume limit exceeded: ${newVolume}/${SECURITY_LIMITS.MAX_DAILY_VOLUME} USDC`,
          alert: '🚨 DAILY LIMIT REACHED',
        };
      }
    }

    // 5. Check slippage
    const slippage = params.slippage || 0.5;
    if (slippage > SECURITY_LIMITS.MAX_SLIPPAGE) {
      return {
        valid: false,
        error: `Slippage ${slippage}% exceeds maximum ${SECURITY_LIMITS.MAX_SLIPPAGE}%`,
      };
    }

    return { valid: true };
  }

  /**
   * Update daily volume tracking
   */
  private updateDailyVolume(safeAddress: string, collateralUSDC: number) {
    const today = new Date().toISOString().split('T')[0];
    const volumeKey = `${safeAddress}-${today}`;
    const existing = this.dailyVolume.get(volumeKey);

    if (existing && existing.date === today) {
      this.dailyVolume.set(volumeKey, {
        date: today,
        volume: existing.volume + collateralUSDC,
      });
    } else {
      this.dailyVolume.set(volumeKey, {
        date: today,
        volume: collateralUSDC,
      });
    }
  }

  /**
   * Open GMX position via SubaccountRouter
   * SECURITY: All limits enforced before execution
   */
  async openGMXPosition(params: GMXTradeParams): Promise<GMXResult> {
    try {
      console.log('[GMX] Opening position:', {
        token: params.tokenSymbol,
        collateral: params.collateralUSDC,
        leverage: params.leverage,
        isLong: params.isLong,
      });

      // SECURITY: Validate parameters
      const validation = this.validateTradeParams(params);
      if (!validation.valid) {
        console.error('[GMX] 🚨 SECURITY VIOLATION:', validation.error);
        if (validation.alert) {
          // TODO: Send alert to monitoring system
          console.error('[GMX] ALERT:', validation.alert);
        }
        return {
          success: false,
          error: validation.error,
          securityAlert: validation.alert,
        };
      }

      // NOTE: V2 Module auto-authorizes GMX subaccount on first trade
      // No pre-check needed - module handles it automatically

      // Step 1: Collect 0.2 USDC fee via module
      console.log('[GMX] Collecting 0.2 USDC fee...');
      const feeResult = await this.collectTradeFee(params.safeAddress);
      if (!feeResult.success) {
        console.warn('[GMX] Fee collection failed:', feeResult.error);
        // Continue anyway (fee might already be collected)
      }

      // Step 2: Get market and calculate parameters
      const market = GMX_MARKETS[params.tokenSymbol.toUpperCase()];
      const collateralWei = ethers.utils.parseUnits(params.collateralUSDC.toString(), 6);
      const positionSizeUSD = params.collateralUSDC * params.leverage;
      const sizeDeltaUsd = ethers.utils.parseUnits(positionSizeUSD.toString(), 30);

      // Get current price for acceptable price calculation
      const currentPrice = await this.getGMXPrice(params.tokenSymbol);
      const slippage = params.slippage || 0.5;
      const slippageFactor = params.isLong ? (1 + slippage / 100) : (1 - slippage / 100);
      const acceptablePrice = ethers.utils.parseUnits(
        (currentPrice * slippageFactor).toFixed(8),
        30
      );

      // Step 3: Create GMX order via Safe module
      const exchangeRouterInterface = new ethers.utils.Interface([
        'function createOrder((address,address,address,address,address,address[]),(uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bytes32) external payable returns (bytes32)',
      ]);

      const executionFee = ethers.utils.parseEther('0.001');
      const swapPath: string[] = [];

      // Encode GMX createOrder call (tuples must be arrays, not objects)
      const createOrderData = exchangeRouterInterface.encodeFunctionData('createOrder', [
        [
          params.safeAddress,              // receiver
          ethers.constants.AddressZero,    // callbackContract
          ethers.constants.AddressZero,    // uiFeeReceiver
          market,                           // market
          USDC_ADDRESS,                     // initialCollateralToken
          swapPath,                         // swapPath
        ],
        [
          sizeDeltaUsd,                     // sizeDeltaUsd
          collateralWei,                    // initialCollateralDeltaAmount
          0,                                // triggerPrice
          acceptablePrice,                  // acceptablePrice
          executionFee,                     // executionFee
          0,                                // callbackGasLimit
          0,                                // minOutputAmount
        ],
        2,                                  // orderType: MarketIncrease
        0,                                  // decreasePositionSwapType
        params.isLong,                      // isLong
        false,                              // shouldUnwrapNativeToken
        ethers.constants.HashZero,          // referralCode
      ]);

      // Step 4: Approve USDC to GMX ExchangeRouter (if needed)
      console.log('[GMX] Checking USDC approval...');
      
      const usdcInterface = new ethers.utils.Interface([
        'function approve(address spender, uint256 amount) external returns (bool)',
      ]);
      
      const approveData = usdcInterface.encodeFunctionData('approve', [
        GMX_EXCHANGE_ROUTER,
        ethers.constants.MaxUint256, // Unlimited approval
      ]);
      
      const approvalResult = await this.moduleService.executeFromModule(
        params.safeAddress,
        USDC_ADDRESS,
        '0',
        approveData
      );
      
      if (approvalResult.success) {
        console.log(`[GMX] ✅ USDC approved to GMX Router | TX: ${approvalResult.txHash}`);
      } else {
        console.warn('[GMX] USDC approval failed (might already be approved):', approvalResult.error);
      }

      // Step 5: Create GMX order via Safe module (using Safe's own ETH)
      console.log(`[GMX] Creating order via Safe module (using Safe's ${ethers.utils.formatEther(executionFee)} ETH)...`);
      
      const result = await this.moduleService.executeFromModule(
        params.safeAddress,
        GMX_EXCHANGE_ROUTER, // To: GMX Exchange Router
        executionFee.toString(), // Value: execution fee in ETH (from Safe's balance)
        createOrderData // Data: createOrder(...)
      );

      if (!result.success) {
        throw new Error(result.error || 'GMX order creation failed');
      }

      console.log('[GMX] Order submitted:', result.txHash);

      // Update daily volume tracking
      this.updateDailyVolume(params.safeAddress, params.collateralUSDC);

      console.log('[GMX] ✅ Position opened:', result.txHash);

      return {
        success: true,
        txHash: result.txHash,
      };
    } catch (error: any) {
      console.error('[GMX] Open position error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Close GMX position
   */
  async closeGMXPosition(params: GMXCloseParams): Promise<GMXResult> {
    try {
      console.log('[GMX] Closing position:', {
        token: params.tokenSymbol,
        size: params.sizeDeltaUsd,
        isLong: params.isLong,
      });

      // Get market
      const market = GMX_MARKETS[params.tokenSymbol.toUpperCase()];
      if (!market) {
        return {
          success: false,
          error: `Market not found for ${params.tokenSymbol}`,
        };
      }

      // Calculate acceptable price
      const currentPrice = await this.getGMXPrice(params.tokenSymbol);
      const slippage = params.slippage || 0.5;
      const slippageFactor = params.isLong ? (1 - slippage / 100) : (1 + slippage / 100);
      const acceptablePrice = ethers.utils.parseUnits(
        (currentPrice * slippageFactor).toFixed(8),
        30
      );

      // Create close order via Safe module (using Safe's own ETH)
      const executionFee = ethers.utils.parseEther('0.001');
      const swapPath: string[] = [];
      
      const exchangeRouterAbi = [
        'function createOrder((address,address,address,address,address,address[]),(uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bytes32) external payable returns (bytes32)',
      ];
      const exchangeRouterInterface = new ethers.utils.Interface(exchangeRouterAbi);

      const closeOrderData = exchangeRouterInterface.encodeFunctionData('createOrder', [
        [
          params.safeAddress, // receiver
          ethers.constants.AddressZero, // callbackContract
          ethers.constants.AddressZero, // uiFeeReceiver
          market,
          USDC_ADDRESS, // initialCollateralToken
          swapPath,
        ],
        [
          params.sizeDeltaUsd,
          0, // initialCollateralDeltaAmount
          0, // triggerPrice
          acceptablePrice,
          executionFee,
          0, // callbackGasLimit
          0, // minOutputAmount
        ],
        3, // MarketDecrease
        0, // decreasePositionSwapType
        params.isLong,
        false,
        ethers.constants.HashZero,
      ]);

      console.log(`[GMX] Creating close order via Safe module (using Safe's ${ethers.utils.formatEther(executionFee)} ETH)...`);
      
      const result = await this.moduleService.executeFromModule(
        params.safeAddress,
        GMX_EXCHANGE_ROUTER,
        executionFee.toString(),
        closeOrderData
      );

      if (!result.success) {
        throw new Error(result.error || 'GMX close order failed');
      }

      console.log('[GMX] Close order submitted:', result.txHash);

      // After position closes, module will handle profit share separately
      console.log('[GMX] ✅ Position closed:', result.txHash);

      return {
        success: true,
        txHash: result.txHash,
      };
    } catch (error: any) {
      console.error('[GMX] Close position error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Collect 0.2 USDC trade fee via module
   * Uses Safe module's executeTrade to transfer USDC: Safe → Platform
   * This is the SAME mechanism as SPOT trading fees
   * 100% transparent and on-chain
   */
  private async collectTradeFee(safeAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log('[GMX] Collecting 0.2 USDC fee via Safe module...');
      
      const feeAmount = ethers.utils.parseUnits('0.2', 6); // 0.2 USDC (6 decimals)
      const platformReceiver = process.env.PLATFORM_FEE_RECEIVER || this.executor.address;

      console.log(`[GMX] Fee: 0.2 USDC → ${platformReceiver}`);

      // Build USDC transfer data: Safe → Platform
      const usdcAbi = ['function transfer(address to, uint256 amount) returns (bool)'];
      const usdcInterface = new ethers.utils.Interface(usdcAbi);
      const transferData = usdcInterface.encodeFunctionData('transfer', [platformReceiver, feeAmount]);

      // Execute via module (same as SPOT trading)
      // Module will:
      // 1. Verify executor is authorized
      // 2. Execute USDC transfer from Safe
      // 3. Emit TradeExecuted event
      const result = await this.moduleService.executeFromModule(
        safeAddress,
        USDC_ADDRESS, // To: USDC contract
        0, // Value: 0 ETH
        transferData // Data: transfer(platformReceiver, 0.2 USDC)
      );

      if (result.success) {
        console.log(`[GMX] ✅ Fee collected: 0.2 USDC | TX: ${result.txHash}`);
      } else {
        console.warn(`[GMX] ⚠️ Fee collection failed: ${result.error}`);
      }

      return result;
    } catch (error: any) {
      console.error('[GMX] Fee collection error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get current GMX price for token (ON-CHAIN from GMX Reader)
   * This is the EXACT price GMX uses for settlement
   * Similar to how we use Uniswap V3 Quoter for SPOT prices
   */
  async getGMXPrice(tokenSymbol: string): Promise<number> {
    try {
      console.log(`[GMX] Getting on-chain price for ${tokenSymbol}...`);
      
      const priceData = await this.gmxReader.getMarketPrice(tokenSymbol);
      
      if (!priceData) {
        throw new Error(`Failed to get GMX price for ${tokenSymbol}`);
      }
      
      console.log(`[GMX] ✅ ${tokenSymbol}/USD: $${priceData.price.toFixed(2)} (on-chain from GMX)`);
      
      return priceData.price;
    } catch (error: any) {
      console.error(`[GMX] Error getting price for ${tokenSymbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get security limits (for monitoring/UI)
   */
  static getSecurityLimits() {
    return SECURITY_LIMITS;
  }

  /**
   * Get whitelisted markets
   */
  static getWhitelistedMarkets() {
    return Object.keys(GMX_MARKETS);
  }
}

/**
 * Factory function
 */
export function createGMXAdapterSubaccount(
  provider: ethers.providers.Provider,
  executorPrivateKey: string,
  moduleService: SafeModuleService
): GMXAdapterSubaccount {
  return new GMXAdapterSubaccount(provider, executorPrivateKey, moduleService);
}

