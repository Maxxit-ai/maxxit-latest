/**
 * Sync all agent deployments with on-chain module status
 * This ensures database reflects actual on-chain state
 */

import { ethers } from 'ethers';
import { prisma } from '../lib/prisma';

const RPC_URL = process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc';
const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
];

export async function syncAllDeployments() {
  console.log('[SyncDeployments] Syncing all deployments with on-chain status...');
  
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    
    // Get all deployments that have a Safe wallet
    const deployments = await prisma.agent_deployments.findMany({
      where: {
        safe_wallet: { not: '' },
      },
      include: {
        agents: true,
      },
    });

    if (deployments.length === 0) {
      console.log('[SyncDeployments] No deployments to sync');
      return { synced: 0, updated: 0 };
    }

    console.log(`[SyncDeployments] Found ${deployments.length} deployment(s) to check`);

    let syncedCount = 0;
    let updatedCount = 0;

    for (const deployment of deployments) {
      if (!deployment.safe_wallet) continue;

      // Skip Hyperliquid and Ostium deployments (they don't use Safe modules)
      if (deployment.agents.venue === 'HYPERLIQUID' || deployment.agents.venue === 'OSTIUM') {
        console.log(`[SyncDeployments] Skipping ${deployment.agents.name} (${deployment.agents.venue} venue - no Safe modules)`);
        continue;
      }

      try {
        // Check on-chain status
        const safe = new ethers.Contract(deployment.safe_wallet, SAFE_ABI, provider);
        const isEnabledOnChain = await safe.isModuleEnabled(MODULE_ADDRESS);

        syncedCount++;

        // Update if status differs
        if (deployment.module_enabled !== isEnabledOnChain) {
          console.log(`[SyncDeployments] ${deployment.agents.name}: DB=${deployment.module_enabled} OnChain=${isEnabledOnChain} - Updating...`);
          
          await prisma.agent_deployments.update({
            where: { id: deployment.id },
            data: { module_enabled: isEnabledOnChain },
          });

          updatedCount++;
        }
      } catch (error: any) {
        console.error(`[SyncDeployments] Error checking ${deployment.safe_wallet}:`, error.message);
      }
    }

    console.log(`[SyncDeployments] ✅ Complete: ${syncedCount} checked, ${updatedCount} updated\n`);

    return { synced: syncedCount, updated: updatedCount };

  } catch (error: any) {
    console.error('[SyncDeployments] Fatal error:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  syncAllDeployments()
    .then(result => {
      console.log(`Result:`, result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

