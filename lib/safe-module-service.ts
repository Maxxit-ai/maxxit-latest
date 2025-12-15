/**
 * Safe Module Service
 * Interacts with MaxxitTradingModule for non-custodial trading
 */

import { ethers } from 'ethers';

// Module ABI (V2 - actual deployed contract on Arbitrum)
const MODULE_ABI = [
  // V2 Setup
  'function completeSetup() external',
  
  // SPOT Trading (V2 simplified signatures)
  'function executeTrade(address safe, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint24 poolFee, address profitReceiver) external returns (uint256)',
  'function closePosition(address safe, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint24 poolFee, address agentOwner, uint256 entryValueUSDC) external returns (uint256)',
  
  // GMX Trading
  'function executeGMXOrder(address safe, address market, address collateralToken, uint256 collateralAmount, uint256 sizeDeltaUsd, bool isLong, uint256 acceptablePrice, address profitReceiver) external payable returns (bytes32)',
  'function closeGMXPosition(address safe, address market, uint256 sizeDeltaUsd, bool isLong, uint256 acceptablePrice, address profitReceiver) external payable returns (int256)',
  
  // Capital Management
  'function initializeCapital(address safe) external',
  
  // View Functions
  'function getCapital(address safe) external view returns (uint256)',
  'function getSafeStats(address safe) external view returns (bool initialized, uint256 initialCapital, uint256 currentCapital, int256 profitLoss, uint256 profitTaken, uint256 unrealizedProfit)',
  'function isTokenWhitelisted(address safe, address token) public view returns (bool)',
  
  // Admin Functions
  'function setTokenWhitelist(address safe, address token, bool enabled) external',
  'function setTokenWhitelistBatch(address safe, address[] calldata tokens, bool enabled) external',
  'function executeFromModule(address safe, address to, uint256 value, bytes calldata data) external returns (bool success)',
  
  // Events
  'event TradeExecuted(address indexed safe, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event SetupCompleted(address indexed safe, uint256 timestamp)',
  'event CapitalInitialized(address indexed safe, uint256 amount)',
  'event TradeFeeCollected(address indexed safe, address indexed receiver, uint256 amount)',
  'event ProfitShareDistributed(address indexed safe, address indexed agentOwner, uint256 amount)',
  'event TokenWhitelistUpdated(address indexed safe, address indexed token, bool enabled)',
];

export interface ModuleConfig {
  moduleAddress: string;
  chainId: number;
  executorPrivateKey: string;
  rpcUrl?: string;
}

export interface SafeStats {
  initialized: boolean;
  initialCapital: string;
  currentBalance: string;
  profitLoss: string;
  profitTaken: string;
  unrealizedProfit: string;
}

export interface TradeParams {
  safeAddress: string;
  fromToken: string;
  toToken: string;
  amountIn: string;
  dexRouter: string;
  swapData: string;
  minAmountOut: string;
  profitReceiver: string; // Address to receive 20% profit share (agent creator)
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  amountOut?: string;
  feeCharged?: string;
  profitShare?: string;
  error?: string;
}

export interface GMXOrderParams {
  safeAddress: string;
  market: string;              // GMX market token address
  collateralAmount: string;    // USDC collateral (in wei, 6 decimals)
  sizeDeltaUsd: string;        // Position size USD (in wei, 30 decimals)
  isLong: boolean;
  acceptablePrice: string;     // Max price for long, min for short (30 decimals)
  executionFee: string;        // ETH for keeper (in wei, 18 decimals)
  profitReceiver: string;      // Agent creator address
}

export interface GMXCloseParams {
  safeAddress: string;
  market: string;
  sizeDeltaUsd: string;        // Size to close (30 decimals)
  isLong: boolean;
  acceptablePrice: string;     // Min price for long, max for short (30 decimals)
  executionFee: string;        // ETH for keeper
  profitReceiver: string;      // Agent creator address
}

export interface GMXResult {
  success: boolean;
  txHash?: string;
  orderKey?: string;
  realizedPnL?: string;
  profitShare?: string;
  error?: string;
}

export class SafeModuleService {
  private provider: ethers.providers.Provider;
  private executor: ethers.Wallet;
  public readonly module: ethers.Contract;
  public readonly chainId: number;
  private static nonceTracker: Map<string, number> = new Map();
  private static nonceLocks: Map<string, Promise<void>> = new Map();
  private static pendingTransactions: Map<string, Promise<any>> = new Map();

  constructor(config: ModuleConfig) {
    this.chainId = config.chainId;

    // Setup provider
    const rpcUrls: { [chainId: number]: string } = {
      42161: config.rpcUrl || process.env.ARBITRUM_RPC || process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    };

    this.provider = new ethers.providers.JsonRpcProvider(rpcUrls[config.chainId]);

    // Setup executor wallet
    this.executor = new ethers.Wallet(config.executorPrivateKey, this.provider);

    // Setup module contract
    this.module = new ethers.Contract(
      config.moduleAddress,
      MODULE_ABI,
      this.executor
    );
  }

  /**
   * Get next nonce for executor wallet (with proper lock to prevent race conditions)
   * This ensures concurrent transactions get sequential nonces
   */
  private async getNextNonce(): Promise<number> {
    const address = this.executor.address;
    
    // Wait for any pending lock for this address
    while (SafeModuleService.nonceLocks.has(address)) {
      await SafeModuleService.nonceLocks.get(address);
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to avoid tight loop
    }
    
    // Create a new lock for this nonce request
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    SafeModuleService.nonceLocks.set(address, lockPromise);
    
    try {
      // Get cached nonce first
      let cachedNonce = SafeModuleService.nonceTracker.get(address);
      
      // If no cached nonce or it's stale, fetch from network
      if (cachedNonce === undefined) {
        const networkNonce = await this.provider.getTransactionCount(address, 'latest');
        cachedNonce = networkNonce;
        console.log(`[SafeModule] Fresh network nonce: ${networkNonce} for ${address}`);
      } else {
        // Verify cached nonce is still valid
        const networkNonce = await this.provider.getTransactionCount(address, 'latest');
        if (networkNonce > cachedNonce) {
          console.log(`[SafeModule] Cached nonce stale (${cachedNonce}), using network nonce: ${networkNonce}`);
          cachedNonce = networkNonce;
        } else {
          console.log(`[SafeModule] Using cached nonce: ${cachedNonce} (network: ${networkNonce})`);
        }
      }
      
      // Increment and store for next call
      const nonceToUse = cachedNonce;
      SafeModuleService.nonceTracker.set(address, cachedNonce + 1);
      
      return nonceToUse;
    } finally {
      // Release lock
      SafeModuleService.nonceLocks.delete(address);
      releaseLock!();
    }
  }
  
  /**
   * Reset nonce tracker (useful for testing or after errors)
   */
  public static resetNonceTracker(address?: string) {
    if (address) {
      SafeModuleService.nonceTracker.delete(address);
      console.log(`[SafeModule] Reset nonce tracker for ${address}`);
    } else {
      SafeModuleService.nonceTracker.clear();
      console.log('[SafeModule] Reset all nonce trackers');
    }
  }

  /**
   * Reset singleton instance (useful for testing or configuration changes)
   */
  public static resetSingleton() {
    singletonInstance = null;
    console.log('[SafeModule] Singleton instance reset');
  }

  /**
   * Clear all pending transactions (useful for cleanup)
   */
  public static clearPendingTransactions() {
    SafeModuleService.pendingTransactions.clear();
    console.log('[SafeModule] All pending transactions cleared');
  }

  /**
   * Force refresh nonce from network (bypasses cache)
   */
  public async forceRefreshNonce(): Promise<number> {
    const address = this.executor.address;
    const networkNonce = await this.provider.getTransactionCount(address, 'latest');
    SafeModuleService.nonceTracker.set(address, networkNonce);
    console.log(`[SafeModule] Force refreshed nonce: ${networkNonce} for ${address}`);
    return networkNonce;
  }

  /**
   * Initialize capital tracking for a Safe (call before first trade)
   */
  async initializeCapital(safeAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const tx = await this.module.initializeCapital(safeAddress);
      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error('[SafeModule] Initialize capital error:', error);
      return {
        success: false,
        error: error.message || 'Failed to initialize capital',
      };
    }
  }

  /**
   * Get executor address
   */
  getExecutorAddress(): string {
    return this.executor.address;
  }

  /**
   * Execute arbitrary transaction via module (for V2 module)
   * Used for GMX trades, fee collection, profit distribution, etc.
   */
  async executeFromModule(params: {
    safeAddress: string;
    to: string;
    value: string | ethers.BigNumber;
    data: string;
    operation?: number; // 0 = CALL, 1 = DELEGATECALL
  }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const { safeAddress, to, value, data, operation = 0 } = params;
    try {
      console.log('[SafeModule] Executing from module (V2):', {
        safe: safeAddress,
        to,
        value: value.toString(),
        dataLength: data.length,
        operation,
      });

      // Get next nonce to prevent race conditions
      const nonce = await this.getNextNonce();
      
      // Call module's executeFromModule function (V2 - operation is hardcoded to CALL)
      let tx;
      try {
        tx = await this.module.executeFromModule(
          safeAddress,
          to,
          value,
          data,
          {
            gasLimit: 1500000,
            nonce,
          }
        );
      } catch (error: any) {
        console.log('[SafeModule] Transaction error caught:', {
          message: error.message,
          code: error.code,
          reason: error.reason,
          fullError: JSON.stringify(error, null, 2)
        });
        
        // Handle nonce errors by resetting nonce tracker
        if (error.message && (
          error.message.includes('nonce too high') || 
          error.message.includes('nonce too low') ||
          error.message.includes('invalid nonce') ||
          error.message.includes('replacement transaction underpriced') ||
          error.message.includes('nonce') // Catch any nonce-related error
        )) {
          console.log('[SafeModule] Nonce error detected, resetting nonce tracker and forcing network refresh');
          SafeModuleService.resetNonceTracker(this.executor.address);
          
          // Force refresh from network instead of using cached nonce
          const freshNonce = await this.forceRefreshNonce();
          console.log('[SafeModule] Retrying with fresh nonce:', freshNonce);
          
          tx = await this.module.executeFromModule(
            safeAddress,
            to,
            value,
            data,
            {
              gasLimit: 1500000,
              nonce: freshNonce,
            }
          );
        } else {
          console.log('[SafeModule] Non-nonce error, re-throwing:', error.message);
          throw error; // Re-throw if it's not a nonce error
        }
      }

      console.log('[SafeModule] Transaction sent:', tx.hash, 'with nonce:', nonce);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 0) {
        return {
          success: false,
          error: 'Transaction reverted',
        };
      }

      console.log('[SafeModule] Transaction confirmed:', receipt.transactionHash);

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error('[SafeModule] Execute from module failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a trade through the module
   */
  async executeTrade(params: TradeParams): Promise<TradeResult> {
    try {
      // Create unique transaction key to prevent duplicates
      const txKey = `trade_${params.safeAddress}_${params.fromToken}_${params.toToken}_${params.amountIn}`;
      
      // Check if transaction is already pending
      if (SafeModuleService.pendingTransactions.has(txKey)) {
        console.log('[SafeModule] Trade already pending, waiting for completion');
        return await SafeModuleService.pendingTransactions.get(txKey);
      }

      console.log('[SafeModule] Executing trade (V2):', {
        safe: params.safeAddress,
        from: params.fromToken,
        to: params.toToken,
        amountIn: params.amountIn,
        profitReceiver: params.profitReceiver,
      });

      // Create pending transaction promise
      const tradePromise = this.executeTradeTransaction(params);
      SafeModuleService.pendingTransactions.set(txKey, tradePromise);

      try {
        const result = await tradePromise;
        return result;
      } finally {
        // Clean up pending transaction
        SafeModuleService.pendingTransactions.delete(txKey);
      }
    } catch (error: any) {
      console.error('[SafeModule] Execute trade error:', error);
      return {
        success: false,
        error: error.message || 'Trade execution failed',
      };
    }
  }

  private async executeTradeTransaction(params: TradeParams): Promise<TradeResult> {
    try {
      // V2 contract uses individual parameters, not a struct
      // Default pool fee: 3000 = 0.3% (most common Uniswap V3 tier)
      const poolFee = 3000;

      // Get next nonce to prevent race conditions
      const nonce = await this.getNextNonce();
      
      let tx;
      try {
        tx = await this.module.executeTrade(
          params.safeAddress,         // address safe
          params.fromToken,            // address tokenIn
          params.toToken,              // address tokenOut
          params.amountIn,             // uint256 amountIn
          params.minAmountOut,         // uint256 minAmountOut
          poolFee,                     // uint24 poolFee
          params.profitReceiver,       // address profitReceiver
          {
            gasLimit: 300000, // Optimized for Arbitrum (typical: ~200k)
            nonce,
          }
        );
      } catch (error: any) {
        console.log('[SafeModule] Transaction error caught:', {
          message: error.message,
          code: error.code,
          reason: error.reason,
          fullError: JSON.stringify(error, null, 2)
        });
        
        // Handle nonce errors by resetting nonce tracker
        if (error.message && (
          error.message.includes('nonce too high') || 
          error.message.includes('nonce too low') ||
          error.message.includes('invalid nonce') ||
          error.message.includes('replacement transaction underpriced') ||
          error.message.includes('nonce') // Catch any nonce-related error
        )) {
          console.log('[SafeModule] Nonce error detected, resetting nonce tracker and forcing network refresh');
          SafeModuleService.resetNonceTracker(this.executor.address);
          
          // Force refresh from network instead of using cached nonce
          const freshNonce = await this.forceRefreshNonce();
          console.log('[SafeModule] Retrying with fresh nonce:', freshNonce);
          
          tx = await this.module.executeTrade(
            params.safeAddress,         // address safe
            params.fromToken,            // address tokenIn
            params.toToken,              // address tokenOut
            params.amountIn,             // uint256 amountIn
            params.minAmountOut,         // uint256 minAmountOut
            poolFee,                     // uint24 poolFee
            params.profitReceiver,       // address profitReceiver
            {
              gasLimit: 300000, // Optimized for Arbitrum (typical: ~200k)
              nonce: freshNonce,
            }
          );
        } else {
          console.log('[SafeModule] Non-nonce error, re-throwing:', error.message);
          throw error; // Re-throw if it's not a nonce error
        }
      }

      console.log('[SafeModule] Transaction sent:', tx.hash, 'with nonce:', nonce);

      // Wait for confirmation
      const receipt = await tx.wait();

      console.log('[SafeModule] Transaction confirmed:', receipt.transactionHash);

      // Parse events - V2 events have simpler structure
      const tradeEvent = receipt.events?.find(
        (e: any) => e.event === 'TradeExecuted'
      );

      let amountOut: string | undefined;

      if (tradeEvent) {
        amountOut = tradeEvent.args.amountOut.toString();
      }

      return {
        success: true,
        txHash: receipt.transactionHash,
        amountOut,
        feeCharged: '200000', // 0.2 USDC (hardcoded in V2 contract)
        profitShare: undefined, // Calculated on close, not on open
      };
    } catch (error: any) {
      console.error('[SafeModule] Execute trade error:', error);
      return {
        success: false,
        error: error.message || 'Trade execution failed',
      };
    }
  }

  /**
   * Close a position by swapping tokens back to USDC with profit sharing
   */
  async closePosition(params: {
    safeAddress: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    profitReceiver: string;
    entryValueUSDC: string; // Original entry value in USDC (6 decimals)
  }): Promise<TradeResult> {
    try {
      // Create unique transaction key to prevent duplicates
      const txKey = `close_${params.safeAddress}_${params.tokenIn}_${params.amountIn}`;
      
      // Check if transaction is already pending
      if (SafeModuleService.pendingTransactions.has(txKey)) {
        console.log('[SafeModule] Close position already pending, waiting for completion');
        return await SafeModuleService.pendingTransactions.get(txKey);
      }

      console.log('[SafeModule] Closing position (V2):', {
        safe: params.safeAddress,
        token: params.tokenIn,
        amount: params.amountIn,
        entryValue: params.entryValueUSDC,
        profitReceiver: params.profitReceiver,
      });

      // Create pending transaction promise
      const closePromise = this.executeClosePosition(params);
      SafeModuleService.pendingTransactions.set(txKey, closePromise);

      try {
        const result = await closePromise;
        return result;
      } finally {
        // Clean up pending transaction
        SafeModuleService.pendingTransactions.delete(txKey);
      }
    } catch (error: any) {
      console.error('[SafeModule] Close position error:', error);
      return {
        success: false,
        error: error.message || 'Close position failed',
      };
    }
  }

  private async executeClosePosition(params: {
    safeAddress: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    profitReceiver: string;
    entryValueUSDC: string;
  }): Promise<TradeResult> {
    try {
      // V2 contract closePosition function
      const poolFee = 3000; // 0.3%

      // Get next nonce to prevent race conditions
      const nonce = await this.getNextNonce();
      
      const tx = await this.module.closePosition(
        params.safeAddress,         // address safe
        params.tokenIn,              // address tokenIn
        params.tokenOut,             // address tokenOut (USDC)
        params.amountIn,             // uint256 amountIn
        params.minAmountOut,         // uint256 minAmountOut
        poolFee,                     // uint24 poolFee
        params.profitReceiver,       // address agentOwner
        params.entryValueUSDC,       // uint256 entryValueUSDC
        {
          gasLimit: 250000, // Optimized for Arbitrum close operations
          nonce,
        }
      );

      console.log('[SafeModule] Close position transaction sent:', tx.hash, 'with nonce:', nonce);

      // Wait for confirmation
      const receipt = await tx.wait();

      console.log('[SafeModule] Close position confirmed:', receipt.transactionHash);

      // Parse result
      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error('[SafeModule] Close position error:', error);
      return {
        success: false,
        error: error.message || 'Close position failed',
      };
    }
  }

  /**
   * Get Safe trading statistics
   */
  async getSafeStats(safeAddress: string): Promise<SafeStats> {
    try {
      const stats = await this.module.getSafeStats(safeAddress);

      return {
        initialized: stats.initialized,
        initialCapital: ethers.utils.formatUnits(stats.initial, 6), // USDC has 6 decimals
        currentBalance: ethers.utils.formatUnits(stats.current, 6),
        profitLoss: ethers.utils.formatUnits(stats.profitLoss, 6),
        profitTaken: ethers.utils.formatUnits(stats.profitTaken, 6),
        unrealizedProfit: ethers.utils.formatUnits(stats.unrealizedProfit, 6),
      };
    } catch (error: any) {
      console.error('[SafeModule] Get stats error:', error);
      throw error;
    }
  }

  /**
   * Check if Safe is ready for trading
   * V2 auto-initializes, so just check if capital is set
   */
  async isReadyForTrading(safeAddress: string): Promise<boolean> {
    try {
      const capital = await this.module.getCapital(safeAddress);
      return capital.gt(0);
    } catch (error: any) {
      console.error('[SafeModule] Is ready check error:', error);
      return false;
    }
  }

  /**
   * Get current profit/loss
   */
  async getCurrentProfitLoss(safeAddress: string): Promise<string> {
    try {
      const profitLoss = await this.module.getCurrentProfitLoss(safeAddress);
      return ethers.utils.formatUnits(profitLoss, 6);
    } catch (error: any) {
      console.error('[SafeModule] Get profit/loss error:', error);
      return '0';
    }
  }

  /**
   * Check if token is already approved for DEX
   */
  async checkTokenApproval(
    safeAddress: string,
    tokenAddress: string,
    spender: string
  ): Promise<boolean> {
    try {
      const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
      const allowance = await tokenContract.allowance(safeAddress, spender);
      
      // Check if allowance is greater than a reasonable threshold
      const isApproved = allowance.gt(ethers.utils.parseEther('100000')); // 100k tokens
      console.log('[SafeModule] Token approval check:', {
        token: tokenAddress,
        safe: safeAddress,
        spender,
        allowance: allowance.toString(),
        isApproved,
      });
      
      return isApproved;
    } catch (error: any) {
      console.error('[SafeModule] Check approval error:', error);
      return false;
    }
  }

  /**
   * Approve token for DEX router (one-time setup)
   */
  async approveTokenForDex(
    safeAddress: string,
    tokenAddress: string,
    dexRouter: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log('[SafeModule] Approving token for DEX:', {
        safe: safeAddress,
        token: tokenAddress,
        dexRouter,
      });

      // V2 module doesn't have approveTokenForDex function
      // Instead, use executeFromModule to call ERC20.approve() directly
      const erc20Abi = ['function approve(address spender, uint256 amount) returns (bool)'];
      const erc20Interface = new ethers.utils.Interface(erc20Abi);
      const approveData = erc20Interface.encodeFunctionData('approve', [
        dexRouter,
        ethers.constants.MaxUint256, // Approve max amount
      ]);

      // Get next nonce to prevent race conditions
      const nonce = await this.getNextNonce();

      const tx = await this.module.executeFromModule(
        safeAddress,
        tokenAddress, // to: token contract
        0, // value: 0
        approveData, // data: approve(dexRouter, maxUint256)
        {
          gasLimit: 300000,
          nonce, // Explicit nonce to prevent conflicts
        }
      );

      console.log('[SafeModule] Approval transaction sent:', tx.hash);

      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log('[SafeModule] Approval confirmed');
        return {
          success: true,
          txHash: receipt.transactionHash,
        };
      } else {
        return {
          success: false,
          error: 'Approval transaction reverted',
        };
      }
    } catch (error: any) {
      console.error('[SafeModule] Approval error:', error);
      return {
        success: false,
        error: error.message || 'Approval failed',
      };
    }
  }

  /**
   * Get unrealized profit (profit that would be taken on next close)
   */
  async getUnrealizedProfit(safeAddress: string): Promise<string> {
    try {
      const profit = await this.module.getUnrealizedProfit(safeAddress);
      return ethers.utils.formatUnits(profit, 6);
    } catch (error: any) {
      console.error('[SafeModule] Get unrealized profit error:', error);
      return '0';
    }
  }

  /**
   * Get potential profit share amount
   */
  async getPotentialProfitShare(safeAddress: string): Promise<string> {
    try {
      const share = await this.module.getPotentialProfitShare(safeAddress);
      return ethers.utils.formatUnits(share, 6);
    } catch (error: any) {
      console.error('[SafeModule] Get profit share error:', error);
      return '0';
    }
  }

  /**
   * Reset capital tracking (admin function, called by Safe itself)
   */
  async resetCapitalTracking(safeAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const tx = await this.module.resetCapitalTracking(safeAddress);
      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error('[SafeModule] Reset tracking error:', error);
      return {
        success: false,
        error: error.message || 'Failed to reset tracking',
      };
    }
  }

  // Admin functions (only module owner can call)

  /**
   * Authorize/unauthorize an executor
   */
  async setExecutorAuthorization(executor: string, status: boolean): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const tx = await this.module.setExecutorAuthorization(executor, status);
      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error('[SafeModule] Set executor authorization error:', error);
      return {
        success: false,
        error: error.message || 'Failed to set executor authorization',
      };
    }
  }

  /**
   * Whitelist/unwhitelist a DEX
   */
  async setDexWhitelist(dex: string, status: boolean): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const tx = await this.module.setDexWhitelist(dex, status);
      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error('[SafeModule] Set DEX whitelist error:', error);
      return {
        success: false,
        error: error.message || 'Failed to set DEX whitelist',
      };
    }
  }

  /**
   * Check if token is whitelisted for a Safe
   */
  async checkTokenWhitelist(safeAddress: string, tokenAddress: string): Promise<boolean> {
    try {
      const isWhitelisted = await this.module.isTokenWhitelisted(safeAddress, tokenAddress);
      return isWhitelisted;
    } catch (error: any) {
      console.error('[SafeModule] Check token whitelist error:', error);
      return false;
    }
  }

  /**
   * Whitelist/unwhitelist a token for a Safe
   */
  async setTokenWhitelist(safeAddress: string, tokenAddress: string, status: boolean): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const nonce = await this.getNextNonce();
      
      const tx = await this.module.setTokenWhitelist(safeAddress, tokenAddress, status, {
        gasLimit: 300000,
        nonce,
      });
      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error('[SafeModule] Set token whitelist error:', error);
      return {
        success: false,
        error: error.message || 'Failed to set token whitelist',
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // GMX TRADING FUNCTIONS (V2)
  // ═══════════════════════════════════════════════════════════

  /**
   * Setup GMX trading for a Safe (one-time setup)
   */
  async setupGMXTrading(safeAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log('[SafeModule] Setting up GMX trading for Safe:', safeAddress);

      const nonce = await this.getNextNonce();

      const tx = await this.module.setupGMXTrading(safeAddress, {
        gasLimit: 300000,
        nonce,
      });

      console.log('[SafeModule] GMX setup transaction sent:', tx.hash);

      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log('[SafeModule] GMX setup confirmed');
        return {
          success: true,
          txHash: receipt.transactionHash,
        };
      } else {
        return {
          success: false,
          error: 'GMX setup transaction reverted',
        };
      }
    } catch (error: any) {
      console.error('[SafeModule] GMX setup error:', error);
      return {
        success: false,
        error: error.message || 'GMX setup failed',
      };
    }
  }

  /**
   * Execute GMX perpetual order (open position)
   */
  async executeGMXOrder(params: GMXOrderParams): Promise<GMXResult> {
    try {
      console.log('[SafeModule] Executing GMX order:', {
        safe: params.safeAddress,
        market: params.market,
        collateral: params.collateralAmount,
        size: params.sizeDeltaUsd,
        isLong: params.isLong,
        profitReceiver: params.profitReceiver,
      });

      // Build order params struct
      const orderParams = {
        safe: params.safeAddress,
        market: params.market,
        collateralAmount: params.collateralAmount,
        sizeDeltaUsd: params.sizeDeltaUsd,
        isLong: params.isLong,
        acceptablePrice: params.acceptablePrice,
        executionFee: params.executionFee,
        profitReceiver: params.profitReceiver,
      };

      // Get next nonce
      const nonce = await this.getNextNonce();

      // Call module (payable - sends ETH for execution fee)
      const tx = await this.module.executeGMXOrder(orderParams, {
        value: params.executionFee,
        gasLimit: 1500000, // GMX orders need more gas
        nonce,
      });

      console.log('[SafeModule] GMX order transaction sent:', tx.hash, 'with nonce:', nonce);

      const receipt = await tx.wait();

      console.log('[SafeModule] GMX order confirmed:', receipt.transactionHash);

      // Parse GMXOrderCreated event
      const orderEvent = receipt.events?.find(
        (e: any) => e.event === 'GMXOrderCreated'
      );

      let orderKey: string | undefined;
      let feeCharged: string | undefined;

      if (orderEvent) {
        orderKey = orderEvent.args.orderKey;
        feeCharged = orderEvent.args.feeCharged.toString();
      }

      return {
        success: true,
        txHash: receipt.transactionHash,
        orderKey,
      };
    } catch (error: any) {
      console.error('[SafeModule] GMX order error:', error);
      return {
        success: false,
        error: error.message || 'GMX order execution failed',
      };
    }
  }

  /**
   * Close GMX perpetual position
   */
  async closeGMXPosition(params: GMXCloseParams): Promise<GMXResult> {
    try {
      console.log('[SafeModule] Closing GMX position:', {
        safe: params.safeAddress,
        market: params.market,
        size: params.sizeDeltaUsd,
        isLong: params.isLong,
        profitReceiver: params.profitReceiver,
      });

      // Build close params struct
      const closeParams = {
        safe: params.safeAddress,
        market: params.market,
        sizeDeltaUsd: params.sizeDeltaUsd,
        isLong: params.isLong,
        acceptablePrice: params.acceptablePrice,
        executionFee: params.executionFee,
        profitReceiver: params.profitReceiver,
      };

      // Get next nonce
      const nonce = await this.getNextNonce();

      // Call module (payable - sends ETH for execution fee)
      const tx = await this.module.closeGMXPosition(closeParams, {
        value: params.executionFee,
        gasLimit: 1500000,
        nonce,
      });

      console.log('[SafeModule] GMX close transaction sent:', tx.hash, 'with nonce:', nonce);

      const receipt = await tx.wait();

      console.log('[SafeModule] GMX position closed:', receipt.transactionHash);

      // Parse GMXPositionClosed event
      const closeEvent = receipt.events?.find(
        (e: any) => e.event === 'GMXPositionClosed'
      );

      let realizedPnL: string | undefined;
      let profitShare: string | undefined;

      if (closeEvent) {
        realizedPnL = closeEvent.args.realizedPnL.toString();
        profitShare = closeEvent.args.profitShare.toString();
      }

      return {
        success: true,
        txHash: receipt.transactionHash,
        realizedPnL,
        profitShare,
      };
    } catch (error: any) {
      console.error('[SafeModule] GMX close error:', error);
      return {
        success: false,
        error: error.message || 'GMX position close failed',
      };
    }
  }

  /**
   * Check if Safe is ready for GMX trading
   */
  async isReadyForGMX(safeAddress: string): Promise<boolean> {
    try {
      // V2 auto-initializes, so just check if capital is set
      const capital = await this.module.getCapital(safeAddress);
      return capital.gt(0);
    } catch (error: any) {
      console.error('[SafeModule] Is ready for GMX check error:', error);
      return false;
    }
  }
}

// Singleton instance to prevent multiple nonce conflicts
let singletonInstance: SafeModuleService | null = null;

// Factory function with singleton pattern
export function createSafeModuleService(
  moduleAddress: string,
  chainId: number,
  executorPrivateKey?: string
): SafeModuleService {
  // Return existing singleton if it exists and matches the config
  if (singletonInstance && 
      singletonInstance.chainId === chainId &&
      singletonInstance.module.address === moduleAddress) {
    console.log('[SafeModule] Using existing singleton instance');
    return singletonInstance;
  }

  const privateKey = executorPrivateKey || process.env.EXECUTOR_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('EXECUTOR_PRIVATE_KEY is required');
  }

  console.log('[SafeModule] Creating new singleton instance');
  singletonInstance = new SafeModuleService({
    moduleAddress,
    chainId,
    executorPrivateKey: privateKey,
  });

  return singletonInstance;
}
