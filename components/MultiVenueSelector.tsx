/**
 * Multi-Venue Selector Modal
 * Direct action buttons for each venue - user clicks and immediately whitelists
 */

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Zap, ArrowRight, CheckCircle, Activity } from 'lucide-react';
import { HyperliquidConnect } from './HyperliquidConnect';
import { OstiumConnect } from './OstiumConnect';

interface MultiVenueSelectorProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onComplete: () => void;
}

export function MultiVenueSelector({
  agentId,
  agentName,
  onClose,
  onComplete,
}: MultiVenueSelectorProps) {
  const { authenticated, user, login } = usePrivy();
  const [hyperliquidModalOpen, setHyperliquidModalOpen] = useState(false);
  const [ostiumModalOpen, setOstiumModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingDeployments, setCreatingDeployments] = useState(false);
  const [setupStatus, setSetupStatus] = useState<{
    hasHyperliquid: boolean;
    hasOstium: boolean;
  } | null>(null);

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      checkSetupStatus();
    } else if (authenticated === false) {
      setLoading(false);
    }
  }, [authenticated, user?.wallet?.address]);

  const checkSetupStatus = async () => {
    if (!user?.wallet?.address) return;

    try {
      const response = await fetch(`/api/user/check-setup-status?userWallet=${user.wallet.address}&agentId=${agentId}`);
      
      if (response.ok) {
        const data = await response.json();
        
        const hasHyperliquid = data.hasHyperliquidDeployment || false;
        const hasOstium = data.hasOstiumDeployment || false;
        
        setSetupStatus({ hasHyperliquid, hasOstium });

        if (hasHyperliquid && hasOstium) {
          setTimeout(() => onComplete(), 500);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Error checking setup status:', err);
      setLoading(false);
    }
  };

  const venues = [
    {
      id: 'HYPERLIQUID',
      name: 'HYPERLIQUID',
      description: 'Perpetual futures with agent whitelisting',
    },
    {
      id: 'OSTIUM',
      name: 'OSTIUM',
      description: 'Arbitrum perpetuals with low gas',
    },
    {
      id: 'SPOT',
      name: 'SPOT',
      description: 'Coming soon',
      disabled: true,
    },
  ];

  const handleVenueClick = (venueId: string) => {
    if (!authenticated) {
      login();
      return;
    }

    if (venueId === 'HYPERLIQUID') {
      setHyperliquidModalOpen(true);
    } else if (venueId === 'OSTIUM') {
      setOstiumModalOpen(true);
    }
  };

  // Login prompt
  if (!authenticated && !loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-md w-full">
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 mx-auto border border-[var(--accent)] flex items-center justify-center">
              <Zap className="h-8 w-8 text-[var(--accent)]" />
            </div>
            <div>
              <h3 className="font-display text-xl mb-2">CONNECT WALLET</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                Connect your wallet to deploy {agentName}
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => login()}
                className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
              >
                CONNECT WALLET
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 border border-[var(--border)] text-[var(--text-secondary)] font-bold hover:border-[var(--text-primary)] transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading || creatingDeployments) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-md w-full p-8">
          <div className="text-center space-y-4">
            {creatingDeployments ? (
              <>
                <CheckCircle className="h-16 w-16 mx-auto text-[var(--accent)]" />
                <h3 className="font-display text-xl">DEPLOYED</h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  {agentName} is now active on both venues
                </p>
              </>
            ) : (
              <>
                <Activity className="h-12 w-12 mx-auto text-[var(--accent)] animate-pulse" />
                <p className="text-[var(--text-muted)]">Checking setup...</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="border-b border-[var(--border)] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="data-label mb-2">MULTI-VENUE AGENT</p>
                <h2 className="font-display text-2xl">{agentName}</h2>
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
          <div className="p-6 space-y-4">
            {/* Status banner */}
            {setupStatus?.hasHyperliquid || setupStatus?.hasOstium ? (
              <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4">
                <p className="text-sm text-[var(--accent)]">
                  {setupStatus.hasHyperliquid ? 'HYPERLIQUID' : 'OSTIUM'} deployed. 
                  Click the other venue to complete setup.
                </p>
              </div>
            ) : (
              <div className="border border-[var(--border)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Click each venue to whitelist the agent and start trading.
                </p>
              </div>
            )}

            {/* Venue buttons */}
            {venues.map((venue) => {
              const isAlreadySetup = 
                (venue.id === 'HYPERLIQUID' && setupStatus?.hasHyperliquid) ||
                (venue.id === 'OSTIUM' && setupStatus?.hasOstium);
              
              return (
                <button
                  key={venue.id}
                  onClick={() => !venue.disabled && !isAlreadySetup && handleVenueClick(venue.id)}
                  disabled={venue.disabled || isAlreadySetup}
                  className={`w-full p-5 border transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                    isAlreadySetup 
                      ? 'border-[var(--accent)] bg-[var(--accent)]/5' 
                      : 'border-[var(--border)] hover:border-[var(--accent)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center">
                          <Zap className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                        <div>
                          <h3 className="font-display text-lg">{venue.name}</h3>
                          <p className="text-xs text-[var(--text-muted)]">{venue.description}</p>
                        </div>
                      </div>
                      
                      {!venue.disabled && !isAlreadySetup && (
                        <div className="ml-13 space-y-1 text-xs text-[var(--text-muted)] mt-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--accent)]">✓</span>
                            <span>Non-custodial trading</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--accent)]">✓</span>
                            <span>Gasless execution</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0 ml-4">
                      {venue.disabled ? (
                        <div className="px-4 py-2 border border-[var(--border)] text-[var(--text-muted)] text-sm">
                          SOON
                        </div>
                      ) : isAlreadySetup ? (
                        <div className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          ACTIVE
                        </div>
                      ) : (
                        <div className="px-4 py-2 border border-[var(--accent)] text-[var(--accent)] font-bold text-sm flex items-center gap-2 hover:bg-[var(--accent)]/10 transition-colors">
                          SETUP
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* How it works */}
            <div className="border border-[var(--border)] p-4 mt-6">
              <p className="data-label mb-3">HOW IT WORKS</p>
              <ol className="space-y-2 text-sm text-[var(--text-secondary)]">
                <li className="flex gap-3">
                  <span className="text-[var(--accent)] font-mono">01</span>
                  <span>Click a venue to start setup</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-[var(--accent)] font-mono">02</span>
                  <span>Whitelist the agent to trade</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-[var(--accent)] font-mono">03</span>
                  <span>Agent executes signals automatically</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border)] p-6">
            <button
              onClick={onClose}
              className="w-full py-3 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>

      {hyperliquidModalOpen && (
        <HyperliquidConnect
          agentId={agentId}
          agentName={agentName}
          agentVenue="MULTI"
          onClose={() => setHyperliquidModalOpen(false)}
          onSuccess={() => {
            setHyperliquidModalOpen(false);
            if (user?.wallet?.address) {
              checkSetupStatus();
            }
          }}
        />
      )}

      {ostiumModalOpen && (
        <OstiumConnect
          agentId={agentId}
          agentName={agentName}
          onClose={() => setOstiumModalOpen(false)}
          onSuccess={() => {
            setOstiumModalOpen(false);
            if (user?.wallet?.address) {
              checkSetupStatus();
            }
          }}
        />
      )}
    </>
  );
}
