/**
 * Check Ostium Delegation Status
 * 
 * Checks if user has delegated their trading permissions to their Ostium agent address
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { getOstiumConfig } from '../../../lib/ostium-config';

const { tradingContract, rpcUrl } = getOstiumConfig();

const TRADING_ABI = [
  'function delegations(address delegator) view returns (address)',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userWallet, agentAddress } = req.query;

    if (!userWallet || typeof userWallet !== 'string') {
      return res.status(400).json({ error: 'User wallet required' });
    }

    const checksummedUserAddress = ethers.utils.getAddress(userWallet);
    
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const tradingContractInstance = new ethers.Contract(tradingContract, TRADING_ABI, provider);

    const delegatedAddress = await tradingContractInstance.delegations(checksummedUserAddress);
    
    let isDelegatedToAgent = false;
    if (agentAddress && typeof agentAddress === 'string') {
      const checksummedAgentAddress = ethers.utils.getAddress(agentAddress);
      isDelegatedToAgent = delegatedAddress.toLowerCase() === checksummedAgentAddress.toLowerCase();
    }

    // Check if there's any delegation at all
    const hasDelegation = delegatedAddress !== ethers.constants.AddressZero;

    return res.status(200).json({
      success: true,
      userWallet: checksummedUserAddress,
      hasDelegation,
      delegatedAddress,
      isDelegatedToAgent,
      agentAddress: agentAddress || null,
    });
  } catch (error: any) {
    console.error('[CheckDelegationStatus] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check delegation status',
    });
  }
}
