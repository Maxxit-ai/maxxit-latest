/**
 * Create Agent Deployment
 * Deploy an agent for a user with their Safe wallet
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { createSafeWallet, getChainIdForVenue } from '../../../lib/safe-wallet';
import { ethers } from 'ethers';

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com';
const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';

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
    const {
      agentId,
      userWallet,
      safeWallet,
    } = req.body;

    // Validate required fields
    if (!agentId || !userWallet || !safeWallet) {
      return res.status(400).json({
        error: 'Missing required fields: agentId, userWallet, safeWallet',
      });
    }

    // Validate Ethereum addresses
    if (!isValidAddress(userWallet) || !isValidAddress(safeWallet)) {
      return res.status(400).json({
        error: 'Invalid Ethereum address format',
      });
    }

    // Check if agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found',
      });
    }

    // Validate Safe wallet
    const chainId = getChainIdForVenue(agent.venue);
    const safeService = createSafeWallet(safeWallet, chainId);
    
    const safeValidation = await safeService.validateSafe();
    if (!safeValidation.valid) {
      return res.status(400).json({
        error: 'Safe wallet validation failed',
        reason: safeValidation.error,
      });
    }

    // Get Safe wallet info
    const safeInfo = await safeService.getSafeInfo();
    const usdcBalance = await safeService.getUSDCBalance();
    const ethBalance = await safeService.getETHBalance();

    // Check for existing deployment
    const existing = await prisma.agentDeployment.findUnique({
      where: {
        userWallet_agentId: {
          userWallet,
          agentId,
        },
      },
    });

    if (existing) {
      return res.status(400).json({
        error: 'Deployment already exists for this user and agent',
        deploymentId: existing.id,
      });
    }

    // Check module status on-chain before creating deployment
    let moduleEnabled = false;
    let usdcApproved = false;
    
    try {
      // Get the correct RPC URL for the chain
      const rpcUrl = chainId === 42161 
        ? (process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc')
        : SEPOLIA_RPC;
      
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const safe = new ethers.Contract(safeWallet, SAFE_ABI, provider);
      moduleEnabled = await safe.isModuleEnabled(MODULE_ADDRESS);
      console.log('[CreateDeployment] Module enabled on-chain:', moduleEnabled);
      
      // Check if USDC is approved for the module
      const USDC_ADDRESS = chainId === 42161 
        ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' // Arbitrum USDC
        : '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
      
      const ERC20_ABI = ['function allowance(address owner, address spender) external view returns (uint256)'];
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      const allowance = await usdc.allowance(safeWallet, MODULE_ADDRESS);
      usdcApproved = allowance.gt(0);
      console.log('[CreateDeployment] USDC approved:', usdcApproved, 'Allowance:', allowance.toString());
    } catch (error) {
      console.error('[CreateDeployment] Error checking module/USDC status:', error);
      // Continue with deployment but moduleEnabled and usdcApproved will be false
    }

    // Return error if module is not enabled
    if (!moduleEnabled) {
      return res.status(400).json({
        error: 'MODULE_NOT_ENABLED',
        message: 'Trading module is not enabled on this Safe wallet',
        safeWallet,
        moduleAddress: MODULE_ADDRESS,
        chainId,
        nextSteps: {
          action: 'ENABLE_MODULE',
          instructions: [
            '1. Visit your Safe wallet',
            `2. Go to Settings → Modules`,
            `3. Add module: ${MODULE_ADDRESS}`,
            '4. Sign the transaction',
            '5. Return here and try again'
          ],
          safeAppUrl: chainId === 42161 
            ? `https://app.safe.global/home?safe=arb1:${safeWallet}`
            : `https://app.safe.global/home?safe=sep:${safeWallet}`,
        },
      });
    }

    // Return error if USDC is not approved
    if (!usdcApproved) {
      const USDC_ADDRESS = chainId === 42161 
        ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
        : '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      
      return res.status(400).json({
        error: 'USDC_NOT_APPROVED',
        message: 'USDC approval required for trading',
        safeWallet,
        moduleAddress: MODULE_ADDRESS,
        usdcAddress: USDC_ADDRESS,
        nextSteps: {
          action: 'APPROVE_USDC',
          instructions: [
            '1. Visit your Safe wallet',
            '2. Go to Apps → Transaction Builder',
            `3. Approve USDC (${USDC_ADDRESS}) for spender: ${MODULE_ADDRESS}`,
            '4. Set amount to maximum (or your trading capital)',
            '5. Sign and execute the transaction',
            '6. Return here and try again'
          ],
          safeAppUrl: chainId === 42161 
            ? `https://app.safe.global/apps?safe=arb1:${safeWallet}`
            : `https://app.safe.global/apps?safe=sep:${safeWallet}`,
        },
      });
    }

    // Create deployment with correct module status and moduleAddress
    const deployment = await prisma.agentDeployment.create({
      data: {
        agentId,
        userWallet,
        safeWallet,
        moduleAddress: MODULE_ADDRESS, // Save module address
        moduleEnabled: true, // Only create if enabled
        status: 'ACTIVE',
        subActive: true,
        subStartedAt: new Date(),
      },
      include: {
        agent: true,
      },
    });

    return res.status(201).json({
      success: true,
      deployment: {
        id: deployment.id,
        agentId: deployment.agentId,
        agentName: deployment.agent.name,
        venue: deployment.agent.venue,
        userWallet: deployment.userWallet,
        safeWallet: deployment.safeWallet,
        status: deployment.status,
        createdAt: deployment.subStartedAt,
      },
      safeInfo: {
        address: safeInfo.address,
        owners: safeInfo.owners,
        threshold: safeInfo.threshold,
        balances: {
          usdc: usdcBalance,
          eth: ethBalance,
        },
      },
      message: 'Agent deployed successfully',
      nextSteps: [
        `Ensure your Safe wallet (${safeWallet}) has USDC for trading`,
        'Agent will automatically execute signals based on subscribed CT accounts',
        `Trading venue: ${deployment.agent.venue}`,
      ],
    });
  } catch (error: any) {
    console.error('[CreateDeployment] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create deployment',
    });
  }
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
