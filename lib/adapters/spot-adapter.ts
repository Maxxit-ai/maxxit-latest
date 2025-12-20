/**
 * SPOT Trading Adapter
 * Executes spot trades via Uniswap V3 on Arbitrum/Base
 */

import { ethers } from 'ethers';
import { SafeWalletService, TransactionRequest } from '../safe-wallet';

export interface SpotTradeParams {
  tokenIn: string;        // USDC address
  tokenOut: string;       // Target token address
  amountIn: string;       // Amount in wei
  minAmountOut: string;   // Min amount out (slippage protection)
  deadline: number;       // Unix timestamp
  recipient: string;      // Safe wallet address
}

export interface SpotPosition {
  tokenAddress: string;
  amount: string;
  entryPrice: number;
  timestamp: number;
}

/**
 * SPOT Adapter for DEX trading
 */
export class SpotAdapter {
  private chainId: number;
  private safeWallet: SafeWalletService;

  // Uniswap V3 Router addresses
  private static readonly ROUTERS: Record<number, string> = {
    11155111: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Sepolia testnet (SwapRouter02)
    42161: '0xE592427A0AEce92De3Edee1F18E0157C05861564',   // Arbitrum
    8453: '0x2626664c2603336E57B271c5C0b26F421741e481',    // Base
  };

  // Uniswap V3 Quoter addresses
  private static readonly QUOTERS: Record<number, string> = {
    11155111: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3', // Sepolia testnet
    42161: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',   // Arbitrum
    8453: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',    // Base
  };

  constructor(safeWallet: SafeWalletService, chainId: number) {
    this.safeWallet = safeWallet;
    this.chainId = chainId;
  }

  /**
   * Get router address for chain
   */
  static getRouterAddress(chainId: number): string | undefined {
    return SpotAdapter.ROUTERS[chainId];
  }

  /**
   * Get quote for swap (how much output for given input)
   */
  async getQuote(params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    fee?: number; // 500 = 0.05%, 3000 = 0.3%, 10000 = 1%
  }): Promise<{ amountOut: string; priceImpact: number }> {
    const quoterAddress = SpotAdapter.QUOTERS[this.chainId];
    if (!quoterAddress) {
      throw new Error(`Quoter not configured for chain ${this.chainId}`);
    }

    // QuoterV2 for Sepolia, QuoterV1 for others
    const isSepoliaOrTestnet = this.chainId === 11155111;
    
    const quoterV2Abi = [
      'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
    ];
    
    const quoterV1Abi = [
      'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
    ];

    let rpcUrl: string;
    if (this.chainId === 11155111) {
      rpcUrl = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com';
    } else if (this.chainId === 42161) {
      rpcUrl = process.env.ARBITRUM_RPC || process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
    } else {
      rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const quoterAbi = isSepoliaOrTestnet ? quoterV2Abi : quoterV1Abi;
    const quoter = new ethers.Contract(quoterAddress, quoterAbi, provider);

    try {
      // Use 0.3% fee tier for Arbitrum/Base (standard), 1% for Sepolia testnet
      const defaultFee = this.chainId === 11155111 ? 10000 : 3000;
      const fee = params.fee || defaultFee;
      let amountOut: ethers.BigNumber;

      if (isSepoliaOrTestnet) {
        // QuoterV2 uses struct parameter
        const quoteParams = {
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          fee,
          sqrtPriceLimitX96: 0,
        };
        const result = await quoter.callStatic.quoteExactInputSingle(quoteParams);
        amountOut = result.amountOut || result[0];
      } else {
        // QuoterV1 uses individual parameters
        amountOut = await quoter.callStatic.quoteExactInputSingle(
          params.tokenIn,
          params.tokenOut,
          fee,
          params.amountIn,
          0
        );
      }

      // Calculate price impact (simplified)
      const priceImpact = 0.5; // TODO: Calculate actual price impact

      return {
        amountOut: amountOut.toString(),
        priceImpact,
      };
    } catch (error) {
      console.error('[SpotAdapter] Quote failed:', error);
      throw new Error('Failed to get quote');
    }
  }

  /**
   * Build transaction to approve token spending
   */
  async buildApprovalTx(tokenAddress: string, amount: string): Promise<TransactionRequest> {
    const routerAddress = SpotAdapter.ROUTERS[this.chainId];
    if (!routerAddress) {
      throw new Error(`Router not configured for chain ${this.chainId}`);
    }

    return this.safeWallet.buildTokenApproval(tokenAddress, routerAddress, amount);
  }

  /**
   * Build transaction to swap tokens (USDC → Token)
   */
  async buildSwapTx(params: SpotTradeParams): Promise<TransactionRequest> {
    const routerAddress = SpotAdapter.ROUTERS[this.chainId];
    if (!routerAddress) {
      throw new Error(`Router not configured for chain ${this.chainId}`);
    }

    // Uniswap V3 Router ABI
    const routerInterface = new ethers.utils.Interface([
      'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
    ]);

    // Use 0.3% fee tier for Arbitrum/Base (standard)
    // Use 1% fee tier for Sepolia testnet (best liquidity on testnet)
    const feeToUse = this.chainId === 11155111 ? 10000 : 3000;
    
    const swapParams = {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      fee: feeToUse, // 1% for Sepolia, 0.3% for production
      recipient: params.recipient,
      deadline: params.deadline,
      amountIn: params.amountIn,
      amountOutMinimum: params.minAmountOut,
      sqrtPriceLimitX96: 0, // No price limit
    };

    const data = routerInterface.encodeFunctionData('exactInputSingle', [swapParams]);

    return {
      to: routerAddress,
      value: '0',
      data,
      operation: 0,
    };
  }

  /**
   * Build transaction to swap tokens back (Token → USDC)
   */
  async buildCloseSwapTx(params: {
    tokenIn: string;
    tokenOut: string; // USDC
    amountIn: string;
    minAmountOut: string;
    recipient: string;
    deadline: number;
  }): Promise<TransactionRequest> {
    return this.buildSwapTx({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      minAmountOut: params.minAmountOut,
      recipient: params.recipient,
      deadline: params.deadline,
    });
  }

  /**
   * Calculate minimum amount out with slippage protection
   */
  calculateMinAmountOut(amountOut: string, slippageBps: number = 5000): string {
    // TEMPORARY: Default to 50% tolerance for testing
    // slippageBps: 5000 = 50%, 300 = 3%, 100 = 1%, 50 = 0.5%
    const amount = ethers.BigNumber.from(amountOut);
    const slippage = amount.mul(slippageBps).div(10000);
    return amount.sub(slippage).toString();
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
    estimatedGas?: string;
    usdcBalance?: number;
    quote?: any;
  }> {
    try {
      // Check USDC balance
      const usdcBalance = await this.safeWallet.getUSDCBalance();

      // Get position size
      const positionSize = (usdcBalance * params.signal.size_model.value) / 100;

      if (positionSize === 0) {
        return {
          canExecute: false,
          reason: 'Insufficient USDC balance',
          usdcBalance,
        };
      }

      // TODO: Get quote and estimate gas

      return {
        canExecute: true,
        usdcBalance,
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
 * Create SPOT adapter for a Safe wallet
 */
export function createSpotAdapter(
  safeWallet: SafeWalletService,
  chainId: number
): SpotAdapter {
  return new SpotAdapter(safeWallet, chainId);
}
