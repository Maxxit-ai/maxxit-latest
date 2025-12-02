/**
 * Wallet Pool Management
 * Pre-generated wallets with plaintext private keys (no encryption!)
 * Simple and fast - assign wallet from pool to user
 * 
 * FIXED: Updated to use correct schema field names (assigned_to_user_wallet)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PoolWallet {
  id: string;
  address: string;
  private_key: string;
  assigned_to_user_wallet: string | null;
  created_at: Date | null;
}

/**
 * Get an unassigned wallet from the pool and assign it to a user
 */
export async function assignWalletToUser(userWallet: string): Promise<{ address: string; privateKey: string } | null> {
  try {
    console.log(`[WalletPool] Looking for available wallet for user: ${userWallet}`);
    
    // Find first unassigned wallet using Prisma's typed query
    const wallet = await prisma.wallet_pool.findFirst({
      where: {
        assigned_to_user_wallet: null,
      },
    });

    if (!wallet) {
      console.error('[WalletPool] No available wallets in pool!');
      
      // Log pool stats for debugging
      const total = await prisma.wallet_pool.count();
      const assigned = await prisma.wallet_pool.count({
        where: { assigned_to_user_wallet: { not: null } },
      });
      console.error(`[WalletPool] Pool stats - Total: ${total}, Assigned: ${assigned}, Available: ${total - assigned}`);
      
      return null;
    }

    console.log(`[WalletPool] Found available wallet: ${wallet.address}`);

    // Mark as assigned using Prisma's typed update
    await prisma.wallet_pool.update({
      where: {
        id: wallet.id,
      },
      data: {
        assigned_to_user_wallet: userWallet.toLowerCase(),
        created_at: new Date(),
      },
    });

    console.log(`[WalletPool] ✅ Assigned wallet ${wallet.address} to user ${userWallet}`);

    return {
      address: wallet.address,
      privateKey: wallet.private_key,
    };
  } catch (error) {
    console.error('[WalletPool] Error assigning wallet:', error);
    return null;
  }
}

/**
 * Get assigned wallet for a user
 */
export async function getAssignedWallet(userWallet: string): Promise<{ address: string; privateKey: string } | null> {
  try {
    const wallet = await prisma.wallet_pool.findFirst({
      where: {
        assigned_to_user_wallet: {
          equals: userWallet.toLowerCase(),
          mode: 'insensitive',
        },
      },
    });

    if (!wallet) {
      return null;
    }

    return {
      address: wallet.address,
      privateKey: wallet.private_key,
    };
  } catch (error) {
    console.error('[WalletPool] Error getting assigned wallet:', error);
    return null;
  }
}

/**
 * Get private key for a specific agent address
 * 
 * Priority:
 * 1. Check deployment-specific addresses (new system with encryption)
 * 2. Fallback to wallet pool (legacy system, will be deprecated)
 */
export async function getPrivateKeyForAddress(agentAddress: string): Promise<string | null> {
  try {
    // Try deployment-specific addresses first (new system)
    const { getPrivateKeyByAddress } = await import('./deployment-agent-address');
    const deploymentKey = await getPrivateKeyByAddress(agentAddress);
    
    if (deploymentKey) {
      console.log(`[WalletPool] ✅ Found private key in deployment-specific storage`);
      return deploymentKey;
    }

    // Fallback to legacy wallet pool
    console.log(`[WalletPool] Checking legacy wallet pool for address ${agentAddress}`);
    const wallet = await prisma.wallet_pool.findFirst({
      where: {
        address: {
          equals: agentAddress.toLowerCase(),
          mode: 'insensitive',
        },
      },
      select: {
        private_key: true,
      },
    });

    if (!wallet) {
      console.error(`[WalletPool] No wallet found for address ${agentAddress}`);
      return null;
    }

    console.log(`[WalletPool] ⚠️  Using legacy wallet pool (consider migrating to deployment-specific addresses)`);
    return wallet.private_key;
  } catch (error) {
    console.error('[WalletPool] Error getting private key:', error);
    return null;
  }
}

/**
 * Release a wallet (make it available again)
 */
export async function releaseWallet(agentAddress: string): Promise<boolean> {
  try {
    await prisma.wallet_pool.updateMany({
      where: {
        address: {
          equals: agentAddress.toLowerCase(),
          mode: 'insensitive',
        },
      },
      data: {
        assigned_to_user_wallet: null,
        created_at: null,
      },
    });

    console.log(`[WalletPool] Released wallet ${agentAddress}`);
    return true;
  } catch (error) {
    console.error('[WalletPool] Error releasing wallet:', error);
    return false;
  }
}

/**
 * Get pool statistics
 */
export async function getPoolStats(): Promise<{ total: number; assigned: number; available: number }> {
  try {
    const total = await prisma.wallet_pool.count();
    const assigned = await prisma.wallet_pool.count({
      where: {
        assigned_to_user_wallet: { not: null },
      },
    });

    return {
      total,
      assigned,
      available: total - assigned,
    };
  } catch (error) {
    console.error('[WalletPool] Error getting stats:', error);
    return { total: 0, assigned: 0, available: 0 };
  }
}
