/**
 * Enable Module API
 * Proposes enableModule transaction to Safe Transaction Service
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';

// RPC URLs for different chains
const RPC_URLS: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

const SAFE_TX_SERVICE_URLS: { [chainId: number]: string } = {
  11155111: 'https://safe-transaction-sepolia.safe.global',
  42161: 'https://safe-transaction-arbitrum.safe.global',
  8453: 'https://safe-transaction-base.safe.global',
};

const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';
const EXECUTOR_PRIVATE_KEY = process.env.EXECUTOR_PRIVATE_KEY;

// Safe contract ABI (minimal - just what we need)
const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
  'function enableModule(address module) external',
  'function getModules() external view returns (address[])',
  'function nonce() external view returns (uint256)',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress, moduleAddress: customModuleAddress, chainId } = req.body;
    
    // Default to Arbitrum if no chainId provided
    const chain = chainId || 42161;
    const rpcUrl = RPC_URLS[chain];
    
    if (!rpcUrl) {
      return res.status(400).json({
        error: `Unsupported chainId: ${chain}`,
      });
    }
    
    // Allow custom module address, or use default from env
    const moduleToEnable = customModuleAddress || MODULE_ADDRESS;

    if (!safeAddress || !ethers.utils.isAddress(safeAddress)) {
      return res.status(400).json({
        error: 'Invalid Safe address',
      });
    }

    // Connect to the specified chain
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Check if Safe exists
    const code = await provider.getCode(safeAddress);
    if (code === '0x') {
      const chainName = chain === 11155111 ? 'Sepolia' : chain === 42161 ? 'Arbitrum' : 'Base';
      return res.status(400).json({
        error: `Safe wallet not found on ${chainName}`,
        safeAddress,
        chainId: chain,
      });
    }

    // Create Safe contract instance
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);

    // Check if module is already enabled
    let isEnabled = false;
    try {
      isEnabled = await safe.isModuleEnabled(moduleToEnable);
    } catch (error) {
      console.error('[EnableModule] Error checking module status:', error);
    }

    if (isEnabled) {
      return res.status(200).json({
        success: true,
        alreadyEnabled: true,
        message: 'Module is already enabled',
        moduleAddress: moduleToEnable,
      });
    }

    // Return complete transaction data including encoded module address
    
    // Generate enableModule transaction data (module address is encoded inside)
    const iface = new ethers.utils.Interface(SAFE_ABI);
    const txData = iface.encodeFunctionData('enableModule', [moduleToEnable]);

    // Get Safe nonce for frontend
    const nonce = await safe.nonce();

    console.log('[EnableModule] Transaction data prepared:', {
      to: safeAddress,
      data: txData,
      moduleAddress: moduleToEnable,
      dataDecoded: `enableModule(${moduleToEnable})`,
    });

    return res.status(200).json({
      success: true,
      alreadyEnabled: false,
      needsEnabling: true,
      transaction: {
        to: safeAddress,
        data: txData, // This includes the module address encoded
        value: '0',
      },
      nonce: nonce.toString(),
      safeAddress,
      moduleAddress: moduleToEnable, // For display purposes
      chainId: chain,
      message: 'Complete transaction data ready - just paste in Safe',
      // Helpful for debugging
      decoded: {
        function: 'enableModule',
        parameter: moduleToEnable,
      },
    });
  } catch (error: any) {
    console.error('[EnableModule] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to propose module enablement',
    });
  }
}
