/**
 * Hyperliquid Connect - NEW Flow with Agent HOW
 * 1. Connect wallet
 * 2. Set trading preferences (Agent HOW)
 * 3. Generate/get user's agent address (ONE per user)
 * 4. Whitelist on Hyperliquid
 * 5. Create deployment
 */

import { useState, useEffect } from 'react';
import { X, Wallet, Copy, Check, ExternalLink, Zap, Shield, CheckCircle, AlertCircle, Loader2, Settings } from 'lucide-react';
import { ethers } from 'ethers';
import { TradingPreferencesModal } from './TradingPreferencesModal';

interface HyperliquidConnectProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function HyperliquidConnect({
  agentId,
  agentName,
  onClose,
  onSuccess,
}: HyperliquidConnectProps) {
  const [step, setStep] = useState<'connect' | 'approve' | 'complete'>('connect');
  const [userWallet, setUserWallet] = useState<string>('');
  const [agentAddress, setAgentAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Default to testnet unless explicitly set to 'false'
  const isTestnet = process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET !== 'false';
  const hyperliquidUrl = isTestnet 
    ? 'https://app.hyperliquid-testnet.xyz/API'
    : 'https://app.hyperliquid.xyz/API';

  useEffect(() => {
    checkExistingConnection();
  }, []);

  const checkExistingConnection = async () => {
    try {
      // Check if user already has wallet connected
      if (typeof window !== 'undefined' && window.ethereum) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const address = accounts[0];
          setUserWallet(address);
          
          // Check if user already has agent wallet
          const response = await fetch(`/api/hyperliquid/user-wallet?userAddress=${address}`);
          if (response.ok) {
            const data = await response.json();
            if (data.agentAddress && data.isApproved) {
              setAgentAddress(data.agentAddress);
              setStep('complete');
            } else if (data.agentAddress) {
              setAgentAddress(data.agentAddress);
              setStep('approve');
            }
          }
        }
      }
    } catch (err) {
      console.error('Error checking existing connection:', err);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('MetaMask not found. Please install MetaMask.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      
      setUserWallet(address);
      
      // Get or create agent wallet for this user
      const response = await fetch('/api/hyperliquid/user-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: address }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate agent wallet');
      }

      const data = await response.json();
      setAgentAddress(data.agentAddress);
      
      // Check if already approved
      if (data.isApproved) {
        setStep('complete');
      } else {
        setStep('approve');
      }
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(agentAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const resetConnection = async () => {
    if (!confirm('This will delete your current agent wallet and generate a new one. You will need to approve it again on Hyperliquid. Continue?')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Delete the user's agent wallet
      const deleteResponse = await fetch('/api/hyperliquid/user-wallet', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: userWallet }),
      });

      if (!deleteResponse.ok) {
        throw new Error('Failed to delete old wallet');
      }

      // Reset state and restart flow
      setAgentAddress('');
      setStep('connect');
      
      console.log('✅ Connection reset. Click "Connect Wallet" to generate a new agent.');
    } catch (err: any) {
      console.error('Reset error:', err);
      setError(err.message || 'Failed to reset connection');
    } finally {
      setLoading(false);
    }
  };

  const markAsApproved = async () => {
    if (!userWallet) {
      setError('Please connect your wallet first');
      return;
    }

    if (!agentAddress) {
      setError('Agent wallet not generated. Please go back to step 1.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('[HyperliquidConnect] Marking as approved:', {
        userWallet,
        agentAddress,
      });

      // Step 1: Mark as approved in user_hyperliquid_wallets
      const response = await fetch('/api/hyperliquid/user-wallet', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: userWallet,
          isApproved: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[HyperliquidConnect] API Error:', errorData);
        throw new Error(errorData.error || 'Failed to update approval status');
      }

      const result = await response.json();
      console.log('[HyperliquidConnect] Approval successful:', result);

      // Step 2: Create or update deployment for this agent
      console.log('[HyperliquidConnect] Creating deployment for agent...');
      const deploymentResponse = await fetch('/api/hyperliquid/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          userWallet,
          agentAddress,
        }),
      });

      if (!deploymentResponse.ok) {
        const errorData = await deploymentResponse.json();
        console.warn('[HyperliquidConnect] Deployment warning:', errorData);
        // Don't fail if deployment creation fails - user can still trade
      } else {
        const deploymentResult = await deploymentResponse.json();
        console.log('[HyperliquidConnect] Deployment created:', deploymentResult);
      }

      setStep('complete');
      onSuccess?.();
    } catch (err: any) {
      console.error('[HyperliquidConnect] Approval error:', err);
      setError(err.message || 'Failed to save approval status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-xl flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-bold">Connect Hyperliquid</h2>
              <p className="text-sm text-purple-100 mt-1">
                Enable {agentName} to trade perpetuals
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Step 1: Connect Wallet */}
          {step === 'connect' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-full">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100">
                    Connect Your Wallet
                  </h3>
                </div>
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
                  Connect the wallet you use on Hyperliquid. We'll generate a secure agent wallet for you.
                </p>
                
                {userWallet ? (
                  <div className="space-y-3">
                    <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        Connected Wallet:
                      </label>
                      <code className="block text-sm font-mono text-gray-800 dark:text-gray-200 break-all">
                        {userWallet}
                      </code>
                    </div>
                    <button
                      onClick={connectWallet}
                      disabled={loading}
                      className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Generating Agent...
                        </>
                      ) : (
                        <>
                          Continue
                          <span className="ml-1">→</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectWallet}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Wallet className="h-5 w-5" />
                        Connect MetaMask
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-2 text-xs text-gray-600 dark:text-gray-400">
                <p>🔐 <strong>Your private key never leaves your wallet.</strong></p>
                <p>🤖 <strong>We generate a secure agent wallet</strong> (private key encrypted on our backend).</p>
                <p>💰 <strong>Your funds stay in YOUR Hyperliquid account</strong> - agent can only trade.</p>
              </div>
            </div>
          )}

          {/* Step 2: Approve on Hyperliquid */}
          {step === 'approve' && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <p className="text-sm text-green-800 dark:text-green-200 font-semibold">
                    ✅ Wallet Connected: {userWallet.slice(0, 10)}...{userWallet.slice(-8)}
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-purple-600 rounded-full">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <h3 className="font-bold text-lg text-purple-900 dark:text-purple-100">
                    Approve Agent on Hyperliquid
                  </h3>
                </div>

                {/* Agent Address */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Your Agent Address (copy this):
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white dark:bg-gray-900 px-4 py-3 rounded-lg text-sm break-all font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                      {agentAddress}
                    </code>
                    <button
                      onClick={copyAddress}
                      className="p-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
                      title="Copy address"
                    >
                      {copied ? (
                        <Check className="h-5 w-5 text-green-600" />
                      ) : (
                        <Copy className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      )}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 rounded p-2 flex-1">
                      🔒 This agent is unique to you. Private key stored securely.
                    </p>
                    <button
                      onClick={resetConnection}
                      disabled={loading}
                      className="ml-2 text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      title="Generate a new agent wallet"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700 mb-4">
                  <h4 className="font-bold text-blue-900 dark:text-blue-100 mb-3 text-sm">
                    📋 Quick Steps:
                  </h4>
                  <ol className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                    <li className="flex gap-2">
                      <span className="font-bold">1.</span>
                      <span>Copy the agent address above</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">2.</span>
                      <span>Click "Open Hyperliquid" below</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">3.</span>
                      <span>Connect with your wallet ({userWallet.slice(0, 6)}...{userWallet.slice(-4)})</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">4.</span>
                      <span>Go to Settings → API/Agent</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">5.</span>
                      <span>Add/Authorize new agent, paste the address</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">6.</span>
                      <span>Come back and click "I've Approved It"</span>
                    </li>
                  </ol>
                </div>

                {/* What Agent Can Do */}
                <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    What Agent Can Do:
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-start gap-1">
                      <span className="text-green-600">✅</span>
                      <span>Open positions</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="text-green-600">✅</span>
                      <span>Close positions</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="text-red-600">❌</span>
                      <span>Withdraw funds</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="text-red-600">❌</span>
                      <span>Transfer assets</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <a
                  href={hyperliquidUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                >
                  <span>Open Hyperliquid {isTestnet ? '(Testnet)' : ''}</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={markAsApproved}
                  disabled={loading || !agentAddress}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "I've Approved It"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 'complete' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-8 border border-green-200 dark:border-green-700 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
                  <CheckCircle className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-green-900 dark:text-green-100 mb-2">
                  All Set! 🎉
                </h3>
                <p className="text-green-800 dark:text-green-200 mb-4">
                  Your Hyperliquid account is connected and ready to trade.
                </p>
                <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-green-200 dark:border-green-700 space-y-2 text-left text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Your Account:</span>
                    <code className="text-gray-800 dark:text-gray-200 font-mono">{userWallet.slice(0, 10)}...{userWallet.slice(-8)}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Agent Address:</span>
                    <code className="text-gray-800 dark:text-gray-200 font-mono">{agentAddress.slice(0, 10)}...{agentAddress.slice(-8)}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className="text-green-600 dark:text-green-400 font-semibold">✅ Active</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-700">
                <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-3 text-sm">What happens next?</h3>
                <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">📊</span>
                    <span>{agentName} will monitor trading signals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">🤖</span>
                    <span>Positions open automatically using YOUR funds</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">💰</span>
                    <span>All PnL appears in YOUR Hyperliquid account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">🔐</span>
                    <span>You control your funds - withdraw anytime!</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    onSuccess?.();
                    onClose();
                  }}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                >
                  Done
                </button>
                <a
                  href={isTestnet ? 'https://app.hyperliquid-testnet.xyz' : 'https://app.hyperliquid.xyz'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 border-2 border-purple-600 text-purple-600 dark:text-purple-400 rounded-lg font-semibold hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors inline-flex items-center gap-2"
                >
                  View on Hyperliquid
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

