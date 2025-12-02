/**
 * Hyperliquid Agent Approval Signing
 * 
 * Generates the proper payload for MetaMask signing
 * to approve an agent on Hyperliquid
 */

import { ethers } from 'ethers';

/**
 * Hyperliquid uses chain ID 1337 for L1 actions
 * This is a special chain ID for Hyperliquid's signing mechanism
 */
export const HYPERLIQUID_CHAIN_ID = 1337;

/**
 * Create the agent approval message for Hyperliquid
 * 
 * This creates an EIP-712 typed data structure that:
 * 1. User signs with MetaMask
 * 2. Gets submitted to Hyperliquid
 * 3. Grants agent trading permission
 */
export function createAgentApprovalPayload(
  userAddress: string,
  agentAddress: string,
  timestamp: number = Date.now()
) {
  // Hyperliquid's agent approval action
  const action = {
    type: 'approve',
    agent: agentAddress,
    timestamp: timestamp,
  };

  // EIP-712 Domain
  const domain = {
    name: 'Exchange',
    version: '1',
    chainId: HYPERLIQUID_CHAIN_ID,
    verifyingContract: '0x0000000000000000000000000000000000000000', // Hyperliquid uses zero address
  };

  // EIP-712 Types
  const types = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  };

  // Message to sign
  const value = {
    source: 'a', // 'a' = approve agent
    connectionId: ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [agentAddress, timestamp]
      )
    ),
  };

  return {
    domain,
    types,
    value,
    action,
  };
}

/**
 * Alternative: Simple message signing approach
 * Simpler but may need Hyperliquid SDK on backend to construct proper format
 */
export function createSimpleApprovalMessage(
  userAddress: string,
  agentAddress: string
): string {
  return JSON.stringify({
    action: {
      type: 'approveAgent',
      agent: agentAddress,
    },
    nonce: Date.now(),
  });
}

/**
 * Verify that a signature was created by the expected address
 */
export function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * For EIP-712 typed data signatures
 */
export function verifyTypedSignature(
  domain: any,
  types: any,
  value: any,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const digest = ethers.utils._TypedDataEncoder.hash(domain, types, value);
    const recoveredAddress = ethers.utils.recoverAddress(digest, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Typed signature verification failed:', error);
    return false;
  }
}

