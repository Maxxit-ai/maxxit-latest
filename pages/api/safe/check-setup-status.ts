/**
 * Check Safe Setup Status
 * Returns module and USDC approval status without creating deployment
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';

const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com';
const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
];

const ERC20_ABI = [
  'function allowance(address owner, address spender) external view returns (uint256)',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress, chainId } = req.body;

    if (!safeAddress || !chainId) {
      return res.status(400).json({
        error: 'Missing required fields: safeAddress, chainId',
      });
    }

    // Get correct RPC URL for chain
    const rpcUrl = chainId === 42161 ? ARBITRUM_RPC : SEPOLIA_RPC;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // Check if module is enabled
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);
    const moduleEnabled = await safe.isModuleEnabled(MODULE_ADDRESS);

    console.log('[CheckSetupStatus] Module enabled:', moduleEnabled);

    // Check if USDC is approved FOR THE MODULE
    const USDC_ADDRESS = chainId === 42161 
      ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' // Arbitrum
      : '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia
    
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const allowance = await usdc.allowance(safeAddress, MODULE_ADDRESS);
    const usdcApproved = allowance.gt(0);

    console.log('[CheckSetupStatus] USDC approved for module:', usdcApproved, 'Allowance:', allowance.toString());

    // Determine what needs to be done
    const needsSetup = !moduleEnabled || !usdcApproved;

    return res.status(200).json({
      success: true,
      moduleEnabled,
      usdcApproved,
      needsSetup,
      setupRequired: {
        enableModule: !moduleEnabled,
        approveUsdc: !usdcApproved,
      },
    });

  } catch (error: any) {
    console.error('[CheckSetupStatus] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to check setup status',
    });
  }
}

