/**
 * Wallet Helper for Trade Executor Worker
 * Gets private keys from user_agent_addresses table
 * Uses deployment-agent-address logic (copied locally for microservice)
 */

import { prisma } from '@maxxit/database';
import * as crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.warn(
    '[WalletHelper] ⚠️  WARNING: No ENCRYPTION_KEY found!\n' +
    '  - EXISTING encrypted keys will FAIL to decrypt\n' +
    '  - Set ENCRYPTION_KEY or MASTER_ENCRYPTION_KEY environment variable'
  );
}

// Derive 32-byte key from environment variable
function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    // Fallback for development
    return crypto.scryptSync('fallback-dev-key', 'salt', 32);
  }
  return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
}

/**
 * Decrypt private key using AES-256-GCM
 */
function decryptPrivateKey(
  encrypted: string,
  iv: string,
  tag: string
): string {
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error: any) {
    const hasEncryptionKey = !!ENCRYPTION_KEY;
    const errorMsg = error.message || 'Unknown decryption error';
    
    if (error.code === 'ERR_CRYPTO_INVALID_TAG' || errorMsg.includes('bad decrypt')) {
      if (!hasEncryptionKey) {
        throw new Error(
          'Decryption failed: ENCRYPTION_KEY environment variable is missing. ' +
          'The private key was encrypted with a different key. ' +
          'Please set ENCRYPTION_KEY or MASTER_ENCRYPTION_KEY environment variable.'
        );
      } else {
        throw new Error(
          'Decryption failed: The encryption key does not match the key used to encrypt this data. ' +
          'Please verify that ENCRYPTION_KEY or MASTER_ENCRYPTION_KEY is set correctly.'
        );
      }
    }
    
    throw new Error(`Failed to decrypt private key: ${errorMsg}`);
  }
}

/**
 * Get private key by agent address
 * Searches in user_agent_addresses table
 */
export async function getPrivateKeyForAddress(agentAddress: string): Promise<string | null> {
  try {
    const normalizedAddress = agentAddress.toLowerCase();

    // Try Hyperliquid addresses
    const hlUserAddress = await prisma.user_agent_addresses.findFirst({
      where: {
        hyperliquid_agent_address: {
          equals: normalizedAddress,
          mode: 'insensitive',
        },
      },
      select: {
        hyperliquid_agent_key_encrypted: true,
        hyperliquid_agent_key_iv: true,
        hyperliquid_agent_key_tag: true,
      },
    });

    if (
      hlUserAddress &&
      hlUserAddress.hyperliquid_agent_key_encrypted &&
      hlUserAddress.hyperliquid_agent_key_iv &&
      hlUserAddress.hyperliquid_agent_key_tag
    ) {
      return decryptPrivateKey(
        hlUserAddress.hyperliquid_agent_key_encrypted,
        hlUserAddress.hyperliquid_agent_key_iv,
        hlUserAddress.hyperliquid_agent_key_tag
      );
    }

    // Try Ostium addresses
    const ostiumUserAddress = await prisma.user_agent_addresses.findFirst({
      where: {
        ostium_agent_address: {
          equals: normalizedAddress,
          mode: 'insensitive',
        },
      },
      select: {
        ostium_agent_key_encrypted: true,
        ostium_agent_key_iv: true,
        ostium_agent_key_tag: true,
      },
    });

    if (
      ostiumUserAddress &&
      ostiumUserAddress.ostium_agent_key_encrypted &&
      ostiumUserAddress.ostium_agent_key_iv &&
      ostiumUserAddress.ostium_agent_key_tag
    ) {
      return decryptPrivateKey(
        ostiumUserAddress.ostium_agent_key_encrypted,
        ostiumUserAddress.ostium_agent_key_iv,
        ostiumUserAddress.ostium_agent_key_tag
      );
    }

    // Fallback to legacy wallet_pool
    const wallet = await prisma.wallet_pool.findFirst({
      where: {
        address: {
          equals: normalizedAddress,
          mode: 'insensitive',
        },
      },
      select: {
        private_key: true,
      },
    });

    if (wallet) {
      console.log(`[WalletHelper] ⚠️  Using legacy wallet_pool (consider migrating)`);
      return wallet.private_key;
    }

    return null;
  } catch (error: any) {
    console.error('[WalletHelper] Error getting private key:', error.message);
    return null;
  }
}

