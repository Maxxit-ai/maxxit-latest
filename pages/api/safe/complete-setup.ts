/**
 * Complete Safe Setup API
 * 
 * Runs ALL 3 required steps for a Safe to be trading-ready:
 * 1. Enable module (if not already enabled)
 * 2. Approve USDC to Uniswap Router
 * 3. Initialize capital tracking
 * 
 * This ensures users don't miss any setup steps.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { createSafeModuleService } from '../../../lib/safe-module-service';

const RPC_URLS: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
  'function enableModule(address module) external',
];

interface SetupStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'skipped' | 'failed';
  message?: string;
  txHash?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress, chainId: requestedChainId } = req.body;
    
    // Default to Arbitrum
    const chainId = requestedChainId || 42161;
    const rpcUrl = RPC_URLS[chainId];
    
    if (!rpcUrl) {
      return res.status(400).json({
        error: `Unsupported chainId: ${chainId}`,
      });
    }

    if (!safeAddress || !ethers.utils.isAddress(safeAddress)) {
      return res.status(400).json({
        error: 'Invalid Safe address',
      });
    }

    if (!process.env.EXECUTOR_PRIVATE_KEY) {
      return res.status(500).json({
        error: 'EXECUTOR_PRIVATE_KEY not configured on server',
      });
    }

    console.log('[CompleteSetup] Starting full setup for Safe:', safeAddress);

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Check if Safe exists
    const code = await provider.getCode(safeAddress);
    if (code === '0x') {
      return res.status(400).json({
        error: 'Safe wallet not found on this chain',
        safeAddress,
        chainId,
      });
    }

    const steps: SetupStep[] = [
      { name: 'Enable Module', status: 'pending' },
      { name: 'Approve USDC to DEX Router', status: 'pending' },
      { name: 'Initialize Capital Tracking', status: 'pending' },
    ];

    // STEP 1: Check/Enable Module
    steps[0].status = 'running';
    
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);
    const isModuleEnabled = await safe.isModuleEnabled(MODULE_ADDRESS);
    
    if (isModuleEnabled) {
      steps[0].status = 'skipped';
      steps[0].message = 'Module already enabled';
      console.log('[CompleteSetup] ✅ Module already enabled');
    } else {
      steps[0].status = 'failed';
      steps[0].message = 'Module not enabled - user must enable it through Safe UI first';
      steps[0].error = 'This step requires Safe owner signature and cannot be automated';
      console.log('[CompleteSetup] ❌ Module not enabled');
      
      // Can't continue if module isn't enabled
      return res.status(200).json({
        success: false,
        needsManualModuleEnable: true,
        message: 'Module must be enabled by Safe owner first',
        steps,
        instructions: {
          step1: 'Go to Safe Apps → Transaction Builder',
          step2: `Enter contract: ${safeAddress}`,
          step3: `Call: enableModule(${MODULE_ADDRESS})`,
          step4: 'Sign and execute the transaction',
          step5: 'Then call this API again to complete remaining steps',
        },
      });
    }

    // Create module service for steps 2 and 3
    const moduleService = createSafeModuleService(
      MODULE_ADDRESS,
      chainId,
      process.env.EXECUTOR_PRIVATE_KEY
    );

    // STEP 2: Approve USDC to Router
    steps[1].status = 'running';
    console.log('[CompleteSetup] Running Step 2: USDC Approval...');
    
    const USDC_ADDRESSES: Record<number, string> = {
      11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    };
    
    const ROUTER_ADDRESSES: Record<number, string> = {
      11155111: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
      42161: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      8453: '0x2626664c2603336E57B271c5C0b26F421741e481',
    };
    
    const usdcAddress = USDC_ADDRESSES[chainId];
    const routerAddress = ROUTER_ADDRESSES[chainId];
    
    if (!usdcAddress || !routerAddress) {
      steps[1].status = 'failed';
      steps[1].error = `USDC or Router not configured for chain ${chainId}`;
    } else {
      const approvalResult = await moduleService.approveTokenForDex(
        safeAddress,
        usdcAddress,
        routerAddress
      );
      
      if (approvalResult.success) {
        steps[1].status = 'success';
        steps[1].message = 'USDC approved to DEX router';
        steps[1].txHash = approvalResult.txHash;
        console.log('[CompleteSetup] ✅ USDC approved:', approvalResult.txHash);
      } else {
        // Check if already approved
        const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
        const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, provider);
        const allowance = await usdcContract.allowance(safeAddress, routerAddress);
        
        if (allowance.gt(0)) {
          steps[1].status = 'skipped';
          steps[1].message = 'Already approved (existing allowance detected)';
          console.log('[CompleteSetup] ✅ USDC already approved');
        } else {
          steps[1].status = 'failed';
          steps[1].error = approvalResult.error;
          console.log('[CompleteSetup] ❌ USDC approval failed:', approvalResult.error);
        }
      }
    }

    // STEP 3: Initialize Capital
    steps[2].status = 'running';
    console.log('[CompleteSetup] Running Step 3: Capital Initialization...');
    
    try {
      const stats = await moduleService.getSafeStats(safeAddress);
      
      if (stats.initialized) {
        steps[2].status = 'skipped';
        steps[2].message = `Already initialized with ${stats.initialCapital} USDC`;
        console.log('[CompleteSetup] ✅ Capital already initialized');
      } else {
        const initResult = await moduleService.initializeCapital(safeAddress);
        
        if (initResult.success) {
          steps[2].status = 'success';
          steps[2].message = `Initialized with ${stats.currentBalance} USDC`;
          steps[2].txHash = initResult.txHash;
          console.log('[CompleteSetup] ✅ Capital initialized:', initResult.txHash);
        } else {
          steps[2].status = 'failed';
          steps[2].error = initResult.error;
          console.log('[CompleteSetup] ❌ Capital init failed:', initResult.error);
        }
      }
    } catch (error: any) {
      steps[2].status = 'failed';
      steps[2].error = error.message;
      console.log('[CompleteSetup] ❌ Capital init error:', error.message);
    }

    // Determine overall success
    const allSuccess = steps.every(s => s.status === 'success' || s.status === 'skipped');
    const anyFailed = steps.some(s => s.status === 'failed');

    console.log('[CompleteSetup] Setup complete:', {
      allSuccess,
      steps: steps.map(s => ({ name: s.name, status: s.status })),
    });

    return res.status(200).json({
      success: allSuccess,
      hasFailures: anyFailed,
      message: allSuccess 
        ? '🎉 Safe is fully configured and ready to trade!' 
        : anyFailed 
          ? 'Setup completed with some failures - see steps for details'
          : 'Setup in progress',
      safeAddress,
      chainId,
      steps,
      ready: allSuccess,
    });

  } catch (error: any) {
    console.error('[CompleteSetup] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to complete setup',
    });
  }
}

