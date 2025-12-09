import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { ethers } from 'ethers';
const RPC_URLS: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

const V3_MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';

const V3_MODULE_ABI = [
  'function initializeCapital(address safe) external',
  'function safeCapital(address safe) external view returns (uint256)',
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

    if (!safeAddress || !ethers.utils.isAddress(safeAddress)) {
      return res.status(400).json({
        error: 'Invalid Safe address',
      });
    }

    const chain = chainId || 42161;
    const rpcUrl = RPC_URLS[chain];

    if (!rpcUrl) {
      return res.status(400).json({
        error: `Unsupported chainId: ${chain}`,
      });
    }

    console.log(`[InitializeCapital] Initializing capital for Safe: ${safeAddress} on chain ${chain}`);

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const moduleContract = new ethers.Contract(V3_MODULE_ADDRESS, V3_MODULE_ABI, provider);

    // Check current capital
    const currentCapital = await moduleContract.safeCapital(safeAddress);
    console.log(`[InitializeCapital] Current capital: ${ethers.utils.formatUnits(currentCapital, 6)} USDC`);

    if (currentCapital.gt(0)) {
      return res.status(200).json({
        success: true,
        alreadyInitialized: true,
        message: 'Capital already initialized',
        currentCapital: ethers.utils.formatUnits(currentCapital, 6),
        safeAddress,
        chainId: chain,
      });
    }

    // Execute the transaction directly
    const wallet = new ethers.Wallet(process.env.EXECUTOR_PRIVATE_KEY!, provider);
    const moduleWithWallet = new ethers.Contract(V3_MODULE_ADDRESS, V3_MODULE_ABI, wallet);

    console.log(`[InitializeCapital] Executing initializeCapital transaction directly...`);

    try {
      const tx = await moduleWithWallet.initializeCapital(safeAddress, {
        gasLimit: 500000,
      });

      console.log(`[InitializeCapital] Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`[InitializeCapital] Transaction confirmed in block ${receipt.blockNumber}`);

      // Check the new capital amount
      const newCapital = await moduleContract.safeCapital(safeAddress);
      console.log(`[InitializeCapital] New capital: ${ethers.utils.formatUnits(newCapital, 6)} USDC`);

      return res.status(200).json({
        success: true,
        message: 'Capital initialized successfully!',
        safeAddress,
        chainId: chain,
        moduleAddress: V3_MODULE_ADDRESS,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        newCapital: ethers.utils.formatUnits(newCapital, 6),
      });
    } catch (error: any) {
      console.error(`[InitializeCapital] Transaction failed:`, error);
      return res.status(500).json({
        success: false,
        error: `Transaction failed: ${error.message}`,
        safeAddress,
        chainId: chain,
      });
    }

  } catch (error: any) {
    console.error('[InitializeCapital] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate capital initialization transaction data',
    });
  }
  // Note: Don't disconnect - using singleton
}
