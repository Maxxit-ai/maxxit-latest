/**
 * Safe Transaction Service
 * Handles Safe transaction proposal, signing, and execution
 */

import Safe from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';
import { ethers } from 'ethers';
import { TransactionRequest } from './safe-wallet';

export interface SafeTransactionConfig {
  safeAddress: string;
  chainId: number;
  signerPrivateKey?: string; // Optional - for execution
}

export interface TransactionResult {
  success: boolean;
  safeTxHash?: string;
  txHash?: string;
  requiresMoreSignatures?: boolean;
  signaturesNeeded?: number;
  error?: string;
}

/**
 * Safe Transaction Service
 * Handles transaction proposal and execution
 */
export class SafeTransactionService {
  private safeAddress: string;
  private chainId: number;
  private provider: ethers.providers.JsonRpcProvider;
  private signer?: ethers.Wallet;

  // Safe Transaction Service URLs
  private static readonly SAFE_SERVICE_URLS: Record<number, string> = {
    42161: 'https://safe-transaction-arbitrum.safe.global',
    8453: 'https://safe-transaction-base.safe.global',
  };

  constructor(config: SafeTransactionConfig) {
    this.safeAddress = config.safeAddress;
    this.chainId = config.chainId;

    // Setup provider
    const rpcUrls: Record<number, string> = {
      42161: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    };

    this.provider = new ethers.providers.JsonRpcProvider(rpcUrls[this.chainId]);

    // Setup signer if private key provided
    if (config.signerPrivateKey) {
      this.signer = new ethers.Wallet(config.signerPrivateKey, this.provider);
    }
  }

  /**
   * Propose a transaction to the Safe
   * This creates the transaction but doesn't execute it
   */
  async proposeTransaction(
    transaction: TransactionRequest,
    description?: string
  ): Promise<TransactionResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: 'No signer configured - cannot propose transaction',
        };
      }

      // Initialize Safe SDK with new v5 API
      const safeSdk = await Safe.init({
        provider: this.provider.connection.url,
        signer: this.signer.privateKey,
        safeAddress: this.safeAddress,
      });

      // Create Safe transaction
      const safeTransaction = await safeSdk.createTransaction({
        transactions: [{
          to: transaction.to,
          value: transaction.value,
          data: transaction.data,
          operation: transaction.operation || 0,
        }],
      });

      // Sign the transaction
      const signedTransaction = await safeSdk.signTransaction(safeTransaction);
      const safeTxHash = await safeSdk.getTransactionHash(signedTransaction);

      // Get Safe info
      const threshold = await safeSdk.getThreshold();
      const owners = await safeSdk.getOwners();

      // If threshold is 1, execute immediately
      if (threshold === 1) {
        try {
          const executeTxResponse = await safeSdk.executeTransaction(signedTransaction);
          const receipt = await executeTxResponse.transactionResponse?.wait();

          return {
            success: true,
            safeTxHash,
            txHash: receipt?.transactionHash,
            requiresMoreSignatures: false,
          };
        } catch (execError: any) {
          console.error('[SafeTx] Execution failed:', execError);
          return {
            success: false,
            safeTxHash,
            error: `Transaction signed but execution failed: ${execError.message}`,
          };
        }
      }

      // For multi-sig, propose to Safe Transaction Service
      const serviceUrl = SafeTransactionService.SAFE_SERVICE_URLS[this.chainId];
      if (serviceUrl) {
        try {
          const safeService = new SafeApiKit({
            txServiceUrl: serviceUrl,
            ethAdapter: this.ethAdapter,
          });

          await safeService.proposeTransaction({
            safeAddress: this.safeAddress,
            safeTransactionData: signedTransaction.data,
            safeTxHash,
            senderAddress: await this.signer!.getAddress(),
            senderSignature: signedTransaction.encodedSignatures(),
          });

          return {
            success: true,
            safeTxHash,
            requiresMoreSignatures: true,
            signaturesNeeded: threshold - 1,
          };
        } catch (apiError: any) {
          console.warn('[SafeTx] Could not propose to service:', apiError.message);
          // Still return success as transaction is signed locally
        }
      }

      return {
        success: true,
        safeTxHash,
        requiresMoreSignatures: true,
        signaturesNeeded: threshold - 1,
      };
    } catch (error: any) {
      console.error('[SafeTx] Propose failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to propose transaction',
      };
    }
  }

  /**
   * Execute a transaction that has enough signatures
   */
  async executeTransaction(safeTxHash: string): Promise<TransactionResult> {
    try {
      if (!this.ethAdapter) {
        return {
          success: false,
          error: 'No signer configured - cannot execute transaction',
        };
      }

      const safeSdk = await Safe.create({
        ethAdapter: this.ethAdapter,
        safeAddress: this.safeAddress,
      });

      const serviceUrl = SafeTransactionService.SAFE_SERVICE_URLS[this.chainId];
      if (!serviceUrl) {
        return {
          success: false,
          error: 'Safe Transaction Service not available for this chain',
        };
      }

      const safeService = new SafeApiKit({
        txServiceUrl: serviceUrl,
        ethAdapter: this.ethAdapter,
      });

      // Get transaction from service
      const safeTransaction = await safeService.getTransaction(safeTxHash);
      
      // Execute
      const executeTxResponse = await safeSdk.executeTransaction(safeTransaction as any);
      const receipt = await executeTxResponse.transactionResponse?.wait();

      return {
        success: true,
        safeTxHash,
        txHash: receipt?.transactionHash,
      };
    } catch (error: any) {
      console.error('[SafeTx] Execute failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to execute transaction',
      };
    }
  }

  /**
   * Simulate transaction execution (for testing)
   */
  async simulateTransaction(transaction: TransactionRequest): Promise<{
    success: boolean;
    gasEstimate?: string;
    error?: string;
  }> {
    try {
      const gasEstimate = await this.provider.estimateGas({
        from: this.safeAddress,
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
      });

      return {
        success: true,
        gasEstimate: gasEstimate.toString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Simulation failed',
      };
    }
  }

  /**
   * Get pending transactions for Safe
   */
  async getPendingTransactions(): Promise<any[]> {
    try {
      if (!this.ethAdapter) {
        return [];
      }

      const serviceUrl = SafeTransactionService.SAFE_SERVICE_URLS[this.chainId];
      if (!serviceUrl) {
        return [];
      }

      const safeService = new SafeApiKit({
        txServiceUrl: serviceUrl,
        ethAdapter: this.ethAdapter,
      });

      const pendingTxs = await safeService.getPendingTransactions(this.safeAddress);
      return pendingTxs.results;
    } catch (error) {
      console.error('[SafeTx] Failed to get pending transactions:', error);
      return [];
    }
  }

  /**
   * Batch multiple transactions into one
   */
  async batchTransactions(
    transactions: TransactionRequest[]
  ): Promise<TransactionResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: 'No signer configured',
        };
      }

      // Initialize Safe SDK with new v5 API
      const safeSdk = await Safe.init({
        provider: this.provider.connection.url,
        signer: this.signer.privateKey,
        safeAddress: this.safeAddress,
      });

      // Create batch transaction with new v5 API
      const batchTransaction = await safeSdk.createTransaction({
        transactions: transactions.map(tx => ({
          to: tx.to,
          value: tx.value,
          data: tx.data,
          operation: tx.operation || 0,
        })),
      });

      // Sign
      const signedTransaction = await safeSdk.signTransaction(batchTransaction);
      const safeTxHash = await safeSdk.getTransactionHash(signedTransaction);

      // Get threshold
      const threshold = await safeSdk.getThreshold();

      // Execute if threshold is 1
      if (threshold === 1) {
        const executeTxResponse = await safeSdk.executeTransaction(signedTransaction);
        const receipt = await executeTxResponse.transactionResponse?.wait();

        return {
          success: true,
          safeTxHash,
          txHash: receipt?.transactionHash,
        };
      }

      // Otherwise, propose (multisig with threshold > 1)
      const serviceUrl = SafeTransactionService.SAFE_SERVICE_URLS[this.chainId];
      if (serviceUrl) {
        const safeService = new SafeApiKit({
          chainId: BigInt(this.chainId),
        });

        await safeService.proposeTransaction({
          safeAddress: this.safeAddress,
          safeTransactionData: signedTransaction.data,
          safeTxHash,
          senderAddress: await this.signer!.getAddress(),
          senderSignature: signedTransaction.encodedSignatures(),
        });
      }

      return {
        success: true,
        safeTxHash,
        requiresMoreSignatures: true,
        signaturesNeeded: threshold - 1,
      };
    } catch (error: any) {
      console.error('[SafeTx] Batch transaction failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * Create Safe transaction service
 */
export function createSafeTransactionService(
  safeAddress: string,
  chainId: number,
  signerPrivateKey?: string
): SafeTransactionService {
  return new SafeTransactionService({
    safeAddress,
    chainId,
    signerPrivateKey,
  });
}
