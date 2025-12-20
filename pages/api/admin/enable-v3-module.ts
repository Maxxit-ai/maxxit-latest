import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { ethers } from 'ethers';
const RPC_URLS: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

const V3_MODULE_ADDRESS = '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';
const EXECUTOR_PRIVATE_KEY = process.env.EXECUTOR_PRIVATE_KEY;

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
  'function enableModule(address module) external',
  'function execTransactionFromModule(address to, uint256 value, bytes data, uint8 operation) external returns (bool success)',
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

    if (!EXECUTOR_PRIVATE_KEY) {
      return res.status(500).json({ error: 'EXECUTOR_PRIVATE_KEY not configured' });
    }

    const rpcUrl = RPC_URLS[chainId];
    if (!rpcUrl) {
      return res.status(400).json({ error: `Unsupported chainId: ${chainId}` });
    }

    console.log(`[EnableV3Module] Enabling V3 module for Safe: ${safeAddress} on chain ${chainId}`);

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const executor = new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider);
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);

    // Check if V3 module is already enabled
    const isV3Enabled = await safe.isModuleEnabled(V3_MODULE_ADDRESS);
    if (isV3Enabled) {
      return res.status(200).json({
        success: true,
        alreadyEnabled: true,
        message: 'V3 module is already enabled',
        moduleAddress: V3_MODULE_ADDRESS,
      });
    }

    // Create enableModule transaction data
    const iface = new ethers.utils.Interface(SAFE_ABI);
    const txData = iface.encodeFunctionData('enableModule', [V3_MODULE_ADDRESS]);

    // For now, return the transaction data that needs to be executed
    // The user will need to execute this transaction through their Safe wallet interface
    console.log(`[EnableV3Module] Generated enableModule transaction data`);
    
    return res.status(200).json({
      success: true,
      message: 'V3 module enablement transaction data generated. Please execute this transaction through your Safe wallet interface.',
      moduleAddress: V3_MODULE_ADDRESS,
      safeAddress,
      chainId,
      transactionData: {
        to: safeAddress,
        value: '0',
        data: txData,
        operation: 0, // CALL
      },
      instructions: [
        '1. Go to your Safe wallet interface',
        '2. Create a new transaction',
        '3. Set recipient to your Safe address',
        '4. Set value to 0',
        '5. Set data to the provided transaction data',
        '6. Execute the transaction',
        '7. Run the sync API again to verify'
      ],
    });

    // Create audit log for the transaction data generation
    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        safeWallet: safeAddress,
      },
    });

    await prisma.auditLog.create({
      data: {
        eventName: 'V3_MODULE_ENABLEMENT_DATA_GENERATED',
        subjectType: 'AgentDeployment',
        subjectId: deployment?.id || 'unknown',
        payload: {
          safeAddress,
          chainId,
          moduleAddress: V3_MODULE_ADDRESS,
          transactionData: {
            to: safeAddress,
            value: '0',
            data: txData,
            operation: 0,
          },
        },
      },
    });

  } catch (error: any) {
    console.error('[EnableV3Module] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
