import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { ethers } from 'ethers';
const RPC_URLS: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress, chainId = 42161 } = req.body;

    if (!safeAddress || !ethers.utils.isAddress(safeAddress)) {
      return res.status(400).json({ error: 'Invalid Safe address' });
    }

    const rpcUrl = RPC_URLS[chainId];
    if (!rpcUrl) {
      return res.status(400).json({ error: `Unsupported chainId: ${chainId}` });
    }

    console.log(`[SyncModuleStatus] Syncing module status for Safe: ${safeAddress} on chain ${chainId}`);

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);

    // Check status of both V2 and V3 modules individually
    const v2ModuleAddress = '0x2218dD82E2bbFe759BDe741Fa419Bb8A9F658A46';
    const v3ModuleAddress = '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';

    const v2Enabled = await safe.isModuleEnabled(v2ModuleAddress);
    const v3Enabled = await safe.isModuleEnabled(v3ModuleAddress);

    const enabledModules = [];
    if (v2Enabled) enabledModules.push(v2ModuleAddress);
    if (v3Enabled) enabledModules.push(v3ModuleAddress);

    console.log(`[SyncModuleStatus] V2 Module (${v2ModuleAddress}): ${v2Enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[SyncModuleStatus] V3 Module (${v3ModuleAddress}): ${v3Enabled ? 'ENABLED' : 'DISABLED'}`);

    // Update database with current module status
    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        safeWallet: safeAddress,
      },
    });

    if (deployment) {
      // Update the deployment with current module status
      await prisma.agentDeployment.update({
        where: { id: deployment.id },
        data: {
          moduleEnabled: v3Enabled, // Use V3 status as primary
          moduleAddress: v3Enabled ? v3ModuleAddress : v2ModuleAddress,
        },
      });

      console.log(`[SyncModuleStatus] Updated deployment ${deployment.id} with module status`);
    }

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        eventName: 'MODULE_STATUS_SYNC',
        subjectType: 'AgentDeployment',
        subjectId: deployment?.id || 'unknown',
        payload: {
          safeAddress,
          chainId,
          v2ModuleAddress,
          v2Enabled,
          v3ModuleAddress,
          v3Enabled,
          allEnabledModules: enabledModules,
          currentModuleAddress: v3Enabled ? v3ModuleAddress : v2ModuleAddress,
        },
      },
    });

    return res.status(200).json({
      success: true,
      safeAddress,
      chainId,
      moduleStatus: {
        v2: {
          address: v2ModuleAddress,
          enabled: v2Enabled,
        },
        v3: {
          address: v3ModuleAddress,
          enabled: v3Enabled,
        },
        currentModule: v3Enabled ? v3ModuleAddress : v2ModuleAddress,
        allEnabledModules: enabledModules,
      },
      databaseUpdated: !!deployment,
      message: v3Enabled 
        ? 'V3 module is enabled and active' 
        : v2Enabled 
          ? 'V2 module is enabled, V3 not yet enabled'
          : 'No trading modules enabled',
    });

  } catch (error: any) {
    console.error('[SyncModuleStatus] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
