/**
 * Admin API: Test Nonce Management
 * Tests the nonce system to ensure it's working correctly
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { SafeModuleService } from '../../../lib/safe-module-service';
import { ethers } from 'ethers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const executorAddress = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';
    
    // Get network nonce directly
    const provider = new ethers.providers.JsonRpcProvider(process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc');
    const networkNonce = await provider.getTransactionCount(executorAddress, 'latest');
    const pendingNonce = await provider.getTransactionCount(executorAddress, 'pending');
    
    // Create a SafeModuleService instance to test nonce management
    const moduleService = new SafeModuleService({
      chainId: 42161,
      moduleAddress: '0xa87f82433294cE8A3C8f08Ec5D2825e946C0c0FE',
      executorPrivateKey: process.env.EXECUTOR_PRIVATE_KEY || '',
      rpcUrl: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    });
    
    // Test force refresh
    const refreshedNonce = await moduleService.forceRefreshNonce();
    
    return res.status(200).json({
      success: true,
      executorAddress,
      networkNonce: networkNonce.toString(),
      pendingNonce: pendingNonce.toString(),
      refreshedNonce: refreshedNonce.toString(),
      nonceMatch: networkNonce === refreshedNonce,
    });
  } catch (error: any) {
    console.error('[Admin] Test nonce error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
}
