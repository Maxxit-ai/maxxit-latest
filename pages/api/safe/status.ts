/**
 * Safe Wallet Status API
 * Check Safe wallet info, balances, and validation
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createSafeWallet } from '../../../lib/safe-wallet';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress, chainId } = req.query;

    if (!safeAddress) {
      return res.status(400).json({
        error: 'Missing required parameter: safeAddress',
      });
    }

    if (!isValidAddress(safeAddress as string)) {
      return res.status(400).json({
        error: 'Invalid Ethereum address format',
      });
    }

    const chain = parseInt(chainId as string) || 42161; // Default to Arbitrum

    if (![11155111, 42161, 8453].includes(chain)) {
      return res.status(400).json({
        error: 'Invalid chainId. Supported: 11155111 (Sepolia), 42161 (Arbitrum), 8453 (Base)',
      });
    }

    // Create Safe wallet service
    const safeService = createSafeWallet(safeAddress as string, chain);

    // Validate Safe
    const validation = await safeService.validateSafe();
    
    if (!validation.valid) {
      return res.status(400).json({
        valid: false,
        error: validation.error,
      });
    }

    // Get Safe info
    const safeInfo = await safeService.getSafeInfo();
    const usdcBalance = await safeService.getUSDCBalance();
    const ethBalance = await safeService.getETHBalance();
    const gasPrice = await safeService.getGasPrice();

    // Determine readiness for trading (GASLESS - we cover gas fees!)
    const readiness = {
      hasUSDC: usdcBalance > 0,
      minUSDCForTrading: 1, // Minimum recommended
      ready: usdcBalance >= 1, // Only USDC needed - we cover gas!
      gasless: true, // Platform covers all gas fees
    };

    return res.status(200).json({
      valid: true,
      safe: {
        address: safeInfo.address,
        chainId: chain,
        chainName: chain === 11155111 ? 'Sepolia' : chain === 42161 ? 'Arbitrum' : 'Base',
        owners: safeInfo.owners,
        threshold: safeInfo.threshold,
        nonce: safeInfo.nonce,
      },
      balances: {
        usdc: {
          amount: usdcBalance,
          formatted: `${usdcBalance.toFixed(2)} USDC`,
        },
        eth: {
          amount: ethBalance,
          formatted: `${ethBalance.toFixed(4)} ETH`,
        },
      },
      network: {
        gasPrice: `${gasPrice} Gwei`,
      },
      readiness: {
        ...readiness,
        warnings: [
          !readiness.hasUSDC ? 'Deposit USDC to start trading' : null,
          usdcBalance > 0 && usdcBalance < 1 ? 'USDC balance below minimum ($1)' : null,
        ].filter(Boolean),
        status: readiness.ready ? 'READY' : 'NOT_READY',
        message: readiness.gasless ? '✨ Gasless trading - we cover all gas fees!' : null,
      },
      message: readiness.ready
        ? '✨ Safe wallet ready! Gasless trading - we cover gas fees'
        : 'Deposit USDC to start trading',
    });
  } catch (error: any) {
    console.error('[SafeStatus] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to check Safe status',
    });
  }
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
