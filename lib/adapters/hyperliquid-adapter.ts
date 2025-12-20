/**
 * Hyperliquid Perpetuals Adapter
 * Executes leveraged perpetual positions on Hyperliquid
 * Integrates with Python service for Hyperliquid SDK
 */

import { ethers } from 'ethers';
import { SafeWalletService, TransactionRequest } from '../safe-wallet';

export interface HyperliquidPositionParams {
  coin: string;             // Token symbol (e.g., 'BTC', 'ETH')
  isBuy: boolean;           // true = LONG, false = SHORT
  sz: number;               // Size in base units
  limitPx: number;          // Limit price (0 for market order)
  reduceOnly: boolean;      // true for closing positions
  slippage?: number;        // Slippage tolerance (default 1%)
}

export interface HyperliquidPosition {
  coin: string;
  szi: string;              // Position size (positive = long, negative = short)
  entryPx: string;          // Entry price
  positionValue: string;    // Position value in USD
  unrealizedPnl: string;    // Unrealized P&L
  liquidationPx: string;    // Liquidation price
  leverage: string;         // Current leverage
}

/**
 * Hyperliquid Adapter for Perpetual Trading
 * Uses Python service for SDK integration
 */
export class HyperliquidAdapter {
  private safeWallet: SafeWalletService;
  private agentPrivateKey?: string;
  private userWalletAddress?: string;  // User's wallet address on Hyperliquid (for delegation)

  // Check if using testnet
  private static readonly IS_TESTNET = process.env.HYPERLIQUID_TESTNET === 'true';
  
  // Hyperliquid Bridge addresses
  private static readonly HL_BRIDGE_MAINNET = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';
  private static readonly HL_BRIDGE_TESTNET = '0xAf8912a3245a9E7Fc1881fAD1a07cdbc89905266'; // Testnet bridge
  private static readonly HL_BRIDGE = HyperliquidAdapter.IS_TESTNET 
    ? HyperliquidAdapter.HL_BRIDGE_TESTNET 
    : HyperliquidAdapter.HL_BRIDGE_MAINNET;
  
  // Hyperliquid Python Service endpoint
  private static readonly HL_SERVICE = process.env.HYPERLIQUID_SERVICE_URL || 'http://localhost:5001';

  // USDC addresses (Arbitrum Sepolia for testnet, Arbitrum One for mainnet)
  private static readonly USDC_MAINNET = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
  private static readonly USDC_TESTNET = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'; // Arbitrum Sepolia USDC
  private static readonly USDC = HyperliquidAdapter.IS_TESTNET 
    ? HyperliquidAdapter.USDC_TESTNET 
    : HyperliquidAdapter.USDC_MAINNET;

  constructor(safeWallet: SafeWalletService, agentPrivateKey?: string, userWalletAddress?: string) {
    this.safeWallet = safeWallet;
    this.agentPrivateKey = agentPrivateKey;
    this.userWalletAddress = userWalletAddress;  // Optional: user's wallet on Hyperliquid (for delegation)
  }

  /**
   * Call Python service endpoint
   */
  private async callService(endpoint: string, data: any): Promise<any> {
    try {
      const response = await fetch(`${HyperliquidAdapter.HL_SERVICE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Service error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error(`[Hyperliquid] Service call failed (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Build transaction to bridge USDC to Hyperliquid
   */
  async buildBridgeTx(amount: string, destination: string): Promise<TransactionRequest> {
    const bridgeInterface = new ethers.utils.Interface([
      'function bridgeIn(address token, uint256 amount, address destination) external',
    ]);

    const data = bridgeInterface.encodeFunctionData('bridgeIn', [
      HyperliquidAdapter.USDC,
      amount,
      destination,
    ]);

    return {
      to: HyperliquidAdapter.HL_BRIDGE,
      value: '0',
      data,
      operation: 0,
    };
  }

  /**
   * Build transaction to approve USDC for bridge
   */
  async buildBridgeApprovalTx(amount: string): Promise<TransactionRequest> {
    return this.safeWallet.buildTokenApproval(
      HyperliquidAdapter.USDC,
      HyperliquidAdapter.HL_BRIDGE,
      amount
    );
  }

  /**
   * Open position via Hyperliquid Python service
   */
  async openPosition(params: {
    coin: string;
    isBuy: boolean;
    size: number;
    leverage: number;
    limitPrice?: number;
    slippage?: number;
  }): Promise<{ success: boolean; orderId?: string; error?: string; result?: any }> {
    try {
      if (!this.agentPrivateKey) {
        throw new Error('Agent private key required for Hyperliquid trading');
      }

      console.log('[Hyperliquid] Opening position:', {
        coin: params.coin,
        isBuy: params.isBuy,
        size: params.size,
        leverage: params.leverage,
      });

      // Call Python service to open position
      const result = await this.callService('/open-position', {
        agentPrivateKey: this.agentPrivateKey,
        coin: params.coin,
        isBuy: params.isBuy,
        size: params.size,
        limitPx: params.limitPrice || null, // null = market order
        slippage: params.slippage || 0.01, // 1% default
        reduceOnly: false,
        // Pass user's wallet address for agent delegation
        // Agent signs transactions on behalf of the user's Hyperliquid account
        vaultAddress: this.userWalletAddress,
      });

      if (result.success) {
        console.log('[Hyperliquid] Position opened successfully:', result.result);
        return {
          success: true,
          orderId: result.result?.statuses?.[0]?.resting?.oid,
          result: result.result,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to open position',
        };
      }
    } catch (error: any) {
      console.error('[Hyperliquid] Open position failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Close position via Hyperliquid Python service
   */
  async closePosition(params: {
    coin: string;
    size: number;
    slippage?: number;
  }): Promise<{ success: boolean; orderId?: string; error?: string; result?: any }> {
    try {
      if (!this.agentPrivateKey) {
        throw new Error('Agent private key required for Hyperliquid trading');
      }

      console.log('[Hyperliquid] Closing position:', params.coin, params.size);

      // Call Python service to close position
      const result = await this.callService('/close-position', {
        agentPrivateKey: this.agentPrivateKey,
        coin: params.coin,
        size: params.size,
        slippage: params.slippage || 0.01,
      });

      if (result.success) {
        console.log('[Hyperliquid] Position closed successfully:', result.result);
        return {
          success: true,
          orderId: result.result?.statuses?.[0]?.resting?.oid,
          result: result.result,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to close position',
        };
      }
    } catch (error: any) {
      console.error('[Hyperliquid] Close position failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get current positions via Python service
   */
  async getPositions(address: string): Promise<HyperliquidPosition[]> {
    try {
      const result = await this.callService('/positions', { address });
      
      if (result.success) {
        return result.positions || [];
      } else {
        console.error('[Hyperliquid] Failed to fetch positions:', result.error);
        return [];
      }
    } catch (error) {
      console.error('[Hyperliquid] Failed to fetch positions:', error);
      return [];
    }
  }

  /**
   * Get account balance on Hyperliquid via Python service
   */
  async getBalance(address: string): Promise<{ withdrawable: number; total: number }> {
    try {
      const result = await this.callService('/balance', { address });
      
      if (result.success) {
        return {
          withdrawable: result.withdrawable || 0,
          total: result.accountValue || 0,
        };
      } else {
        console.error('[Hyperliquid] Failed to fetch balance:', result.error);
        return { withdrawable: 0, total: 0 };
      }
    } catch (error) {
      console.error('[Hyperliquid] Failed to fetch balance:', error);
      return { withdrawable: 0, total: 0 };
    }
  }

  /**
   * Get market info for a token via Python service
   */
  async getMarketInfo(coin: string): Promise<{
    price: number;
    maxLeverage?: number;
    szDecimals?: number;
  } | null> {
    try {
      const result = await this.callService('/market-info', { coin });
      
      if (result.success) {
        return {
          price: result.price || 0,
          maxLeverage: result.maxLeverage,
          szDecimals: result.szDecimals,
        };
      } else {
        console.error('[Hyperliquid] Failed to fetch market info:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[Hyperliquid] Failed to fetch market info:', error);
      return null;
    }
  }

  /**
   * Get execution summary
   */
  async getExecutionSummary(params: {
    signal: any;
    safeAddress: string;
  }): Promise<{
    canExecute: boolean;
    reason?: string;
    hlBalance?: { withdrawable: number; total: number };
    usdcBalance?: number;
    needsBridge?: boolean;
    bridgeAmount?: number;
  }> {
    try {
      // Check Arbitrum USDC balance
      const usdcBalance = await this.safeWallet.getUSDCBalance();

      // Check Hyperliquid balance
      const hlBalance = await this.getBalance(params.safeAddress);

      // Calculate required amount
      const requiredCollateral = (usdcBalance * params.signal.size_model.value) / 100;

      // Check if we need to bridge
      const needsBridge = hlBalance.withdrawable < requiredCollateral;
      const bridgeAmount = needsBridge ? requiredCollateral - hlBalance.withdrawable : 0;

      if (needsBridge && usdcBalance < bridgeAmount) {
        return {
          canExecute: false,
          reason: 'Insufficient USDC on Arbitrum to bridge',
          usdcBalance,
          hlBalance,
          needsBridge,
          bridgeAmount,
        };
      }

      // Check if market exists
      const marketInfo = await this.getMarketInfo(params.signal.token_symbol);
      if (!marketInfo) {
        return {
          canExecute: false,
          reason: `Market not available for ${params.signal.token_symbol}`,
          usdcBalance,
          hlBalance,
        };
      }

      return {
        canExecute: true,
        usdcBalance,
        hlBalance,
        needsBridge,
        bridgeAmount,
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
 * Create Hyperliquid adapter for a Safe wallet
 */
export function createHyperliquidAdapter(
  safeWallet: SafeWalletService, 
  agentPrivateKey?: string,
  userWalletAddress?: string
): HyperliquidAdapter {
  return new HyperliquidAdapter(safeWallet, agentPrivateKey, userWalletAddress);
}

/**
 * Note on Hyperliquid Integration:
 * 
 * Hyperliquid trading requires signing orders with the wallet's private key.
 * For Safe wallets (multisig), we use an "agent wallet" approach:
 * 
 * 1. Each Safe deployment has a dedicated agent wallet (EOA)
 * 2. Users bridge USDC from their Safe to Hyperliquid (via Arbitrum bridge)
 * 3. The agent wallet executes trades on Hyperliquid on behalf of the user
 * 4. Profit receiver can collect fees from trades
 * 5. Users maintain non-custodial control via Safe on Arbitrum L1
 * 
 * Security:
 * - Agent wallets are generated per-deployment
 * - Private keys stored encrypted in database
 * - Trading limits enforced in module
 * - Users can always withdraw from Hyperliquid directly
 */
