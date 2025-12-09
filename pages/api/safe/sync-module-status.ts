import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { ethers } from 'ethers';

// RPC URLs for different chains
const RPC_URLS: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

// Check both V2 and V3 modules
const V2_MODULE_ADDRESS = '0x2218dD82E2bbFe759BDe741Fa419Bb8A9F658A46';
const V3_MODULE_ADDRESS = '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
  'function getModules() external view returns (address[])',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress, chainId } = req.body;

    if (!safeAddress || !ethers.utils.isAddress(safeAddress)) {
      return res.status(400).json({
        error: 'Invalid Safe address',
      });
    }

    // Default to Arbitrum if no chainId provided
    const chain = chainId || 42161;
    const rpcUrl = RPC_URLS[chain];

    if (!rpcUrl) {
      return res.status(400).json({
        error: `Unsupported chainId: ${chain}`,
      });
    }

    console.log('[SyncModuleStatus] Checking module status for Safe:', safeAddress, 'on chain:', chain);

    // Connect to the specified chain
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Check if Safe exists
    const code = await provider.getCode(safeAddress);
    if (code === '0x') {
      const chainName = chain === 11155111 ? 'Sepolia' : chain === 42161 ? 'Arbitrum' : 'Base';
      return res.status(400).json({
        error: `Safe wallet not found on ${chainName}`,
        safeAddress,
        chainId: chain,
      });
    }

    // Create Safe contract instance
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);

    // Check both V2 and V3 module status
    let v2Enabled = false;
    let v3Enabled = false;
    let currentModuleAddress = V2_MODULE_ADDRESS;
    let isEnabledOnChain = false;

    try {
      v2Enabled = await safe.isModuleEnabled(V2_MODULE_ADDRESS);
      v3Enabled = await safe.isModuleEnabled(V3_MODULE_ADDRESS);
      
      // V3 takes priority if enabled, otherwise use V2
      if (v3Enabled) {
        isEnabledOnChain = true;
        currentModuleAddress = V3_MODULE_ADDRESS;
        console.log('[SyncModuleStatus] V3 module is enabled - using V3');
      } else if (v2Enabled) {
        isEnabledOnChain = true;
        currentModuleAddress = V2_MODULE_ADDRESS;
        console.log('[SyncModuleStatus] V2 module is enabled - using V2');
      } else {
        isEnabledOnChain = false;
        console.log('[SyncModuleStatus] No modules are enabled');
      }
    } catch (error) {
      console.error('[SyncModuleStatus] Error checking module status:', error);
      return res.status(500).json({
        error: 'Failed to check module status on-chain',
      });
    }

    console.log('[SyncModuleStatus] V2:', v2Enabled ? 'Enabled' : 'Disabled', '| V3:', v3Enabled ? 'Enabled' : 'Disabled');

    // Find deployment in database
    const deployment = await prisma.agentDeployment.findFirst({
      where: { safeWallet: safeAddress },
      include: { agent: true },
    });

    if (!deployment) {
      // No deployment found - return the on-chain status without database update
      return res.status(200).json({
        success: true,
        safeAddress,
        moduleEnabled: isEnabledOnChain,
        moduleAddress: currentModuleAddress,
        v2Enabled,
        v3Enabled,
        wasUpdated: false,
        deployment: null,
        message: 'No deployment found - returning on-chain status only',
      });
    }

    console.log('[SyncModuleStatus] Database status:', deployment.moduleEnabled ? 'Enabled' : 'Disabled');

    // Update database if status differs
    let updated = false;
    if (deployment.moduleEnabled !== isEnabledOnChain || deployment.moduleAddress !== currentModuleAddress) {
      console.log('[SyncModuleStatus] Mismatch detected! Updating database...');
      
      await prisma.agentDeployment.update({
        where: { id: deployment.id },
        data: { 
          moduleEnabled: isEnabledOnChain,
          moduleAddress: currentModuleAddress,
        },
      });

      // Log the sync event
      await prisma.auditLog.create({
        data: {
          eventName: 'MODULE_STATUS_SYNCED',
          subjectType: 'AgentDeployment',
          subjectId: deployment.id,
          payload: {
            safeWallet: safeAddress,
            previousStatus: deployment.moduleEnabled,
            newStatus: isEnabledOnChain,
            previousModuleAddress: deployment.moduleAddress,
            newModuleAddress: currentModuleAddress,
            v2Enabled,
            v3Enabled,
            syncedAt: new Date().toISOString(),
          },
        },
      });

      updated = true;
      console.log('[SyncModuleStatus] Database updated successfully');
    } else {
      console.log('[SyncModuleStatus] Database and blockchain already in sync');
    }

    return res.status(200).json({
      success: true,
      safeAddress,
      moduleEnabled: isEnabledOnChain,
      moduleAddress: currentModuleAddress,
      v2Enabled,
      v3Enabled,
      wasUpdated: updated,
      deployment: {
        id: deployment.id,
        agentName: deployment.agent.name,
        status: deployment.status,
      },
    });

  } catch (error: any) {
    console.error('[SyncModuleStatus] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to sync module status',
    });
  }
  // Note: Don't disconnect - using singleton
}
