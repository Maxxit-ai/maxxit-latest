/**
 * Hyperliquid User Wallet Management
 * 
 * One agent wallet per USER (not per deployment)
 * This allows users to subscribe to multiple agents
 * while only needing to whitelist ONE address on Hyperliquid
 */

import { ethers } from 'ethers';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';
const ENCRYPTION_KEY = Buffer.from(
  process.env.AGENT_WALLET_ENCRYPTION_KEY || '',
  'hex'
);

if (!process.env.AGENT_WALLET_ENCRYPTION_KEY) {
  console.warn('[HyperliquidUserWallet] WARNING: AGENT_WALLET_ENCRYPTION_KEY not set!');
}

/**
 * Generate a new agent wallet for a user
 * Creates a random EOA wallet, stores in PLAINTEXT in wallet_pool
 * NO ENCRYPTION - stores directly in wallet pool
 */
export async function generateUserAgentWallet(userWallet: string): Promise<string> {
  console.log(`[HyperliquidUserWallet] Generating new agent wallet for user ${userWallet}`);

  // Generate random wallet
  const wallet = ethers.Wallet.createRandom();
  const agentAddress = wallet.address;
  const privateKey = wallet.privateKey;

  console.log(`[HyperliquidUserWallet] Generated address: ${agentAddress}`);

  // Store PLAINTEXT in wallet_pool (NO ENCRYPTION!)
  await prisma.$executeRaw`
    INSERT INTO wallet_pool (address, private_key, assigned_to_user_wallet)
    VALUES (${agentAddress}, ${privateKey}, ${userWallet.toLowerCase()})
    ON CONFLICT (address) DO UPDATE SET private_key = EXCLUDED.private_key
  `;

  // Store reference in user_hyperliquid_wallets (NO encrypted fields!)
  await prisma.user_hyperliquid_wallets.create({
    data: {
      user_wallet: userWallet.toLowerCase(),
      agent_address: agentAddress,
      agent_private_key_encrypted: '', // Empty - not used
      agent_key_iv: '', // Empty - not used
      agent_key_tag: '', // Empty - not used
    },
  });

  console.log(`[HyperliquidUserWallet] ✅ Stored wallet in pool (PLAINTEXT) for user ${userWallet}`);
  return agentAddress;
}

/**
 * Get or create agent wallet for a user
 * If user already has a wallet, return existing address
 * If not, generate a new one
 */
export async function getUserAgentWallet(userWallet: string): Promise<string> {
  const normalizedWallet = userWallet.toLowerCase();
  
  // Check if user already has an agent wallet
  const existing = await prisma.user_hyperliquid_wallets.findUnique({
    where: { user_wallet: normalizedWallet },
  });

  if (existing) {
    console.log(`[HyperliquidUserWallet] Using existing agent wallet ${existing.agent_address} for user ${userWallet}`);
    
    // Update last_used_at
    await prisma.user_hyperliquid_wallets.update({
      where: { user_wallet: normalizedWallet },
      data: { last_used_at: new Date() },
    });
    
    return existing.agent_address;
  }

  // Generate new one
  console.log(`[HyperliquidUserWallet] No existing wallet found, generating new one for user ${userWallet}`);
  return await generateUserAgentWallet(userWallet);
}

/**
 * Get private key for user's agent wallet (from wallet_pool - PLAINTEXT)
 * NO DECRYPTION - just reads from wallet_pool
 */
export async function getUserAgentPrivateKey(userWallet: string): Promise<string> {
  const normalizedWallet = userWallet.toLowerCase();
  
  const wallet = await prisma.user_hyperliquid_wallets.findUnique({
    where: { user_wallet: normalizedWallet },
  });

  if (!wallet) {
    throw new Error(`No agent wallet found for user ${userWallet}`);
  }

  // Get from wallet_pool (PLAINTEXT - no encryption!)
  const poolWallet: any = await prisma.$queryRaw`
    SELECT private_key FROM wallet_pool 
    WHERE address = ${wallet.agent_address}
  `;

  if (!poolWallet || poolWallet.length === 0) {
    throw new Error(`Private key not found in wallet pool for ${wallet.agent_address}`);
  }

  return poolWallet[0].private_key;
}

/**
 * Get agent address for a user (without decrypting)
 */
export async function getAgentAddressForUser(userWallet: string): Promise<string | null> {
  const normalizedWallet = userWallet.toLowerCase();
  
  const wallet = await prisma.user_hyperliquid_wallets.findUnique({
    where: { user_wallet: normalizedWallet },
    select: { agent_address: true },
  });

  return wallet?.agent_address || null;
}

/**
 * Check if user has an agent wallet
 */
export async function userHasAgentWallet(userWallet: string): Promise<boolean> {
  const normalizedWallet = userWallet.toLowerCase();
  
  const count = await prisma.user_hyperliquid_wallets.count({
    where: { user_wallet: normalizedWallet },
  });

  return count > 0;
}

/**
 * Get all users with agent wallets (for migration/admin)
 */
export async function getAllUserWallets() {
  return await prisma.user_hyperliquid_wallets.findMany({
    orderBy: { created_at: 'desc' },
  });
}

/**
 * Delete user's agent wallet (admin function - use with caution!)
 */
export async function deleteUserAgentWallet(userWallet: string): Promise<boolean> {
  const normalizedWallet = userWallet.toLowerCase();
  
  console.warn(`[HyperliquidUserWallet] ⚠️ Deleting agent wallet for user ${userWallet}`);
  
  const result = await prisma.user_hyperliquid_wallets.delete({
    where: { user_wallet: normalizedWallet },
  });

  return !!result;
}

