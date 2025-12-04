/**
 * Safe Wallet Integration
 * Handles Safe multisig wallet operations for agent trading
 */

import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';

export interface SafeWalletConfig {
  safeAddress: string;
  chainId: number; // 42161 for Arbitrum (default), 11155111 for Sepolia (testnet), 8453 for Base
  rpcUrl: string;
}

export interface TransactionRequest {
  to: string;
  value: string; // in wei
  data: string;
  operation?: 0 | 1; // 0 = Call, 1 = DelegateCall
}

export class SafeWalletService {
  private safeAddress: string;
  private chainId: number;
  private rpcUrl: string;
  private provider: ethers.providers.JsonRpcProvider;

  constructor(config: SafeWalletConfig) {
    this.safeAddress = config.safeAddress;
    this.chainId = config.chainId;
    this.rpcUrl = config.rpcUrl;
    this.provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
  }

  /**
   * Get USDC balance of Safe wallet
   */
  async getUSDCBalance(): Promise<number> {
    const USDC_ADDRESSES: Record<number, string> = {
      11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base
    };

    const usdcAddress = USDC_ADDRESSES[this.chainId];
    if (!usdcAddress) {
      throw new Error(`USDC not configured for chain ${this.chainId}`);
    }

    // ERC20 balanceOf ABI
    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ];

    const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, this.provider);

    const [balance, decimals] = await Promise.all([
      usdcContract.balanceOf(this.safeAddress),
      usdcContract.decimals(),
    ]);

    // Convert from wei to human-readable
    return parseFloat(ethers.utils.formatUnits(balance, decimals));
  }

  /**
   * Get native ETH balance
   */
  async getETHBalance(): Promise<number> {
    const balance = await this.provider.getBalance(this.safeAddress);
    return parseFloat(ethers.utils.formatEther(balance));
  }

  /**
   * Get token balance for any ERC20
   */
  async getTokenBalance(tokenAddress: string): Promise<number> {
    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ];

    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);

    const [balance, decimals] = await Promise.all([
      tokenContract.balanceOf(this.safeAddress),
      tokenContract.decimals(),
    ]);

    return parseFloat(ethers.utils.formatUnits(balance, decimals));
  }

  /**
   * Prepare a transaction for Safe execution
   * Note: This prepares the transaction but doesn't execute it
   * Actual execution requires the Safe SDK to be properly initialized with a signer
   */
  async prepareTransaction(tx: TransactionRequest): Promise<MetaTransactionData> {
    return {
      to: tx.to,
      value: tx.value,
      data: tx.data,
      operation: tx.operation || 0,
    };
  }

  /**
   * Build transaction data for ERC20 token transfer
   */
  buildTokenTransfer(tokenAddress: string, recipient: string, amount: string): TransactionRequest {
    const erc20Interface = new ethers.utils.Interface([
      'function transfer(address to, uint256 amount) returns (bool)',
    ]);

    const data = erc20Interface.encodeFunctionData('transfer', [recipient, amount]);

    return {
      to: tokenAddress,
      value: '0',
      data,
      operation: 0,
    };
  }

  /**
   * Build transaction data for ERC20 token approval
   */
  buildTokenApproval(tokenAddress: string, spender: string, amount: string): TransactionRequest {
    const erc20Interface = new ethers.utils.Interface([
      'function approve(address spender, uint256 amount) returns (bool)',
    ]);

    const data = erc20Interface.encodeFunctionData('approve', [spender, amount]);

    return {
      to: tokenAddress,
      value: '0',
      data,
      operation: 0,
    };
  }

  /**
   * Get Safe wallet info
   */
  async getSafeInfo(): Promise<{
    address: string;
    owners: string[];
    threshold: number;
    nonce: number;
  }> {
    // Safe contract ABI (minimal)
    const safeAbi = [
      'function getOwners() view returns (address[])',
      'function getThreshold() view returns (uint256)',
      'function nonce() view returns (uint256)',
    ];

    const safeContract = new ethers.Contract(this.safeAddress, safeAbi, this.provider);

    const [owners, threshold, nonce] = await Promise.all([
      safeContract.getOwners(),
      safeContract.getThreshold(),
      safeContract.nonce(),
    ]);

    return {
      address: this.safeAddress,
      owners,
      threshold: threshold.toNumber(),
      nonce: nonce.toNumber(),
    };
  }

  /**
   * Validate Safe wallet exists and is properly configured
   */
  async validateSafe(): Promise<{ valid: boolean; error?: string }> {
    try {
      const code = await this.provider.getCode(this.safeAddress);
      
      if (code === '0x' || code === '0x0') {
        return {
          valid: false,
          error: 'Address is not a contract (Safe wallet not found)',
        };
      }

      const info = await this.getSafeInfo();
      
      if (info.owners.length === 0) {
        return {
          valid: false,
          error: 'Safe has no owners',
        };
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Failed to validate Safe',
      };
    }
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(tx: TransactionRequest): Promise<string> {
    try {
      const gasEstimate = await this.provider.estimateGas({
        to: tx.to,
        value: tx.value,
        data: tx.data,
      });
      return gasEstimate.toString();
    } catch (error) {
      console.error('[Safe] Gas estimation failed:', error);
      return '500000'; // Default gas limit
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<string> {
    const gasPrice = await this.provider.getGasPrice();
    return ethers.utils.formatUnits(gasPrice, 'gwei');
  }
}

/**
 * Create Safe wallet service for a deployment
 */
export function createSafeWallet(safeAddress: string, chainId: number): SafeWalletService {
  const RPC_URLS: Record<number, string> = {
    11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
    42161: process.env.ARBITRUM_RPC || process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  };

  const rpcUrl = RPC_URLS[chainId];
  if (!rpcUrl) {
    throw new Error(`RPC URL not configured for chain ${chainId}`);
  }

  return new SafeWalletService({
    safeAddress,
    chainId,
    rpcUrl,
  });
}

/**
 * Chain IDs
 */
export const CHAIN_IDS = {
  SEPOLIA: 11155111,
  ARBITRUM: 42161,
  BASE: 8453,
} as const;

/**
 * Get chain ID for venue
 */
export function getChainIdForVenue(venue: 'SPOT' | 'GMX' | 'HYPERLIQUID'): number {
  // Default to Arbitrum (production)
  // Set USE_SEPOLIA=true env var to use Sepolia testnet
  const useTestnet = process.env.USE_SEPOLIA === 'true';
  
  switch (venue) {
    case 'SPOT':
      return useTestnet ? CHAIN_IDS.SEPOLIA : CHAIN_IDS.ARBITRUM;
    case 'GMX':
      return CHAIN_IDS.ARBITRUM; // GMX on Arbitrum only
    case 'HYPERLIQUID':
      return CHAIN_IDS.ARBITRUM; // Bridge from Arbitrum
    default:
      return useTestnet ? CHAIN_IDS.SEPOLIA : CHAIN_IDS.ARBITRUM;
  }
}
