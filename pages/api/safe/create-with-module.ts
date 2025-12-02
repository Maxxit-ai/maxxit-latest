/**
 * Create Safe Account with Module Enabled
 * Creates a new Safe account with the trading module enabled in a single transaction
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import Safe, { EthersAdapter, SafeFactory, SafeAccountConfig } from '@safe-global/protocol-kit';
import { ethers } from 'ethers';

// Module addresses
const MODULE_ADDRESSES: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_MODULE_ADDRESS || '0xa87f82433294cE8A3C8f08Ec5D2825e946C0c0FE',
  42161: process.env.ARBITRUM_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb', // V3 module
};

const RPC_URLS: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ownerAddress, chainId = 42161 } = req.body;

    if (!ownerAddress || !ethers.utils.isAddress(ownerAddress)) {
      return res.status(400).json({
        error: 'Invalid owner address',
      });
    }

    const moduleAddress = MODULE_ADDRESSES[chainId];
    const rpcUrl = RPC_URLS[chainId];

    if (!moduleAddress || !rpcUrl) {
      return res.status(400).json({
        error: `Unsupported chainId: ${chainId}`,
      });
    }

    console.log('[CreateSafeWithModule] Creating Safe for owner:', ownerAddress, 'on chain:', chainId);

    // This endpoint prepares the transaction data for the frontend to execute
    // The frontend will use MetaMask to sign and broadcast the transaction
    
    // Calculate the Safe address that will be deployed
    // We use a predictable nonce (0 for first Safe) and the module setup data
    
    // Create the setup data for enabling the module during deployment
    const safeInterface = new ethers.utils.Interface([
      'function enableModule(address module) external',
    ]);
    
    const enableModuleData = safeInterface.encodeFunctionData('enableModule', [moduleAddress]);

    // Create Safe configuration with module
    // Safe deployment will call setup() with this data, enabling the module on creation
    const safeAccountConfig: SafeAccountConfig = {
      owners: [ownerAddress],
      threshold: 1,
    };

    // Return the configuration for frontend to deploy
    return res.status(200).json({
      success: true,
      config: {
        owners: [ownerAddress],
        threshold: 1,
        moduleAddress,
        enableModuleData,
        chainId,
      },
      message: 'Safe configuration ready. Frontend will deploy Safe with module enabled.',
      instructions: {
        step1: 'Connect wallet',
        step2: 'Sign Safe deployment transaction',
        step3: 'Safe will be created with trading module enabled',
      },
    });

  } catch (error: any) {
    console.error('[CreateSafeWithModule] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to prepare Safe creation',
    });
  }
}

