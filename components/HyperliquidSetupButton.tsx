/**
 * Hyperliquid Setup Button - Enable Module + Bridge USDC + Setup Agent Wallet
 * Used in My Deployments page for existing Safes
 */

import { useState } from 'react';
import { Zap, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';

interface HyperliquidSetupButtonProps {
  safeAddress: string;
  onSetupComplete?: () => void;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function HyperliquidSetupButton({ safeAddress, onSetupComplete }: HyperliquidSetupButtonProps) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [setupSteps, setSetupSteps] = useState<string[]>([]);

  const addStep = (step: string) => {
    setSetupSteps(prev => [...prev, step]);
  };

  const setupHyperliquid = async () => {
    setIsSettingUp(true);
    setError(null);
    setSetupSteps([]);

    try {
      if (!window.ethereum) {
        throw new Error('Please install MetaMask to continue');
      }

      addStep('Connecting wallet...');
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const userWallet = await signer.getAddress();

      console.log('[HyperliquidSetup] Connected as:', userWallet);
      console.log('[HyperliquidSetup] Safe address:', safeAddress);

      // Connect to the Safe
      addStep('Initializing Safe...');
      const safeSdk = await Safe.init({
        provider: window.ethereum,
        signer: userWallet,
        safeAddress: safeAddress,
      });

      const MODULE_ADDRESS = '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb'; // V3 Module
      const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC
      const HL_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7'; // Hyperliquid Bridge on Arbitrum

      // Check current status
      addStep('Checking module status...');
      const isModuleEnabled = await safeSdk.isModuleEnabled(MODULE_ADDRESS);
      console.log('[HyperliquidSetup] Module enabled:', isModuleEnabled);

      const ERC20_ABI = [
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function balanceOf(address owner) view returns (uint256)'
      ];
      
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      
      // Check USDC balance
      const usdcBalance = await usdc.balanceOf(safeAddress);
      const usdcBalanceFormatted = ethers.utils.formatUnits(usdcBalance, 6);
      console.log('[HyperliquidSetup] USDC balance:', usdcBalanceFormatted);
      
      // Check bridge allowance
      const bridgeAllowance = await usdc.allowance(safeAddress, HL_BRIDGE);
      const isBridgeApproved = bridgeAllowance.gt(ethers.utils.parseUnits('1000000', 6));
      console.log('[HyperliquidSetup] Bridge approved:', isBridgeApproved);

      const transactions = [];

      // Add module enable if needed
      if (!isModuleEnabled) {
        addStep('Preparing module enable transaction...');
        const SAFE_ABI = ['function enableModule(address module) external'];
        const safeInterface = new ethers.utils.Interface(SAFE_ABI);
        const enableModuleData = safeInterface.encodeFunctionData('enableModule', [MODULE_ADDRESS]);
        
        transactions.push({
          to: safeAddress,
          value: '0',
          data: enableModuleData,
        });
        console.log('[HyperliquidSetup] Will enable module');
      }

      // Add USDC approval for bridge if needed
      if (!isBridgeApproved) {
        addStep('Preparing bridge approval...');
        const usdcInterface = new ethers.utils.Interface(ERC20_ABI);
        const approveData = usdcInterface.encodeFunctionData('approve', [
          HL_BRIDGE,
          ethers.constants.MaxUint256
        ]);
        
        transactions.push({
          to: USDC_ADDRESS,
          value: '0',
          data: approveData,
        });
        console.log('[HyperliquidSetup] Will approve bridge');
      }

      if (transactions.length === 0) {
        console.log('[HyperliquidSetup] Everything already configured!');
        addStep('✅ Setup complete! Your Safe is ready for Hyperliquid trading.');
        setSuccess(true);
        setTimeout(() => {
          if (onSetupComplete) onSetupComplete();
        }, 1500);
        return;
      }

      addStep(`Batching ${transactions.length} transaction(s)...`);
      console.log(`[HyperliquidSetup] Batching ${transactions.length} operation(s)...`);

      // Create and execute batched transaction
      const batchedTx = await safeSdk.createTransaction({
        transactions
      });

      addStep('Please approve the transaction in your wallet...');
      console.log('[HyperliquidSetup] Executing transaction...');
      const txResponse = await safeSdk.executeTransaction(batchedTx);
      
      console.log('[HyperliquidSetup] Transaction sent:', txResponse.hash);
      addStep('Transaction submitted! Waiting for confirmation...');
      
      // Wait for confirmation
      await provider.waitForTransaction(txResponse.hash);
      
      console.log('[HyperliquidSetup] ✅ Setup complete!');
      addStep('✅ Setup complete! Your Safe is ready for Hyperliquid trading.');
      
      // Register agent wallet for Hyperliquid trading
      addStep('Registering agent wallet...');
      try {
        const registerResponse = await fetch('/api/hyperliquid/register-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ safeAddress }),
        });
        
        if (registerResponse.ok) {
          const data = await registerResponse.json();
          addStep(`✅ Agent wallet registered: ${data.agentAddress?.substring(0, 10)}...`);
        }
      } catch (regError) {
        console.error('[HyperliquidSetup] Agent registration error:', regError);
        addStep('⚠️ Agent wallet registration failed (you can retry later)');
      }
      
      setSuccess(true);

      // Trigger refresh
      setTimeout(() => {
        if (onSetupComplete) onSetupComplete();
      }, 2000);

    } catch (err: any) {
      console.error('[HyperliquidSetup] Error:', err);
      setError(err.message || 'Failed to setup Hyperliquid');
      addStep(`❌ Error: ${err.message}`);
    } finally {
      setIsSettingUp(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-2">
        <div className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium">
          <CheckCircle className="w-4 h-4" />
          Hyperliquid Setup Complete!
        </div>
        {setupSteps.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
            {setupSteps.map((step, i) => (
              <div key={i}>• {step}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={setupHyperliquid}
        disabled={isSettingUp}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSettingUp ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Setting up...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            Enable Hyperliquid (One-Click)
          </>
        )}
      </button>
      
      {setupSteps.length > 0 && !error && (
        <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto p-2 bg-muted rounded">
          {setupSteps.map((step, i) => (
            <div key={i}>• {step}</div>
          ))}
        </div>
      )}
      
      {error && (
        <div className="flex items-start gap-2 p-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

