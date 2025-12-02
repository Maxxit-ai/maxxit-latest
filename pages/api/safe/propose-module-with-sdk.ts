/**
 * Propose Enable Module Transaction using Safe SDK
 * Uses Safe Protocol Kit to properly create and propose the transaction
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import Safe, { EthersAdapter } from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';
import { ethers } from 'ethers';

const MODULE_ADDRESS = process.env.MODULE_ADDRESS || '0xa87f82433294cE8A3C8f08Ec5D2825e946C0c0FE';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress } = req.body;

    if (!safeAddress || !ethers.utils.isAddress(safeAddress)) {
      return res.status(400).json({ error: 'Invalid Safe address' });
    }

    console.log('[ProposeSafeSDK] Creating Safe SDK instance...');

    // Create provider and adapter
    const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);
    const ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: provider,
    });

    // Initialize Safe Protocol Kit
    const protocolKit = await Safe.create({
      ethAdapter,
      safeAddress,
    });

    // Check if module is already enabled
    const isEnabled = await protocolKit.isModuleEnabled(MODULE_ADDRESS);
    
    if (isEnabled) {
      return res.status(200).json({
        success: true,
        alreadyEnabled: true,
        message: 'Module is already enabled',
      });
    }

    console.log('[ProposeSafeSDK] Creating enableModule transaction...');

    // Create the enableModule transaction using Safe SDK
    const safeTransaction = await protocolKit.createEnableModuleTx(MODULE_ADDRESS);

    console.log('[ProposeSafeSDK] Transaction created:', {
      to: safeTransaction.data.to,
      value: safeTransaction.data.value,
      data: safeTransaction.data.data?.substring(0, 20) + '...',
    });

    // Get the transaction hash
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);

    // Initialize API Kit for transaction service
    const apiKit = new SafeApiKit({
      chainId: 11155111n, // Sepolia
    });

    console.log('[ProposeSafeSDK] Proposing transaction to Safe Transaction Service...');

    // Propose the transaction (this doesn't require a signature to propose, just to execute)
    try {
      await apiKit.proposeTransaction({
        safeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: safeAddress, // Safe itself is the sender
        origin: 'Maxxit Platform',
      });

      console.log('[ProposeSafeSDK] Transaction proposed successfully!');

      const safeUIUrl = `https://app.safe.global/transactions/queue?safe=sep:${safeAddress}`;

      return res.status(200).json({
        success: true,
        proposed: true,
        safeTxHash,
        safeUIUrl,
        message: 'Transaction proposed! Open Safe to execute it.',
      });

    } catch (proposeError: any) {
      console.error('[ProposeSafeSDK] Failed to propose:', proposeError.message);
      
      // If proposing fails, return transaction data for manual execution
      return res.status(200).json({
        success: true,
        requiresManualExecution: true,
        transactionData: {
          to: safeTransaction.data.to,
          value: safeTransaction.data.value,
          data: safeTransaction.data.data,
          operation: safeTransaction.data.operation,
        },
        safeTxHash,
        message: 'Could not auto-propose. User needs to execute via Safe UI.',
      });
    }

  } catch (error: any) {
    console.error('[ProposeSafeSDK] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create transaction',
    });
  }
}
