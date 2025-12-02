/**
 * Auto-Initialize Capital After Safe is Funded
 * Call this after user sends USDC to their Safe
 */

import { ethers } from 'ethers';
import type { NextApiRequest, NextApiResponse } from 'next';

const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';
const RPC_URL = process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc';
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const MODULE_ABI = [
  'function initializeCapital(address safe) external',
  'function safeCapital(address safe) view returns (uint256)',
  'function authorizedExecutors(address) view returns (bool)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { safeAddress } = req.body;

  if (!safeAddress || !/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
    return res.status(400).json({ error: 'Invalid Safe address' });
  }

  try {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('No private key configured');
    }

    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Check if caller is authorized
    const module = new ethers.Contract(MODULE_ADDRESS, MODULE_ABI, wallet);
    const isAuthorized = await module.authorizedExecutors(wallet.address);

    if (!isAuthorized) {
      return res.status(403).json({ 
        error: 'Backend wallet is not authorized',
        walletAddress: wallet.address,
      });
    }

    // Check if already initialized
    const currentCapital = await module.safeCapital(safeAddress);
    if (currentCapital.gt(0)) {
      return res.status(200).json({
        success: true,
        alreadyInitialized: true,
        capital: ethers.utils.formatUnits(currentCapital, 6),
        message: 'Capital already initialized',
      });
    }

    // Check USDC balance
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const usdcBalance = await usdc.balanceOf(safeAddress);

    if (usdcBalance.eq(0)) {
      return res.status(400).json({
        error: 'Safe has no USDC balance. Please fund the Safe first.',
        safeAddress,
      });
    }

    // Initialize capital
    console.log(`[AutoInit] Initializing capital for Safe: ${safeAddress}`);
    console.log(`[AutoInit] USDC Balance: ${ethers.utils.formatUnits(usdcBalance, 6)} USDC`);

    const tx = await module.initializeCapital(safeAddress, {
      gasLimit: 200000,
    });

    console.log(`[AutoInit] Transaction sent: ${tx.hash}`);
    await tx.wait();

    const newCapital = await module.safeCapital(safeAddress);
    console.log(`[AutoInit] Capital initialized: ${ethers.utils.formatUnits(newCapital, 6)} USDC`);

    return res.status(200).json({
      success: true,
      initialized: true,
      capital: ethers.utils.formatUnits(newCapital, 6),
      txHash: tx.hash,
      message: 'Capital initialized successfully',
    });

  } catch (error: any) {
    console.error('[AutoInit] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to initialize capital',
    });
  }
}

