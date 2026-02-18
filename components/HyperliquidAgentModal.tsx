/**
 * Hyperliquid Agent Setup Modal
 * Shows agent address and Hyperliquid setup instructions for ANY agent
 */

import { useState, useEffect } from 'react';
import { X, Copy, Check, ExternalLink, Zap, Wallet, Shield, CheckCircle } from 'lucide-react';
import { ethers } from 'ethers';
import { useWalletProvider } from '../hooks/useWalletProvider';

interface HyperliquidAgentModalProps {
  agentId: string;
  agentName: string;
  deploymentId?: string; // Optional deployment ID for unique agent
  onClose: () => void;
}

export function HyperliquidAgentModal({
  agentId,
  agentName,
  deploymentId,
  onClose,
}: HyperliquidAgentModalProps) {
  const [agentAddress, setAgentAddress] = useState<string>('');
  const [userHyperliquidAddress, setUserHyperliquidAddress] = useState<string>('');
  const [savedAddress, setSavedAddress] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'connect' | 'approve' | 'verified'>('connect');
  const { getEip1193Provider } = useWalletProvider();

  // Default to testnet unless explicitly set to 'false'
  const isTestnet = process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET !== 'false';
  const hyperliquidUrl = isTestnet
    ? 'https://app.hyperliquid-testnet.xyz/API'
    : 'https://app.hyperliquid.xyz/API';

  useEffect(() => {
    loadData();
  }, [agentId]);

  const loadData = async () => {
    try {
      // If deploymentId provided, generate/fetch unique agent for this deployment
      if (deploymentId) {
        const genResponse = await fetch(`/api/agents/${agentId}/generate-hyperliquid-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deploymentId })
        });

        if (genResponse.ok) {
          const genData = await genResponse.json();
          setAgentAddress(genData.agentAddress);
        } else {
          throw new Error('Failed to generate agent');
        }
      } else {
        // Fallback to shared agent (for backwards compatibility)
        const fixedAgentAddress = process.env.NEXT_PUBLIC_HYPERLIQUID_AGENT_ADDRESS ||
          '0x0b91B5d2eB90ec3baAbd1347fF6bd69780F9E689';
        setAgentAddress(fixedAgentAddress);
      }

      // Try to connect wallet and get user's address
      try {
        const rawProvider = await getEip1193Provider();
        const provider = new ethers.providers.Web3Provider(rawProvider);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          setUserHyperliquidAddress(accounts[0]);
        }
      } catch (err) {
        console.log('Wallet not connected:', err);
      }

      // Check if user has already saved their address
      const response = await fetch(`/api/agents/${agentId}/hyperliquid-setup`);
      if (response.ok) {
        const data = await response.json();
        if (data.userHyperliquidAddress && data.isApproved) {
          // Only pre-fill if already approved (to skip setup)
          setSavedAddress(data.userHyperliquidAddress);
          setUserHyperliquidAddress(data.userHyperliquidAddress);
          setIsApproved(true);
          setStep('verified');
        }
        // Otherwise let user connect fresh with MetaMask
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('Failed to load agent data');
    } finally {
      setLoading(false);
    }
  };

  const connectMetaMask = async () => {
    try {
      const rawProvider = await getEip1193Provider();
      const provider = new ethers.providers.Web3Provider(rawProvider);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();

      setUserHyperliquidAddress(address);
      setError('');
    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    }
  };

  const saveAddress = async () => {
    if (!userHyperliquidAddress) {
      setError('Please connect your wallet first');
      return;
    }

    // Ethers v5 syntax
    if (!ethers.utils.isAddress(userHyperliquidAddress)) {
      setError('Invalid Ethereum address');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/agents/${agentId}/hyperliquid-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userHyperliquidAddress: userHyperliquidAddress,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save address');
      }

      setSavedAddress(userHyperliquidAddress);
      setStep('approve');
    } catch (err: any) {
      console.error('Failed to save address:', err);
      setError(err.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const verifyApproval = async () => {
    if (!savedAddress) {
      setError('No address saved');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      // Mark as approved (Hyperliquid's API doesn't expose agent approvals)
      // The actual verification will happen when a trade is attempted
      setIsApproved(true);
      setStep('verified');

      // Update backend
      await fetch(`/api/agents/${agentId}/hyperliquid-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userHyperliquidAddress: savedAddress,
          isApproved: true,
        }),
      });
    } catch (err: any) {
      console.error('Failed to save approval:', err);
      setError(err.message || 'Failed to save approval status');
    } finally {
      setVerifying(false);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-bold">Setup Hyperliquid for {agentName}</h2>
              <p className="text-sm text-purple-100 mt-1">
                Enable perpetual trading with Hyperliquid
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
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-purple-600 border-t-transparent"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          ) : (
            <>
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                  <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                </div>
              )}

              {/* Step 1: Connect Wallet */}
              {step === 'connect' && (
                <>
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-700">
                    <div className="flex items-center gap-3 mb-4">
                      <Wallet className="h-6 w-6 text-blue-600" />
                      <h3 className="font-bold text-blue-900 dark:text-blue-100">
                        Step 1: Connect Your Hyperliquid Account
                      </h3>
                    </div>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
                      Connect your MetaMask wallet. This is the same address you use on Hyperliquid.
                      We will NOT ask for your private key - ever!
                    </p>

                    {userHyperliquidAddress ? (
                      <div className="space-y-3">
                        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                            Your Hyperliquid Address:
                          </label>
                          <code className="block text-sm font-mono text-gray-800 dark:text-gray-200 break-all">
                            {userHyperliquidAddress}
                          </code>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={connectMetaMask}
                            className="px-4 py-2 border-2 border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          >
                            Switch Account
                          </button>
                          <button
                            onClick={saveAddress}
                            disabled={saving}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {saving ? 'Saving...' : 'Continue →'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={connectMetaMask}
                        className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                      >
                        <Wallet className="h-5 w-5" />
                        Connect MetaMask
                      </button>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-2">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      🔐 <strong>Security Note:</strong> You only share your public address, never your private key.
                      Your funds remain in YOUR Hyperliquid account at all times.
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      💡 <strong>Tip:</strong> To use a different account, switch accounts in MetaMask first, then click "Switch Account" above.
                    </p>
                  </div>
                </>
              )}

              {/* Step 2: Approve Agent on Hyperliquid */}
              {step === 'approve' && (
                <>
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <p className="text-sm text-green-800 dark:text-green-200 font-semibold">
                        Address Saved: {savedAddress}
                      </p>
                    </div>
                  </div>

                  {/* Agent Address to Copy */}
                  <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-700">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Agent Address (Paste This on Hyperliquid):
                      </label>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        ✓ Generated & Encrypted
                      </span>
                    </div>
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
                    <p className="mt-3 text-xs text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 rounded p-2">
                      🔒 <strong>Security:</strong> This is just an address (public). You do NOT need any private key.
                      The private key is securely encrypted on our backend.
                    </p>
                  </div>

                  {/* Instructions */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-700">
                    <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                      <span className="text-xl">📋</span>
                      Step 2: Approve Agent on Hyperliquid
                    </h3>
                    <ol className="space-y-3 text-sm text-blue-800 dark:text-blue-200">
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          1
                        </span>
                        <span>
                          <strong>Copy</strong> the agent address above (click the copy button)
                        </span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          2
                        </span>
                        <span>
                          <strong>Click</strong> "Open Hyperliquid API" below → goes directly to API settings
                        </span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          3
                        </span>
                        <span>
                          <strong>Connect</strong> your wallet ({savedAddress.slice(0, 6)}...{savedAddress.slice(-4)}) on Hyperliquid
                        </span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          4
                        </span>
                        <span>
                          <strong>Enter agent name:</strong> "MaxxitAgent" (or any name you like)
                        </span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          5
                        </span>
                        <span>
                          <strong>Paste the agent address</strong> you copied in step 1
                        </span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          6
                        </span>
                        <span>
                          <strong>Click "Authorize"</strong> on Hyperliquid - Done! 🎉
                        </span>
                      </li>
                    </ol>
                  </div>

                  {/* What Agent Can Do */}
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-700">
                    <h3 className="font-bold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
                      <Shield className="h-5 w-5 text-green-600" />
                      What Agent Can Do:
                    </h3>
                    <ul className="space-y-2 text-sm text-green-800 dark:text-green-200">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">✅</span>
                        <span>Open perpetual positions using your funds</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">✅</span>
                        <span>Close positions and manage trades</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">✅</span>
                        <span>Manage leverage and position sizing</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-600 dark:text-red-400 mt-0.5">❌</span>
                        <span><strong>Cannot</strong> withdraw your funds (enforced on-chain!)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-600 dark:text-red-400 mt-0.5">❌</span>
                        <span><strong>Cannot</strong> transfer assets</span>
                      </li>
                    </ul>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <a
                      href={hyperliquidUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                    >
                      <span>Open Hyperliquid API {isTestnet ? '(Testnet)' : ''}</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      onClick={verifyApproval}
                      disabled={verifying}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {verifying ? 'Checking...' : 'I Authorized It'}
                    </button>
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                    After authorizing on Hyperliquid, click "I Authorized It" to complete setup
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 text-center mt-2">
                    💡 Verification will happen automatically when your first trade executes
                  </p>
                </>
              )}

              {/* Step 3: Verified */}
              {step === 'verified' && (
                <>
                  <div className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-green-200 dark:border-green-700 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
                      <CheckCircle className="h-10 w-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-green-900 dark:text-green-100 mb-2">
                      Setup Complete! 🎉
                    </h3>
                    <p className="text-green-800 dark:text-green-200 mb-4">
                      Your Hyperliquid account is now connected and the agent is approved.
                    </p>
                    <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-green-200 dark:border-green-700 space-y-2 text-left">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Your Account:</span>
                        <code className="text-gray-800 dark:text-gray-200 font-mono">{savedAddress.slice(0, 10)}...{savedAddress.slice(-8)}</code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Agent Address:</span>
                        <code className="text-gray-800 dark:text-gray-200 font-mono">{agentAddress.slice(0, 10)}...{agentAddress.slice(-8)}</code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Status:</span>
                        <span className="text-green-600 dark:text-green-400 font-semibold">✅ Approved</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setStep('connect');
                        setSavedAddress('');
                        setIsApproved(false);
                      }}
                      className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Change Account
                    </button>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-700">
                    <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-3">What happens next?</h3>
                    <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5">📊</span>
                        <span>The agent will monitor trading signals from X (Twitter)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5">🤖</span>
                        <span>When signals are detected, the agent will open positions on Hyperliquid using YOUR funds</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5">💰</span>
                        <span>All positions and PnL appear in YOUR Hyperliquid account</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5">🔐</span>
                        <span>You can withdraw anytime - your funds never leave YOUR account!</span>
                      </li>
                    </ul>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={onClose}
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
                </>
              )}

              {/* Help */}
              {step !== 'verified' && (
                <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
                  <p>💡 <strong>Tip:</strong> You can revoke agent access anytime from Hyperliquid settings.</p>
                  <p className="mt-1">📖 Need help? Check <a href="https://hyperliquid.gitbook.io/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-900 dark:hover:text-gray-200">Hyperliquid docs</a></p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

