/**
 * SPOT Setup Button - Enable Module + Approve USDC
 * Used in My Deployments page for existing Safes
 */

import { useState } from 'react';
import { Settings, Loader2, CheckCircle } from 'lucide-react';
import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';

interface SPOTSetupButtonProps {
  safeAddress: string;
  onSetupComplete?: () => void;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function SPOTSetupButton({ safeAddress, onSetupComplete }: SPOTSetupButtonProps) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const setupModule = async () => {
    setIsSettingUp(true);
    setError(null);

    try {
      if (!window.ethereum) {
        throw new Error('Please install MetaMask to continue');
      }

      console.log('[SPOTSetup] Starting module setup...');
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const userWallet = await signer.getAddress();

      console.log('[SPOTSetup] Connected as:', userWallet);
      console.log('[SPOTSetup] Safe address:', safeAddress);

      // Connect to the Safe
      const safeSdk = await Safe.init({
        provider: window.ethereum,
        signer: userWallet,
        safeAddress: safeAddress,
      });

      const MODULE_ADDRESS = '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb'; // V3 Module
      const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC
      const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

      // Check current status
      const isModuleEnabled = await safeSdk.isModuleEnabled(MODULE_ADDRESS);
      console.log('[SPOTSetup] Module enabled:', isModuleEnabled);

      const ERC20_ABI = [
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)'
      ];
      
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      const currentAllowance = await usdc.allowance(safeAddress, UNISWAP_V3_ROUTER);
      const isAlreadyApproved = currentAllowance.gt(ethers.utils.parseUnits('1000000', 6));
      console.log('[SPOTSetup] USDC approved:', isAlreadyApproved);

      const transactions = [];

      // Add module enable if needed
      if (!isModuleEnabled) {
        const SAFE_ABI = ['function enableModule(address module) external'];
        const safeInterface = new ethers.utils.Interface(SAFE_ABI);
        const enableModuleData = safeInterface.encodeFunctionData('enableModule', [MODULE_ADDRESS]);
        
        transactions.push({
          to: safeAddress,
          value: '0',
          data: enableModuleData,
        });
        console.log('[SPOTSetup] Will enable module');
      }

      // Add USDC approval if needed
      if (!isAlreadyApproved) {
        const usdcInterface = new ethers.utils.Interface(ERC20_ABI);
        const approveData = usdcInterface.encodeFunctionData('approve', [
          UNISWAP_V3_ROUTER,
          ethers.constants.MaxUint256
        ]);
        
        transactions.push({
          to: USDC_ADDRESS,
          value: '0',
          data: approveData,
        });
        console.log('[SPOTSetup] Will approve USDC');
      }

      if (transactions.length === 0) {
        console.log('[SPOTSetup] Everything already configured!');
        setSuccess(true);
        setTimeout(() => {
          if (onSetupComplete) onSetupComplete();
        }, 1500);
        return;
      }

      console.log(`[SPOTSetup] Batching ${transactions.length} operation(s)...`);

      // Create and execute batched transaction
      const batchedTx = await safeSdk.createTransaction({
        transactions
      });

      console.log('[SPOTSetup] Executing transaction...');
      const txResponse = await safeSdk.executeTransaction(batchedTx);
      
      console.log('[SPOTSetup] Transaction sent:', txResponse.hash);
      
      // Wait for confirmation
      await provider.waitForTransaction(txResponse.hash);
      
      console.log('[SPOTSetup] ✅ Setup complete!');
      setSuccess(true);

      // Trigger refresh
      setTimeout(() => {
        if (onSetupComplete) onSetupComplete();
      }, 1500);

    } catch (err: any) {
      console.error('[SPOTSetup] Error:', err);
      setError(err.message || 'Failed to setup module');
    } finally {
      setIsSettingUp(false);
    }
  };

  if (success) {
    return (
      <div className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium">
        <CheckCircle className="w-4 h-4" />
        Setup Complete!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={setupModule}
        disabled={isSettingUp}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSettingUp ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Setting up...
          </>
        ) : (
          <>
            <Settings className="w-4 h-4" />
            Enable Module (One-Click)
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

