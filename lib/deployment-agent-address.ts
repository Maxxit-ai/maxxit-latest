/**
 * User Agent Address Management
 * 
 * ONE agent address per USER (not per deployment)
 * When user first deploys ANY agent, generate address and store it
 * All subsequent agent deployments for that user use the SAME address
 * 
 * Flow:
 * 1. User deploys first agent → Generate address → Store in user_agent_addresses
 * 2. User deploys second agent → Use existing address from user_agent_addresses
 * 3. User deploys third agent → Use existing address from user_agent_addresses
 * 
 * All agents for a user share the same agent address
 */

import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.warn(
    '[DeploymentAgentAddress] ⚠️  WARNING: No ENCRYPTION_KEY found!\n' +
    '  - Using fallback key for NEW encryptions (NOT SECURE)\n' +
    '  - EXISTING encrypted keys will FAIL to decrypt\n' +
    '  - Set ENCRYPTION_KEY or MASTER_ENCRYPTION_KEY environment variable\n' +
    '  - This is required for production deployments'
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
 * Encrypt private key using AES-256-GCM
 */
function encryptPrivateKey(privateKey: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
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
 * Generate a new agent wallet address and private key
 * Returns the address and encrypted private key
 */
export function generateAgentWallet(): {
  address: string;
  privateKey: string;
  encrypted: {
    encrypted: string;
    iv: string;
    tag: string;
  };
} {
  const wallet = ethers.Wallet.createRandom();
  const address = wallet.address;
  const privateKey = wallet.privateKey;

  const encrypted = encryptPrivateKey(privateKey);

  console.log('[DeploymentAgentAddress] Generated new agent wallet:', address);

  return {
    address,
    privateKey,
    encrypted,
  };
}

/**
 * Get or create Hyperliquid agent address for a USER
 * ONE address per user - shared across all agent deployments
 */
export async function getOrCreateHyperliquidAgentAddress(params: {
  userWallet: string;
}): Promise<{
  address: string;
  privateKey: string;
  encrypted: {
    encrypted: string;
    iv: string;
    tag: string;
  };
}> {
  const { userWallet } = params;
  const normalizedWallet = userWallet.toLowerCase();

  // Check if user already has an agent address
  let userAddress = await prisma.user_agent_addresses.findUnique({
    where: { user_wallet: normalizedWallet },
    select: {
      hyperliquid_agent_address: true,
      hyperliquid_agent_key_encrypted: true,
      hyperliquid_agent_key_iv: true,
      hyperliquid_agent_key_tag: true,
    },
  });

  // If address already exists, decrypt and return
  if (
    userAddress &&
    userAddress.hyperliquid_agent_address &&
    userAddress.hyperliquid_agent_key_encrypted &&
    userAddress.hyperliquid_agent_key_iv &&
    userAddress.hyperliquid_agent_key_tag
  ) {
    console.log('[UserAgentAddress] Using existing Hyperliquid address:', userAddress.hyperliquid_agent_address);
    
    const privateKey = decryptPrivateKey(
      userAddress.hyperliquid_agent_key_encrypted,
      userAddress.hyperliquid_agent_key_iv,
      userAddress.hyperliquid_agent_key_tag
    );

    return {
      address: userAddress.hyperliquid_agent_address,
      privateKey,
      encrypted: {
        encrypted: userAddress.hyperliquid_agent_key_encrypted,
        iv: userAddress.hyperliquid_agent_key_iv,
        tag: userAddress.hyperliquid_agent_key_tag,
      },
    };
  }

  // Generate new agent wallet (first time user deploys)
  const wallet = generateAgentWallet();

  // Store in user_agent_addresses (create or update)
  if (userAddress) {
    // User exists but no Hyperliquid address yet
    await prisma.user_agent_addresses.update({
      where: { user_wallet: normalizedWallet },
      data: {
        hyperliquid_agent_address: wallet.address,
        hyperliquid_agent_key_encrypted: wallet.encrypted.encrypted,
        hyperliquid_agent_key_iv: wallet.encrypted.iv,
        hyperliquid_agent_key_tag: wallet.encrypted.tag,
        last_used_at: new Date(),
      },
    });
  } else {
    // First time user - create new record
    await prisma.user_agent_addresses.create({
      data: {
        user_wallet: normalizedWallet,
        hyperliquid_agent_address: wallet.address,
        hyperliquid_agent_key_encrypted: wallet.encrypted.encrypted,
        hyperliquid_agent_key_iv: wallet.encrypted.iv,
        hyperliquid_agent_key_tag: wallet.encrypted.tag,
      },
    });
  }

  console.log('[UserAgentAddress] ✅ Created new Hyperliquid agent address for user:', wallet.address);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    encrypted: wallet.encrypted,
  };
}

/**
 * Get or create Ostium agent address for a USER
 * ONE address per user - shared across all agent deployments
 */
export async function getOrCreateOstiumAgentAddress(params: {
  userWallet: string;
}): Promise<{
  address: string;
  privateKey: string;
  encrypted: {
    encrypted: string;
    iv: string;
    tag: string;
  };
}> {
  const { userWallet } = params;
  const normalizedWallet = userWallet.toLowerCase();

  // Check if user already has an agent address
  let userAddress = await prisma.user_agent_addresses.findUnique({
    where: { user_wallet: normalizedWallet },
    select: {
      ostium_agent_address: true,
      ostium_agent_key_encrypted: true,
      ostium_agent_key_iv: true,
      ostium_agent_key_tag: true,
    },
  });

  // If address already exists, decrypt and return
  if (
    userAddress &&
    userAddress.ostium_agent_address &&
    userAddress.ostium_agent_key_encrypted &&
    userAddress.ostium_agent_key_iv &&
    userAddress.ostium_agent_key_tag
  ) {
    console.log('[UserAgentAddress] Using existing Ostium address:', userAddress.ostium_agent_address);
    
    const privateKey = decryptPrivateKey(
      userAddress.ostium_agent_key_encrypted,
      userAddress.ostium_agent_key_iv,
      userAddress.ostium_agent_key_tag
    );

    return {
      address: userAddress.ostium_agent_address,
      privateKey,
      encrypted: {
        encrypted: userAddress.ostium_agent_key_encrypted,
        iv: userAddress.ostium_agent_key_iv,
        tag: userAddress.ostium_agent_key_tag,
      },
    };
  }

  // Generate new agent wallet (first time user deploys)
  const wallet = generateAgentWallet();

  // Store in user_agent_addresses (create or update)
  if (userAddress) {
    // User exists but no Ostium address yet
    await prisma.user_agent_addresses.update({
      where: { user_wallet: normalizedWallet },
      data: {
        ostium_agent_address: wallet.address,
        ostium_agent_key_encrypted: wallet.encrypted.encrypted,
        ostium_agent_key_iv: wallet.encrypted.iv,
        ostium_agent_key_tag: wallet.encrypted.tag,
        last_used_at: new Date(),
      },
    });
  } else {
    // First time user - create new record
    await prisma.user_agent_addresses.create({
      data: {
        user_wallet: normalizedWallet,
        ostium_agent_address: wallet.address,
        ostium_agent_key_encrypted: wallet.encrypted.encrypted,
        ostium_agent_key_iv: wallet.encrypted.iv,
        ostium_agent_key_tag: wallet.encrypted.tag,
      },
    });
  }

  console.log('[UserAgentAddress] ✅ Created new Ostium agent address for user:', wallet.address);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    encrypted: wallet.encrypted,
  };
}

/**
 * Get private key for a user's Hyperliquid agent address
 * Looks up user_wallet from deployment, then gets address from user_agent_addresses
 */
export async function getHyperliquidPrivateKey(deploymentId: string): Promise<string> {
  // Get user_wallet from deployment
  const deployment = await prisma.agent_deployments.findUnique({
    where: { id: deploymentId },
    select: {
      user_wallet: true,
    },
  });

  if (!deployment) {
    throw new Error(`Deployment not found: ${deploymentId}`);
  }

  // Get address from user_agent_addresses
  const userAddress = await prisma.user_agent_addresses.findUnique({
    where: { user_wallet: deployment.user_wallet.toLowerCase() },
    select: {
      hyperliquid_agent_key_encrypted: true,
      hyperliquid_agent_key_iv: true,
      hyperliquid_agent_key_tag: true,
    },
  });

  if (
    !userAddress ||
    !userAddress.hyperliquid_agent_key_encrypted ||
    !userAddress.hyperliquid_agent_key_iv ||
    !userAddress.hyperliquid_agent_key_tag
  ) {
    throw new Error(`No Hyperliquid agent key found for user: ${deployment.user_wallet}`);
  }

  return decryptPrivateKey(
    userAddress.hyperliquid_agent_key_encrypted,
    userAddress.hyperliquid_agent_key_iv,
    userAddress.hyperliquid_agent_key_tag
  );
}

/**
 * Get private key for a user's Ostium agent address
 * Looks up user_wallet from deployment, then gets address from user_agent_addresses
 */
export async function getOstiumPrivateKey(deploymentId: string): Promise<string> {
  // Get user_wallet from deployment
  const deployment = await prisma.agent_deployments.findUnique({
    where: { id: deploymentId },
    select: {
      user_wallet: true,
    },
  });

  if (!deployment) {
    throw new Error(`Deployment not found: ${deploymentId}`);
  }

  // Get address from user_agent_addresses
  const userAddress = await prisma.user_agent_addresses.findUnique({
    where: { user_wallet: deployment.user_wallet.toLowerCase() },
    select: {
      ostium_agent_key_encrypted: true,
      ostium_agent_key_iv: true,
      ostium_agent_key_tag: true,
    },
  });

  if (
    !userAddress ||
    !userAddress.ostium_agent_key_encrypted ||
    !userAddress.ostium_agent_key_iv ||
    !userAddress.ostium_agent_key_tag
  ) {
    throw new Error(`No Ostium agent key found for user: ${deployment.user_wallet}`);
  }

  return decryptPrivateKey(
    userAddress.ostium_agent_key_encrypted,
    userAddress.ostium_agent_key_iv,
    userAddress.ostium_agent_key_tag
  );
}

/**
 * Get private key by agent address
 * Searches in user_agent_addresses table
 */
export async function getPrivateKeyByAddress(agentAddress: string): Promise<string | null> {
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

  return null;
}

