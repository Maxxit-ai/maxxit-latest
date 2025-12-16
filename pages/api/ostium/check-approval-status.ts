/**
 * Check Ostium On-Chain Approval Status
 * 
 * Checks if user has actually approved USDC spending on-chain,
 * not just if they have an agent address.
 * 
 * This prevents the UI from skipping approval steps when approvals failed.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { getOstiumConfig } from '../../../lib/ostium-config';

const { usdcContract, tradingContract, storageContract, rpcUrl } = getOstiumConfig();

const USDC_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userWallet } = req.query;

    if (!userWallet || typeof userWallet !== 'string') {
      return res.status(400).json({ error: 'User wallet required' });
    }

    const checksummedAddress = ethers.utils.getAddress(userWallet);

    // Connect to the appropriate network
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const usdcContractInstance = new ethers.Contract(usdcContract, USDC_ABI, provider);

    // Check USDC allowance - SDK checks STORAGE_CONTRACT, not TRADING_CONTRACT
    const allowanceStorage = await usdcContractInstance.allowance(checksummedAddress, storageContract);
    const allowanceTrading = await usdcContractInstance.allowance(checksummedAddress, tradingContract);
    const allowanceUsdc = parseFloat(ethers.utils.formatUnits(allowanceStorage, 6)); // Use STORAGE (SDK requirement)

    // Check USDC balance
    const balance = await usdcContractInstance.balanceOf(checksummedAddress);
    const balanceUsdc = parseFloat(ethers.utils.formatUnits(balance, 6));

    // Minimum trade size on Ostium is $5
    const hasApproval = allowanceUsdc >= 5;
    const hasSufficientBalance = balanceUsdc >= 5;

    return res.status(200).json({
      success: true,
      userWallet: checksummedAddress,
      usdcBalance: balanceUsdc,
      usdcAllowance: allowanceUsdc,
      usdcAllowanceStorage: parseFloat(ethers.utils.formatUnits(allowanceStorage, 6)),
      usdcAllowanceTrading: parseFloat(ethers.utils.formatUnits(allowanceTrading, 6)),
      hasApproval,
      hasSufficientBalance,
      needsApproval: !hasApproval,
      storageContract: storageContract,
      tradingContract: tradingContract,
    });
  } catch (error: any) {
    console.error('[CheckApprovalStatus] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check approval status',
    });
  }
}

