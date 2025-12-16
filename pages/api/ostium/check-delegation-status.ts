/**
 * Check Ostium Delegation Status
 * 
 * Checks if user has delegated their trading permissions to their Ostium agent address
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';

const TRADING_CONTRACT = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411'; // Ostium Trading
const RPC_URL = 'https://arb1.arbitrum.io/rpc';

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
    
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const tradingContract = new ethers.Contract(TRADING_CONTRACT, TRADING_ABI, provider);

    const delegatedAddress = await tradingContract.delegations(checksummedUserAddress);
    
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
