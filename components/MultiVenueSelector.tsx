/**
 * Multi-Venue Selector Modal
 * Direct action buttons for each venue - user clicks and immediately whitelists
 * 
 * NEW BEHAVIOR:
 * - If user already has addresses → skip modal → create deployments directly
 * - If user is new → show venue selector → guide through setup
 */

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Zap, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
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

  // Check if user already has addresses on mount
  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      checkSetupStatus();
    } else if (authenticated === false) {
      // User is definitely not authenticated - show login prompt
      setLoading(false);
    }
    // If authenticated is undefined/null, keep loading (waiting for auth state)
  }, [authenticated, user?.wallet?.address]);

  const checkSetupStatus = async () => {
    if (!user?.wallet?.address) {
      console.log('[MultiVenueSelector] No wallet address - skipping check');
      return;
    }

    console.log('[MultiVenueSelector] 🔍 Checking setup status for:', user.wallet.address);

    try {
      // CRITICAL FIX: Pass agentId to check deployments for THIS specific agent
      // Not just if addresses exist (addresses can exist but not be whitelisted)
      const response = await fetch(`/api/user/check-setup-status?userWallet=${user.wallet.address}&agentId=${agentId}`);
      
      console.log('[MultiVenueSelector] API response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        
        console.log('[MultiVenueSelector] Setup status:', {
          hasHyperliquidAddress: data.hasHyperliquidAddress,
          hasOstiumAddress: data.hasOstiumAddress,
          hasHyperliquidDeployment: data.hasHyperliquidDeployment,
          hasOstiumDeployment: data.hasOstiumDeployment,
          addresses: data.addresses,
        });
        
        // Use deployment status (actual whitelisting) not just address existence
        const hasHyperliquid = data.hasHyperliquidDeployment || false;
        const hasOstium = data.hasOstiumDeployment || false;
        
        setSetupStatus({
          hasHyperliquid,
          hasOstium,
        });

        // CRITICAL FIX: Only auto-create if BOTH deployments exist for THIS agent
        // Don't auto-create just because addresses exist (user might not have whitelisted)
        if (hasHyperliquid && hasOstium) {
          console.log('[MultiVenueSelector] ✅ User has both deployments for this agent - skipping selector');
          // Both already deployed - just close
          setTimeout(() => {
            onComplete();
          }, 500);
        } else {
          // User needs to whitelist one or both venues - show selector
          console.log('[MultiVenueSelector] ⚠️  User needs to complete venue setup');
          console.log('  - Hyperliquid:', hasHyperliquid ? '✅ Deployed' : '❌ Needs setup');
          console.log('  - Ostium:', hasOstium ? '✅ Deployed' : '❌ Needs setup');
          setLoading(false);
        }
      } else {
        console.error('[MultiVenueSelector] API error:', response.status, response.statusText);
        setLoading(false);
      }
    } catch (err) {
      console.error('[MultiVenueSelector] Error checking setup status:', err);
      setLoading(false);
    }
  };

  const createBothDeploymentsDirectly = async (wallet: string) => {
    setCreatingDeployments(true);

    try {
      // Create Hyperliquid deployment
      const hlResponse = await fetch('/api/hyperliquid/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userWallet: wallet }),
      });

      // Create Ostium deployment
      const ostiumResponse = await fetch('/api/ostium/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userWallet: wallet }),
      });

      if (hlResponse.ok && ostiumResponse.ok) {
        console.log('[MultiVenueSelector] ✅ Both deployments created successfully');
        
        // Show success briefly then complete
        setTimeout(() => {
          onComplete();
        }, 1500);
      } else {
        throw new Error('Failed to create deployments');
      }
    } catch (err: any) {
      console.error('Error creating deployments:', err);
      // Fall back to showing the selector
      setLoading(false);
      setCreatingDeployments(false);
    }
  };

  const venues = [
    {
      id: 'HYPERLIQUID',
      name: 'Hyperliquid',
      description: 'Perpetual futures trading with agent whitelisting',
      gradient: 'from-purple-600 to-blue-600',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      borderColor: 'border-purple-200 dark:border-purple-800',
    },
    {
      id: 'OSTIUM',
      name: 'Ostium',
      description: 'Arbitrum perpetuals with low gas fees',
      gradient: 'from-blue-600 to-cyan-600',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
    {
      id: 'SPOT',
      name: 'SPOT (Coming Soon)',
      description: 'Spot trading on decentralized exchanges',
      gradient: 'from-green-600 to-emerald-600',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
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

  // If not authenticated, show login prompt instead of venue selector
  if (!authenticated && !loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <Zap className="h-16 w-16 text-primary" />
            <h3 className="text-xl font-bold">Connect Your Wallet</h3>
            <p className="text-muted-foreground">
              Please connect your wallet to deploy {agentName}
            </p>
            <button
              onClick={() => login()}
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Connect Wallet
            </button>
            <button
              onClick={onClose}
              className="w-full px-6 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading or success state while creating deployments
  if (loading || creatingDeployments) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="flex flex-col items-center text-center space-y-4">
            {creatingDeployments ? (
              <>
                <CheckCircle className="h-16 w-16 text-green-500" />
                <h3 className="text-xl font-bold">Agent Deployed! 🎉</h3>
                <p className="text-muted-foreground">
                  {agentName} is now active on Hyperliquid and Ostium.
                  <br />
                  Signals will execute immediately.
                </p>
              </>
            ) : (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Checking your setup...</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="border-b border-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  {setupStatus?.hasHyperliquid || setupStatus?.hasOstium
                    ? 'Complete Venue Setup'
                    : 'Setup Trading Venues'}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {setupStatus?.hasHyperliquid && !setupStatus?.hasOstium
                    ? 'Setup Ostium to complete multi-venue trading'
                    : setupStatus?.hasOstium && !setupStatus?.hasHyperliquid
                    ? 'Setup Hyperliquid to complete multi-venue trading'
                    : `Connect ${agentName} to trading platforms`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Show info banner based on setup status */}
            {setupStatus?.hasHyperliquid && setupStatus?.hasOstium ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                  ✅ Both venues are already deployed for this agent!
                </p>
              </div>
            ) : setupStatus?.hasHyperliquid || setupStatus?.hasOstium ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  ℹ️ {setupStatus.hasHyperliquid ? 'Hyperliquid' : 'Ostium'} is already deployed for this agent. Click the other venue to complete multi-venue setup.
                </p>
              </div>
            ) : (
              <div className={`${venues[0].bgColor} border ${venues[0].borderColor} rounded-lg p-4 mb-4`}>
                <p className={`text-sm ${venues[0].textColor} font-medium`}>
                  ℹ️ This is a multi-venue agent. Click each venue to whitelist the agent and start trading.
                </p>
              </div>
            )}

            {venues.map((venue) => {
              const isAlreadySetup = 
                (venue.id === 'HYPERLIQUID' && setupStatus?.hasHyperliquid) ||
                (venue.id === 'OSTIUM' && setupStatus?.hasOstium);
              
              return (
              <button
                key={venue.id}
                onClick={() => !venue.disabled && !isAlreadySetup && handleVenueClick(venue.id)}
                disabled={venue.disabled || isAlreadySetup}
                className={`w-full p-6 rounded-lg border-2 transition-all text-left hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${venue.borderColor} ${
                  isAlreadySetup ? 'bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700' : 'hover:border-primary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${venue.gradient} flex items-center justify-center`}>
                        <Zap className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xl">{venue.name}</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {venue.description}
                        </p>
                      </div>
                    </div>
                    
                    {!venue.disabled && (
                      <div className="ml-13 space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">✓</span>
                          <span>Agent whitelisting on {venue.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">✓</span>
                          <span>Trade with your funds - non-custodial</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">✓</span>
                          <span>Real-time signal execution</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 ml-4">
                    {venue.disabled ? (
                      <div className="px-4 py-2 bg-muted rounded-lg text-sm text-muted-foreground">
                        Soon
                      </div>
                    ) : isAlreadySetup ? (
                      <div className="px-5 py-3 bg-green-500 text-white rounded-lg font-semibold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>Active</span>
                      </div>
                    ) : (
                      <div className={`px-5 py-3 bg-gradient-to-r ${venue.gradient} text-white rounded-lg font-semibold flex items-center gap-2 hover:shadow-lg transition-shadow`}>
                        <span>Setup</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
              );
            })}

            <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
              <p className="font-semibold mb-2">How it works:</p>
              <ol className="space-y-1 ml-4 list-decimal">
                <li>Click a venue button above to start setup</li>
                <li>Whitelist the agent to trade on your behalf</li>
                <li>Agent executes signals automatically</li>
                <li>View all trades in "My Deployments"</li>
              </ol>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border p-6">
            <button
              onClick={onClose}
              className="w-full px-6 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Hyperliquid Setup Modal */}
      {hyperliquidModalOpen && (
        <HyperliquidConnect
          agentId={agentId}
          agentName={agentName}
          agentVenue="MULTI"
          onClose={() => setHyperliquidModalOpen(false)}
          onSuccess={() => {
            setHyperliquidModalOpen(false);
            // Refresh setup status
            if (user?.wallet?.address) {
              checkSetupStatus();
            }
          }}
        />
      )}

      {/* Ostium Setup Modal */}
      {ostiumModalOpen && (
        <OstiumConnect
          agentId={agentId}
          agentName={agentName}
          onClose={() => setOstiumModalOpen(false)}
          onSuccess={() => {
            setOstiumModalOpen(false);
            // Refresh setup status
            if (user?.wallet?.address) {
              checkSetupStatus();
            }
          }}
        />
      )}
    </>
  );
}

