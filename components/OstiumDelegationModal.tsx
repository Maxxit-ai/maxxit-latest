/**
 * Ostium Delegation Modal - For setting up delegation to agent address
 */

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Wallet, CheckCircle, AlertCircle, Activity, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';
import { getOstiumConfig } from '../lib/ostium-config';

interface OstiumDelegationModalProps {
  agentAddress: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// Get Ostium configuration based on environment
const { tradingContract: OSTIUM_TRADING_CONTRACT } = getOstiumConfig();
const OSTIUM_TRADING_ABI = ['function setDelegate(address delegate) external'];

export function OstiumDelegationModal({
  agentAddress,
  onClose,
  onSuccess,
}: OstiumDelegationModalProps) {
  const { authenticated, user, login } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [step, setStep] = useState<'connect' | 'delegate' | 'complete'>('connect');

  useEffect(() => {
    // If already authenticated when component mounts, go to delegate step
    if (authenticated && user?.wallet?.address && step === 'connect') {
      setStep('delegate');
    }
  }, [authenticated, user?.wallet?.address, step]);

  const approveDelegation = async () => {
    setLoading(true);
    setError('');

    try {
      if (!authenticated || !user?.wallet?.address) {
        throw new Error('Please connect your wallet');
      }

      if (!agentAddress) {
        throw new Error('Agent address not available');
      }

      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error('No wallet provider found. Please install MetaMask.');
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const network = await ethersProvider.getNetwork();

      const ARBITRUM_CHAIN_ID = 42161;
      if (network.chainId !== ARBITRUM_CHAIN_ID) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            throw new Error('Please add Arbitrum to your wallet');
          }
          throw new Error('Please switch to Arbitrum network');
        }
      }

      const signer = ethersProvider.getSigner();
      const contract = new ethers.Contract(OSTIUM_TRADING_CONTRACT, OSTIUM_TRADING_ABI, signer);

      const gasEstimate = await contract.estimateGas.setDelegate(agentAddress);
      const gasLimit = gasEstimate.mul(150).div(100);

      console.log(`[OstiumDelegation] Gas estimate: ${gasEstimate.toString()}, with 50% buffer: ${gasLimit.toString()}`);

      const tx = await contract.setDelegate(agentAddress, { gasLimit });
      setTxHash(tx.hash);

      await tx.wait();

      console.log('[OstiumDelegation] ✅ Delegation approved');
      setStep('complete');
      setTxHash(null);

      // Call onSuccess to refresh status
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('[OstiumDelegation] Delegation error:', err);

      if (err.code === 4001) {
        setError('Transaction rejected');
      } else if (err.code === 'CALL_EXCEPTION') {
        setError('Contract call failed. Please check network and try again.');
      } else {
        setError(err.message || 'Failed to approve delegation');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (!authenticated) {
      login();
    }
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onWheelCapture={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden overscroll-contain">
        {/* Header */}
        <div className="border-b border-[var(--border)] p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center">
                <Wallet className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="font-display text-xl">SETUP DELEGATION</h2>
                <p className="text-xs text-[var(--text-muted)]">Ostium Agent</p>
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
        <div
          className="p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar min-h-0"
          onWheelCapture={(e) => {
            const el = e.currentTarget;
            const isScrollable = el.scrollHeight > el.clientHeight;
            const isAtTop = el.scrollTop === 0;
            const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            if (isScrollable && !(isAtTop && e.deltaY < 0) && !(isAtBottom && e.deltaY > 0)) {
              e.stopPropagation();
            }
          }}
        >
          {error && (
            <div className="flex items-start gap-3 p-4 border border-[var(--danger)] bg-[var(--danger)]/10">
              <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
              <span className="text-sm text-[var(--danger)]">{error}</span>
            </div>
          )}

          {step === 'connect' ? (
            authenticated && user?.wallet?.address ? (
              <div className="text-center space-y-4 py-8">
                <Activity className="w-16 h-16 mx-auto text-[var(--accent)] animate-pulse" />
                <div>
                  <h3 className="font-display text-lg mb-2">INITIALIZING...</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Setting up delegation
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-6 py-4">
                <div className="w-16 h-16 mx-auto border border-[var(--accent)] flex items-center justify-center">
                  <Wallet className="w-8 h-8 text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="font-display text-lg mb-2">CONNECT WALLET</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Connect your Arbitrum wallet to delegate to your agent
                  </p>
                </div>
                <button
                  onClick={handleConnect}
                  className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"
                >
                  <Wallet className="w-5 h-5" />
                  CONNECT WALLET
                </button>
              </div>
            )
          ) : step === 'delegate' ? (
            <>
              <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4 space-y-2">
                <p className="text-sm text-[var(--accent)]">AGENT ADDRESS</p>
                <p className="text-xs font-mono break-all text-[var(--text-primary)]">{agentAddress}</p>
              </div>

              <div className="border border-[var(--border)] p-4 space-y-3 text-sm">
                <p className="font-bold">APPROVE DELEGATION</p>
                <div className="flex items-start gap-2 text-[var(--text-secondary)]">
                  <span className="text-[var(--accent)]">→</span>
                  <span>Sign transaction to delegate trading permissions</span>
                </div>
              </div>

              <div className="border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">NOTE:</strong> Agent can only trade - cannot withdraw funds. You remain in control.
              </div>

              {txHash && (
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-3">
                  <p className="text-[var(--accent)] text-sm mb-2">✓ Transaction confirmed</p>
                  <a
                    href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  >
                    View on Arbiscan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <button
                onClick={approveDelegation}
                disabled={loading}
                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Activity className="w-5 h-5 animate-pulse" />
                    SIGNING...
                  </>
                ) : (
                  'APPROVE DELEGATION →'
                )}
              </button>
            </>
          ) : (
            <div className="text-center space-y-6 py-4">
              <div className="w-16 h-16 mx-auto border border-[var(--accent)] bg-[var(--accent)] flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-[var(--bg-deep)]" />
              </div>
              <div>
                <h3 className="font-display text-xl mb-2">DELEGATION COMPLETE</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Your agent is now delegated to trade on your behalf
                </p>
              </div>

              {txHash && (
                <a
                  href={`https://arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--accent)] hover:underline flex items-center justify-center gap-1"
                >
                  View transaction <ExternalLink className="w-3 h-3" />
                </a>
              )}

              <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4 space-y-2 text-sm text-left">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span>Agent delegated</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span>Ready to execute trades</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
              >
                DONE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
