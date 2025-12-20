/**
 * Admin API: Reset Nonce Tracker
 * Fixes "nonce too high" errors by resetting the cached nonce
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { SafeModuleService } from '../../../lib/safe-module-service';
import { ethers } from 'ethers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({
        error: 'Missing required parameter: address',
      });
    }

    // Reset nonce tracker for the specified address
    SafeModuleService.resetNonceTracker(address);
    
    // Reset singleton instance to prevent conflicts
    SafeModuleService.resetSingleton();
    
    // Clear all pending transactions to prevent duplicates
    SafeModuleService.clearPendingTransactions();
    
    // Also force refresh from network
    const provider = new ethers.providers.JsonRpcProvider(process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc');
    const networkNonce = await provider.getTransactionCount(address, 'latest');
    
    console.log(`[Admin] Reset nonce tracker and singleton for ${address}, network nonce: ${networkNonce}`);
    
    return res.status(200).json({
      success: true,
      message: `Nonce tracker reset for ${address}`,
      address,
      networkNonce: networkNonce.toString(),
    });
  } catch (error: any) {
    console.error('[Admin] Reset nonce error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
}
