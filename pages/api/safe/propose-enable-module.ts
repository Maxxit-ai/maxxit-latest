/**
 * Propose Enable Module Transaction
 * Uses Safe Transaction Service to propose enableModule transaction
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';

const MODULE_ADDRESS = process.env.MODULE_ADDRESS || '0xa87f82433294cE8A3C8f08Ec5D2825e946C0c0FE';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com';
const EXECUTOR_PRIVATE_KEY = process.env.EXECUTOR_PRIVATE_KEY;
const SAFE_TX_SERVICE_URL = 'https://safe-transaction-sepolia.safe.global';

const SAFE_ABI = [
  'function enableModule(address module) external',
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
    const { safeAddress, userAddress } = req.body;

    if (!safeAddress || !ethers.utils.isAddress(safeAddress)) {
      return res.status(400).json({ error: 'Invalid Safe address' });
    }

    if (!userAddress || !ethers.utils.isAddress(userAddress)) {
      return res.status(400).json({ error: 'Invalid user address' });
    }

    if (!EXECUTOR_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Executor key not configured' });
    }

    const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);
    const executor = new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider);

    // Get Safe contract
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);
    const nonce = await safe.nonce();

    // Encode enableModule call
    const iface = new ethers.utils.Interface(SAFE_ABI);
    const data = iface.encodeFunctionData('enableModule', [MODULE_ADDRESS]);

    // Build Safe transaction
    const safeTx = {
      to: safeAddress,
      value: '0',
      data,
      operation: 0, // CALL
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ethers.constants.AddressZero,
      refundReceiver: ethers.constants.AddressZero,
      nonce: nonce.toString(),
    };

    // Calculate Safe transaction hash
    const domain = {
      chainId: 11155111, // Sepolia
      verifyingContract: safeAddress,
    };

    const types = {
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    };

    const safeTxHash = ethers.utils._TypedDataEncoder.hash(domain, types, safeTx);

    // Platform signs first (co-signer)
    const platformSignature = await executor.signMessage(ethers.utils.arrayify(safeTxHash));

    // Propose to Safe Transaction Service
    const proposePayload = {
      ...safeTx,
      contractTransactionHash: safeTxHash,
      sender: userAddress, // User is the proposer
      signature: platformSignature, // Platform pre-signs
      origin: 'Maxxit Platform - Enable Trading Module',
    };

    console.log('[ProposeEnableModule] Proposing transaction:', {
      safeAddress,
      safeTxHash,
      nonce: nonce.toString(),
    });

    const proposeResponse = await fetch(
      `${SAFE_TX_SERVICE_URL}/api/v1/safes/${safeAddress}/multisig-transactions/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposePayload),
      }
    );

    if (!proposeResponse.ok) {
      const errorText = await proposeResponse.text();
      console.error('[ProposeEnableModule] Failed to propose:', errorText);
      
      // Try alternative: Return signing data for user to sign via wallet
      return res.status(200).json({
        success: true,
        requiresUserSignature: true,
        safeTxHash,
        safeTx,
        domain,
        types,
        message: 'User needs to sign this transaction',
      });
    }

    // Success - transaction is proposed
    const safeUIUrl = `https://app.safe.global/transactions/queue?safe=sep:${safeAddress}`;

    return res.status(200).json({
      success: true,
      proposed: true,
      safeTxHash,
      safeUIUrl,
      message: 'Transaction proposed! Open Safe to execute it.',
    });

  } catch (error: any) {
    console.error('[ProposeEnableModule] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to propose transaction',
    });
  }
}
