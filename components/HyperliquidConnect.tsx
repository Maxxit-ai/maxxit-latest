/**
 * Hyperliquid Connect - NEW Flow (Vprime-telegram-clean)
 * 
 * Flow:
 * 1. Connect wallet
 * 2. Check/set trading preferences (Agent HOW)
 * 3. Generate user's agent address (ONE per user, NOT per deployment)
 * 4. Show whitelisting instructions
 * 5. Create deployment
 */

import { useState, useEffect } from 'react';
import { X, Wallet, Copy, Check, ExternalLink, Zap, Shield, CheckCircle, AlertCircle, Loader2, Settings } from 'lucide-react';
import { ethers } from 'ethers';
import { TradingPreferencesModal } from './TradingPreferencesModal';

interface HyperliquidConnectProps {
  agentId: string;
  agentName: string;
  agentVenue: string; // 'HYPERLIQUID' or 'MULTI'
  onClose: () => void;
  onSuccess?: () => void;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

type Step = 'connect' | 'preferences' | 'generate' | 'whitelist' | 'complete';

export function HyperliquidConnect({
  agentId,
  agentName,
  agentVenue,
  onClose,
  onSuccess,
}: HyperliquidConnectProps) {
  const [step, setStep] = useState<Step>('connect');
  const [userWallet, setUserWallet] = useState<string>('');
  const [agentAddress, setAgentAddress] = useState<string>('');
  const [hasPreferences, setHasPreferences] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
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
      if (typeof window !== 'undefined' && window.ethereum) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const address = accounts[0];
          setUserWallet(address);
          
          // Check if user has already completed setup
          await checkSetupStatus(address);
        }
      }
    } catch (err) {
      console.error('Error checking existing connection:', err);
    }
  };

  const checkSetupStatus = async (wallet: string) => {
    try {
      // Check if user already has addresses (from previous deployments)
      const response = await fetch(`/api/user/check-setup-status?userWallet=${wallet}`);
      if (response.ok) {
        const data = await response.json();
        
        if (data.setupComplete) {
          // User already has addresses - SKIP setup flow
          console.log('[HyperliquidConnect] User already has addresses - skipping setup');
          console.log('[HyperliquidConnect] Hyperliquid:', data.addresses.hyperliquid);
          console.log('[HyperliquidConnect] Ostium:', data.addresses.ostium);
          
          // Store address for display
          if (data.addresses.hyperliquid) {
            setAgentAddress(data.addresses.hyperliquid);
          }
          
          // Create deployment immediately (no setup needed)
          await createDeploymentDirectly(wallet);
        } else {
          // First time user - check preferences
          await checkUserPreferences(wallet);
        }
      } else {
        // Fallback to preference check
        await checkUserPreferences(wallet);
      }
    } catch (err) {
      console.error('Error checking setup status:', err);
      // Fallback to preference check
      await checkUserPreferences(wallet);
    }
  };

  const checkUserPreferences = async (wallet: string) => {
    try {
      const response = await fetch(`/api/user/trading-preferences?wallet=${wallet}`);
      if (response.ok) {
        const data = await response.json();
        const prefs = data.preferences;
        
        // Check if user has customized preferences (not all defaults)
        const hasCustom =
          prefs.risk_tolerance !== 50 ||
          prefs.trade_frequency !== 50 ||
          prefs.social_sentiment_weight !== 50 ||
          prefs.price_momentum_focus !== 50 ||
          prefs.market_rank_priority !== 50;
        
        setHasPreferences(hasCustom);
      }
    } catch (err) {
      console.error('Error checking preferences:', err);
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
      
      // Check if user has already completed setup
      await checkSetupStatus(address);
      
      // If setup not complete, will move to preferences step
      // If setup complete, deployment will be created directly
      if (step === 'connect') {
        setStep('preferences');
      }
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const createDeploymentDirectly = async (wallet: string) => {
    setLoading(true);
    setError('');

    try {
      console.log('[HyperliquidConnect] Creating deployment directly (user already has addresses)');
      
      // User already has addresses - just create deployment
      const response = await fetch('/api/hyperliquid/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          userWallet: wallet,
          // Backend will fetch addresses from user_agent_addresses
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create deployment');
      }

      const data = await response.json();
      console.log('[HyperliquidConnect] ✅ Deployment created:', data.deployment.id);
      
      // Show success immediately
      setStep('complete');
      
      // Notify parent
      if (onSuccess) {
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (err: any) {
      console.error('Error creating deployment:', err);
      setError(err.message || 'Failed to create deployment');
    } finally {
      setLoading(false);
    }
  };

  const handlePreferencesSet = async () => {
    setShowPreferencesModal(false);
    setHasPreferences(true);
    
    // Move to generate step
    setStep('generate');
  };

  const skipPreferences = () => {
    // User chose to use defaults
    setStep('generate');
  };

  const generateAgentAddress = async () => {
    setLoading(true);
    setError('');

    try {
      // Call NEW API to generate/get user's agent address
      const response = await fetch(`/api/agents/${agentId}/generate-deployment-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWallet,
          venue: agentVenue === 'MULTI' ? 'MULTI' : 'HYPERLIQUID',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate agent address');
      }

      const data = await response.json();
      
      // For MULTI venue, we get both addresses
      // For HYPERLIQUID, we get just Hyperliquid address
      if (data.venue === 'MULTI') {
        setAgentAddress(data.addresses.hyperliquid.address);
      } else {
        setAgentAddress(data.address);
      }
      
      setStep('whitelist');
    } catch (err: any) {
      console.error('Error generating address:', err);
      setError(err.message || 'Failed to generate agent address');
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

  const completeDeployment = async () => {
    setLoading(true);
    setError('');

    try {
      // Create deployment using NEW API
      const response = await fetch('/api/hyperliquid/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          userWallet,
          // No agentAddress or encrypted keys - backend fetches from user_agent_addresses
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create deployment');
      }

      const data = await response.json();
      console.log('[HyperliquidConnect] Deployment created:', data);
      
      setStep('complete');
      onSuccess?.();
    } catch (err: any) {
      console.error('[HyperliquidConnect] Deployment error:', err);
      setError(err.message || 'Failed to create deployment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-xl flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <Zap className="h-6 w-6" />
              <div>
                <h2 className="text-xl font-bold">Deploy {agentName}</h2>
                <p className="text-sm text-purple-100 mt-1">
                  {agentVenue === 'MULTI' ? 'Multi-Venue Trading' : 'Hyperliquid Perpetuals'}
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
                    Connect the wallet you use for trading. We'll generate a secure agent address for you.
                  </p>
                  
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
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-2 text-xs text-gray-600 dark:text-gray-400">
                  <p>🔐 <strong>Your private key never leaves your wallet.</strong></p>
                  <p>🤖 <strong>We generate ONE agent address per user</strong> (reusable for all agents).</p>
                  <p>💰 <strong>Your funds stay in YOUR account</strong> - agent can only trade.</p>
                </div>
              </div>
            )}

            {/* Step 2: Trading Preferences */}
            {step === 'preferences' && (
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
                      Customize Your Trading Style (Agent HOW)
                    </h3>
                  </div>

                  <p className="text-sm text-purple-800 dark:text-purple-200 mb-4">
                    {hasPreferences
                      ? "You've already set your trading preferences. You can update them or continue with existing settings."
                      : "Set your trading preferences to personalize position sizing. This creates a 'trade clone' matching your style."}
                  </p>

                  <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-4">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 text-sm">
                      What You'll Set:
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      <li>• <strong>Risk Tolerance:</strong> Conservative → Aggressive</li>
                      <li>• <strong>Trade Frequency:</strong> Patient → Active</li>
                      <li>• <strong>Social Sentiment Weight:</strong> Ignore → Follow</li>
                      <li>• <strong>Price Momentum Focus:</strong> Contrarian → Momentum</li>
                      <li>• <strong>Market Rank Priority:</strong> Any Coin → Top Only</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700 mb-4">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      💡 <strong>Result:</strong> Position sizes will range from 0.5% to 10% based on your preferences,
                      instead of a fixed 5% for all trades.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowPreferencesModal(true)}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Settings className="h-5 w-5" />
                      {hasPreferences ? 'Update Preferences' : 'Set Preferences'}
                    </button>
                    <button
                      onClick={skipPreferences}
                      className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      {hasPreferences ? 'Keep Current' : 'Use Defaults'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Generate Address */}
            {step === 'generate' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-green-200 dark:border-green-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-10 h-10 bg-green-600 rounded-full">
                      <span className="text-white font-bold">3</span>
                    </div>
                    <h3 className="font-bold text-lg text-green-900 dark:text-green-100">
                      Generate Agent Address
                    </h3>
                  </div>

                  <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                    We'll generate ONE reusable agent address for your account. You can use this for all your agent deployments.
                  </p>

                  <button
                    onClick={generateAgentAddress}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        Generate Address
                        <span className="ml-1">→</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Whitelist */}
            {step === 'whitelist' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-6 border border-yellow-200 dark:border-yellow-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-10 h-10 bg-yellow-600 rounded-full">
                      <span className="text-white font-bold">4</span>
                    </div>
                    <h3 className="font-bold text-lg text-yellow-900 dark:text-yellow-100">
                      Whitelist Agent on Hyperliquid
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
                    <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 rounded p-2">
                      🔒 This address is unique to you. You can reuse it for all agent deployments.
                    </p>
                  </div>

                  {/* Instructions */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700 mb-4">
                    <h4 className="font-bold text-blue-900 dark:text-blue-100 mb-3 text-sm">
                      📋 Whitelisting Steps:
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
                        <span>Connect with {userWallet.slice(0, 6)}...{userWallet.slice(-4)}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold">4.</span>
                        <span>Go to Settings → API/Agent</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold">5.</span>
                        <span>Add/Authorize agent, paste the address</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold">6.</span>
                        <span>Come back and click "I've Whitelisted It"</span>
                      </li>
                    </ol>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <a
                      href={hyperliquidUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                    >
                      <span>Open Hyperliquid</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      onClick={completeDeployment}
                      disabled={loading}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deploying...
                        </>
                      ) : (
                        "I've Whitelisted It"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Complete */}
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
                    {agentName} is deployed and ready to trade with your personalized settings!
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
                      <span>{agentName} monitors signals from your selected sources</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-0.5">🎯</span>
                      <span>Position sizes personalized to YOUR trading style</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-0.5">🤖</span>
                      <span>Positions open automatically using YOUR funds</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-0.5">💰</span>
                      <span>All PnL appears in YOUR Hyperliquid account</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => {
                    onSuccess?.();
                    onClose();
                  }}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trading Preferences Modal */}
      {showPreferencesModal && (
        <TradingPreferencesModal
          userWallet={userWallet}
          onClose={() => setShowPreferencesModal(false)}
          onSave={handlePreferencesSet}
        />
      )}
    </>
  );
}

