/**
 * ONE-CLICK GMX Setup Page
 * 
 * User Experience:
 * 1. Connect wallet
 * 2. Click "Setup GMX Trading"
 * 3. Sign ONE transaction
 * 4. Done! ✅
 */

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Safe, { EthersAdapter } from '@safe-global/protocol-kit';
import { MetaTransactionData } from '@safe-global/safe-core-sdk-types';
import { CheckCircle } from 'lucide-react';

const MODULE_ADDRESS = '0x07627aef95CBAD4a17381c4923Be9B9b93526d3D';
const GMX_ROUTER = '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6';
const EXECUTOR_ADDRESS = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';

export default function GMXSetup() {
  const [safeAddress, setSafeAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [setupComplete, setSetupComplete] = useState(false);

  const checkSetupStatus = async () => {
    if (!safeAddress) return;

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Check module enabled
      const safeAbi = ['function isModuleEnabled(address module) view returns (bool)'];
      const safe = new ethers.Contract(safeAddress, safeAbi, provider);
      const isModuleEnabled = await safe.isModuleEnabled(MODULE_ADDRESS);

      // Check GMX authorized
      const gmxAbi = ['function isSubaccount(address account, address subaccount) view returns (bool)'];
      const gmxRouter = new ethers.Contract(GMX_ROUTER, gmxAbi, provider);
      const isGMXAuthorized = await gmxRouter.isSubaccount(safeAddress, EXECUTOR_ADDRESS);

      if (isModuleEnabled && isGMXAuthorized) {
        setSetupComplete(true);
        setStatus('✅ Setup complete! You can start GMX trading!');
      } else {
        setStatus(`Module: ${isModuleEnabled ? '✅' : '❌'} | GMX Auth: ${isGMXAuthorized ? '✅' : '❌'}`);
      }
    } catch (error: any) {
      console.error('Check status error:', error);
    }
  };

  useEffect(() => {
    if (safeAddress) {
      checkSetupStatus();
    }
  }, [safeAddress]);

  const setupGMXTrading = async () => {
    if (!safeAddress) {
      alert('Please enter your Safe address');
      return;
    }

    setLoading(true);
    setStatus('Preparing transaction...');

    try {
      // Connect wallet
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const signerAddress = await signer.getAddress();

      // Initialize Safe SDK
      const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: signer,
      });

      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
      });

      setStatus('Creating batch transaction...');

      // Transaction 1: Enable Module
      const enableModuleData = safeSdk.getContractManager()
        .safeContract.encode('enableModule', [MODULE_ADDRESS]);

      // Transaction 2: Authorize GMX Subaccount
      const gmxInterface = new ethers.utils.Interface([
        'function setSubaccount(address subaccount, bool authorized)',
      ]);
      const authorizeGMXData = gmxInterface.encodeFunctionData('setSubaccount', [
        EXECUTOR_ADDRESS,
        true,
      ]);

      // Batch transactions
      const transactions: MetaTransactionData[] = [
        {
          to: safeAddress,
          data: enableModuleData,
          value: '0',
        },
        {
          to: GMX_ROUTER,
          data: authorizeGMXData,
          value: '0',
        },
      ];

      setStatus('Creating Safe transaction...');

      const safeTransaction = await safeSdk.createTransaction({
        safeTransactionData: transactions,
      });

      setStatus('Please sign the transaction...');

      const txHash = await safeSdk.getTransactionHash(safeTransaction);
      const signature = await safeSdk.signTransactionHash(txHash);

      setStatus('Executing transaction...');

      const executeTxResponse = await safeSdk.executeTransaction(safeTransaction);
      const receipt = await executeTxResponse.transactionResponse?.wait();

      setStatus('✅ Setup complete! Checking status...');
      
      // Wait a bit for blockchain confirmation
      setTimeout(checkSetupStatus, 3000);

      alert(`Success! Transaction: ${receipt?.transactionHash}`);
    } catch (error: any) {
      console.error('Setup error:', error);
      setStatus(`❌ Error: ${error.message}`);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">🚀 ONE-CLICK GMX Setup</h1>
        <p className="text-muted-foreground mb-8">
          Complete your GMX trading setup with a single transaction
        </p>
        
        <div className="border border-border rounded-lg bg-card p-6 mb-6">
          <h3 className="text-lg font-semibold mb-3">What This Does:</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>Enables Maxxit Trading Module on your Safe</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>Authorizes executor for GMX trading</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>First trade will auto-initialize USDC approvals</span>
            </li>
          </ul>
        </div>

        <div className="border border-border rounded-lg bg-card p-6 mb-6">
          <label className="block">
            <span className="text-sm font-medium mb-2 block">Your Safe Address:</span>
            <input
              type="text"
              value={safeAddress}
              onChange={(e) => setSafeAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          {status && (
            <div
              className={`mt-4 p-4 rounded-md border ${
                setupComplete
                  ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                  : 'bg-muted border-border'
              }`}
            >
              <p className="text-sm">
                <strong>Status:</strong> {status}
              </p>
            </div>
          )}

          <button
            onClick={setupGMXTrading}
            disabled={loading || setupComplete || !safeAddress}
            className="w-full mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md text-base font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Setting up...' : setupComplete ? '✅ Setup Complete' : '🚀 Setup GMX Trading (ONE-CLICK)'}
          </button>
        </div>

        {!setupComplete && (
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 mb-6">
            <h4 className="font-semibold mb-3">📋 Requirements:</h4>
            <ul className="space-y-2 text-sm">
              <li>• You must be a Safe owner/signer</li>
              <li>• Your Safe must be on Arbitrum One</li>
              <li>• Gas fees are sponsored by Maxxit</li>
            </ul>
          </div>
        )}

        <div className="border border-border rounded-lg bg-card p-6 mb-6">
          <h4 className="font-semibold mb-3">🔒 Security Notes:</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>Non-custodial: You retain full control of your Safe</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>Module can only execute trades, not transfer funds arbitrarily</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>You can disable the module anytime via Safe settings</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>GMX positions are owned by your Safe, not the executor</span>
            </li>
          </ul>
        </div>

        <div className="border border-border rounded-lg bg-card p-6">
          <h4 className="font-semibold mb-3">📚 What Happens Next:</h4>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Module is enabled on your Safe</li>
            <li>GMX executor is authorized</li>
            <li>First trade auto-initializes:
              <ul className="mt-1 ml-6 space-y-1 list-disc list-inside">
                <li>USDC approval to module (0.2 USDC fee per trade)</li>
                <li>USDC approval to Uniswap (for swaps)</li>
                <li>Capital tracking initialization</li>
              </ul>
            </li>
            <li>Start trading! 🎉</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

