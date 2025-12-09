/**
 * Hyperliquid Connect - Brutalist Design
 */

import { useState, useEffect } from 'react';
import { X, Wallet, Copy, Check, ExternalLink, CheckCircle, AlertCircle, Settings, Activity, Zap } from 'lucide-react';
import { ethers } from 'ethers';
import { TradingPreferencesModal } from './TradingPreferencesModal';

interface HyperliquidConnectProps {
  agentId: string;
  agentName: string;
  agentVenue: string;
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
          await checkSetupStatus(address);
        }
      }
    } catch (err) {
      console.error('Error checking existing connection:', err);
    }
  };

  const checkSetupStatus = async (wallet: string) => {
    try {
      const response = await fetch(`/api/user/check-setup-status?userWallet=${wallet}`);
      if (response.ok) {
        const data = await response.json();
        
        if (data.setupComplete) {
          if (data.addresses.hyperliquid) {
            setAgentAddress(data.addresses.hyperliquid);
          }
          await createDeploymentDirectly(wallet);
        } else {
          await checkUserPreferences(wallet);
        }
      } else {
        await checkUserPreferences(wallet);
      }
    } catch (err) {
      console.error('Error checking setup status:', err);
      await checkUserPreferences(wallet);
    }
  };

  const checkUserPreferences = async (wallet: string) => {
    try {
      const response = await fetch(`/api/user/trading-preferences?wallet=${wallet}`);
      if (response.ok) {
        const data = await response.json();
        const prefs = data.preferences;
        
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

  // Auto-open preferences modal when we reach the preferences step and user has none set
  useEffect(() => {
    if (step === 'preferences' && !hasPreferences) {
      setShowPreferencesModal(true);
    }
  }, [step, hasPreferences]);

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
      await checkSetupStatus(address);
      
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
      const response = await fetch('/api/hyperliquid/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userWallet: wallet }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create deployment');
      }

      setStep('complete');
      
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
    setStep('generate');
  };

  const skipPreferences = () => {
    setStep('generate');
  };

  const generateAgentAddress = async () => {
    setLoading(true);
    setError('');

    try {
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
      const response = await fetch('/api/hyperliquid/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userWallet }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create deployment');
      }

      setStep('complete');
      onSuccess?.();
    } catch (err: any) {
      console.error('Deployment error:', err);
      setError(err.message || 'Failed to create deployment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-lg w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="border-b border-[var(--border)] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center">
                  <Zap className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h2 className="font-display text-xl">{agentName}</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {agentVenue === 'MULTI' ? 'MULTI-VENUE' : 'HYPERLIQUID'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-4 border border-[var(--danger)] bg-[var(--danger)]/10">
                <AlertCircle className="h-5 w-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--danger)]">{error}</p>
              </div>
            )}

            {/* Step 1: Connect */}
            {step === 'connect' && (
              <div className="space-y-4">
                <div className="border border-[var(--border)] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-8 h-8 border border-[var(--accent)] flex items-center justify-center font-mono text-[var(--accent)]">1</span>
                    <h3 className="font-display text-lg">CONNECT WALLET</h3>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-6">
                    Connect your trading wallet to generate a secure agent address.
                  </p>
                  
                  <button
                    onClick={connectWallet}
                    disabled={loading}
                    className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Activity className="h-5 w-5 animate-pulse" />
                        CONNECTING...
                      </>
                    ) : (
                      <>
                        <Wallet className="h-5 w-5" />
                        CONNECT METAMASK
                      </>
                    )}
                  </button>
                </div>

                <div className="border border-[var(--border)] p-4 space-y-2 text-xs text-[var(--text-muted)]">
                  <p><span className="text-[var(--accent)]">→</span> Your private key never leaves your wallet</p>
                  <p><span className="text-[var(--accent)]">→</span> One agent address per user (reusable)</p>
                  <p><span className="text-[var(--accent)]">→</span> Your funds stay in your account</p>
                </div>
              </div>
            )}

            {/* Step 2: Preferences */}
            {step === 'preferences' && (
              <div className="space-y-4">
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4">
                  <p className="text-sm text-[var(--accent)]">
                    ✓ WALLET: {userWallet.slice(0, 10)}...{userWallet.slice(-8)}
                  </p>
                </div>

                <div className="border border-[var(--border)] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-8 h-8 border border-[var(--accent)] flex items-center justify-center font-mono text-[var(--accent)]">2</span>
                    <h3 className="font-display text-lg">TRADING STYLE</h3>
                  </div>

                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    {hasPreferences
                      ? "You've set your preferences. Update or continue."
                      : "Customize position sizing to match your style."}
                  </p>

                  <div className="border border-[var(--border)] p-4 mb-4 space-y-2 text-sm text-[var(--text-muted)]">
                    <p>• Risk Tolerance</p>
                    <p>• Trade Frequency</p>
                    <p>• Social Sentiment Weight</p>
                    <p>• Price Momentum Focus</p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowPreferencesModal(true)}
                      className="flex-1 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      {hasPreferences ? 'UPDATE' : 'SET PREFERENCES'}
                    </button>
                    <button
                      onClick={skipPreferences}
                      className="py-3 px-6 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors"
                    >
                      {hasPreferences ? 'KEEP' : 'SKIP'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Generate */}
            {step === 'generate' && (
              <div className="space-y-4">
                <div className="border border-[var(--border)] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-8 h-8 border border-[var(--accent)] flex items-center justify-center font-mono text-[var(--accent)]">3</span>
                    <h3 className="font-display text-lg">GENERATE ADDRESS</h3>
                  </div>

                  <p className="text-sm text-[var(--text-secondary)] mb-6">
                    Generate your reusable agent address for all deployments.
                  </p>

                  <button
                    onClick={generateAgentAddress}
                    disabled={loading}
                    className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Activity className="h-5 w-5 animate-pulse" />
                        GENERATING...
                      </>
                    ) : (
                      'GENERATE →'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Whitelist */}
            {step === 'whitelist' && (
              <div className="space-y-4">
                <div className="border border-[var(--border)] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-8 h-8 border border-[var(--accent)] flex items-center justify-center font-mono text-[var(--accent)]">4</span>
                    <h3 className="font-display text-lg">WHITELIST AGENT</h3>
                  </div>

                  {/* Agent Address */}
                  <div className="mb-4">
                    <p className="data-label mb-2">YOUR AGENT ADDRESS</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-[var(--bg-elevated)] px-4 py-3 text-sm break-all font-mono text-[var(--text-primary)] border border-[var(--border)]">
                        {agentAddress}
                      </code>
                      <button
                        onClick={copyAddress}
                        className="p-3 border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                        title="Copy"
                      >
                        {copied ? (
                          <Check className="h-5 w-5 text-[var(--accent)]" />
                        ) : (
                          <Copy className="h-5 w-5 text-[var(--text-muted)]" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="border border-[var(--border)] p-4 mb-4 space-y-2 text-sm text-[var(--text-secondary)]">
                    <p className="font-bold text-[var(--text-primary)] mb-3">STEPS:</p>
                    <p><span className="text-[var(--accent)] font-mono">01</span> Copy the address above</p>
                    <p><span className="text-[var(--accent)] font-mono">02</span> Open Hyperliquid</p>
                    <p><span className="text-[var(--accent)] font-mono">03</span> Go to Settings → API/Agent</p>
                    <p><span className="text-[var(--accent)] font-mono">04</span> Add/Authorize agent</p>
                    <p><span className="text-[var(--accent)] font-mono">05</span> Come back and confirm</p>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3">
                    <a
                      href={hyperliquidUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 border border-[var(--accent)] text-[var(--accent)] font-bold hover:bg-[var(--accent)]/10 transition-colors flex items-center justify-center gap-2"
                    >
                      OPEN HYPERLIQUID
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      onClick={completeDeployment}
                      disabled={loading}
                      className="py-3 px-6 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50"
                    >
                      {loading ? 'DEPLOYING...' : 'DONE'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Complete */}
            {step === 'complete' && (
              <div className="space-y-4">
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-8 text-center">
                  <CheckCircle className="h-16 w-16 mx-auto text-[var(--accent)] mb-4" />
                  <h3 className="font-display text-2xl mb-2">DEPLOYED</h3>
                  <p className="text-[var(--text-secondary)]">
                    {agentName} is ready to trade with your settings
                  </p>
                </div>

                <div className="border border-[var(--border)] p-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Account</span>
                    <code className="font-mono">{userWallet.slice(0, 10)}...{userWallet.slice(-8)}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Agent</span>
                    <code className="font-mono">{agentAddress.slice(0, 10)}...{agentAddress.slice(-8)}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Status</span>
                    <span className="text-[var(--accent)] font-bold">ACTIVE</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onSuccess?.();
                    onClose();
                  }}
                  className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                >
                  DONE
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
