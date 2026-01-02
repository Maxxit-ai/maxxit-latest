import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../client/src/lib/db';
import { usePrivy } from '@privy-io/react-auth';
import { Rocket, X, TrendingUp, Activity } from 'lucide-react';
import { HyperliquidConnect } from './HyperliquidConnect';
import { OstiumConnect } from './OstiumConnect';
import { OstiumApproval } from './OstiumApproval';
import { MultiVenueSelector } from './MultiVenueSelector';

interface PnlSnapshot {
  day: string;
  return_pct: number;
}

interface AgentDrawerProps {
  agentId: string;
  agentName: string;
  agentVenue?: string;
  agentDescription?: string | null;
  onClose: () => void;
}

export function AgentDrawer({ agentId, agentName, agentVenue, agentDescription, onClose }: AgentDrawerProps) {
  const { authenticated, user, login } = usePrivy();
  const [data, setData] = useState<PnlSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeployed, setIsDeployed] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [venue, setVenue] = useState<string>(agentVenue || '');
  const [hyperliquidModalOpen, setHyperliquidModalOpen] = useState(false);
  const [ostiumModalOpen, setOstiumModalOpen] = useState(false);
  const [multiVenueSelectorOpen, setMultiVenueSelectorOpen] = useState(false);
  const [ostiumApprovalModal, setOstiumApprovalModal] = useState<{
    deploymentId: string;
    agentAddress: string;
    userWallet: string;
  } | null>(null);

  // Fetch agent venue if not provided
  useEffect(() => {
    async function fetchAgentVenue() {
      if (venue) return;
      
      try {
        const agents = await db.get('agents', {
          'id': `eq.${agentId}`,
          'select': 'venue',
        });
        
        if (agents && agents.length > 0) {
          setVenue(agents[0].venue);
        }
      } catch (error) {
        console.error('Error fetching agent venue:', error);
      }
    }
    fetchAgentVenue();
  }, [agentId, venue]);

  useEffect(() => {
    async function fetchData() {
      try {
        const snapshots = await db.get('pnl_snapshots', {
          'agent_id': `eq.${agentId}`,
          'order': 'day.asc',
          'select': 'day,return_pct',
        });
        setData(snapshots || []);
      } catch (error) {
        console.error('Error fetching PnL data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [agentId]);

  // Check if user has already deployed this agent
  useEffect(() => {
    async function checkDeployment() {
      if (!authenticated || !user?.wallet?.address) {
        setIsDeployed(false);
        return;
      }

      try {
        const deployments = await db.get('agent_deployments', {
          'agentId': `eq.${agentId}`,
          'userWallet': `eq.${user.wallet.address}`,
          'status': `eq.ACTIVE`,
          'select': 'id',
        });
        
        if (deployments && deployments.length > 0) {
          setIsDeployed(true);
          setDeploymentId(deployments[0].id);
        } else {
          setIsDeployed(false);
          setDeploymentId(null);
        }
      } catch (error) {
        console.error('Error checking deployment:', error);
      }
    }
    checkDeployment();
  }, [agentId, authenticated, user?.wallet?.address]);

  const handleDeploy = async () => {
    if (!authenticated || !user?.wallet?.address) {
      login();
      return;
    }

    if (venue === 'HYPERLIQUID') {
      setHyperliquidModalOpen(true);
    } else if (venue === 'OSTIUM') {
      try {
        setLoading(true);
        const userWallet = user.wallet.address;

        const response = await fetch('/api/ostium/deploy-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, userWallet }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to deploy Ostium agent');
        }
        
        setOstiumApprovalModal({
          deploymentId: data.deploymentId,
          agentAddress: data.agentAddress,
          userWallet: data.userWallet,
        });
      } catch (err: any) {
        console.error('[Ostium Deploy] Error:', err);
        alert(`Failed to deploy: ${err.message}`);
      } finally {
        setLoading(false);
      }
    } else if (venue === 'MULTI') {
      setMultiVenueSelectorOpen(true);
    } else {
      window.location.href = `/deploy-agent/${agentId}`;
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 z-50">
      <div
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-[var(--bg-deep)] border-l border-[var(--border)] overflow-y-auto modal-scrollable"
        onClick={(e) => e.stopPropagation()}
        data-testid={`drawer-agent-${agentId}`}
        style={{ overscrollBehavior: 'contain' }}
        onWheel={(e) => {
          const target = e.currentTarget;
          const isAtTop = target.scrollTop === 0;
          const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
          
          if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
            e.stopPropagation();
          }
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-deep)] border-b border-[var(--border)] p-6 z-10">
          <div className="flex justify-between items-start">
            <div>
              <p className="data-label mb-2">AGENT DETAILS</p>
              <h2 className="font-display text-2xl text-[var(--text-primary)]">{agentName}</h2>
              {venue && (
                <span className="inline-block mt-2 text-xs px-2 py-0.5 border border-[var(--accent)] text-[var(--accent)]">
                  {venue === 'MULTI' ? 'MULTI-VENUE' : venue}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
              data-testid="button-close-drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Deploy Button */}
          <div>
            {isDeployed ? (
              <div className="space-y-4">
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-[var(--accent)]" />
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">AGENT DEPLOYED</p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Actively trading for you
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => window.location.href = `/agent/${agentId}`}
                  className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                >
                  VIEW DASHBOARD →
                </button>
              </div>
            ) : authenticated ? (
              <button
                onClick={handleDeploy}
                disabled={loading}
                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50"
                data-testid="button-deploy-agent"
              >
                <span className="flex items-center justify-center gap-2">
                  <Rocket className="h-5 w-5" />
                  {loading ? 'DEPLOYING...' : `DEPLOY ${venue || 'AGENT'} →`}
                </span>
              </button>
            ) : (
              <button
                onClick={login}
                className="w-full py-4 border border-[var(--accent)] text-[var(--accent)] font-bold hover:bg-[var(--accent)]/10 transition-colors"
                data-testid="button-connect-to-deploy"
              >
                CONNECT WALLET TO DEPLOY
              </button>
            )}
          </div>

          {/* Performance Chart */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="font-display text-lg">30-DAY PERFORMANCE</h3>
            </div>
            
            <div className="border border-[var(--border)] p-4">
              {loading ? (
                <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
                  <span className="animate-pulse">Loading...</span>
                </div>
              ) : data.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data}>
                    <XAxis
                      dataKey="day"
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickFormatter={(value) => `${value.toFixed(1)}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 0,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--text-muted)' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="return_pct"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-[var(--text-muted)] border border-dashed border-[var(--border)]">
                  No performance data available
                </div>
              )}
            </div>
          </div>

          {/* Agent Info */}
          <div>
            <h3 className="font-display text-lg mb-4">AGENT INFO</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-3 border-b border-[var(--border)]">
                <span className="text-[var(--text-muted)]">Venue</span>
                <span className="font-mono text-[var(--text-primary)]">{venue || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-[var(--border)]">
                <span className="text-[var(--text-muted)]">Execution</span>
                <span className="font-mono text-[var(--accent)]">GASLESS</span>
              </div>
              <div className="flex justify-between py-3 border-b border-[var(--border)]">
                <span className="text-[var(--text-muted)]">Custody</span>
                <span className="font-mono text-[var(--accent)]">NON-CUSTODIAL</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {hyperliquidModalOpen && (
        <HyperliquidConnect
          agentId={agentId}
          agentVenue={venue}
          agentName={agentName}
          onClose={() => setHyperliquidModalOpen(false)}
          onSuccess={() => {
            setHyperliquidModalOpen(false);
            setIsDeployed(true);
            onClose();
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
            setIsDeployed(true);
            onClose();
          }}
        />
      )}

      {ostiumApprovalModal && (
        <OstiumApproval
          deploymentId={ostiumApprovalModal.deploymentId}
          agentAddress={ostiumApprovalModal.agentAddress}
          userWallet={ostiumApprovalModal.userWallet}
          onApprovalComplete={() => {
            setOstiumApprovalModal(null);
            setIsDeployed(true);
            onClose();
          }}
          onClose={() => setOstiumApprovalModal(null)}
        />
      )}

      {multiVenueSelectorOpen && (
        <MultiVenueSelector
          agentId={agentId}
          agentName={agentName}
          agentDescription={agentDescription || null}
          onClose={() => setMultiVenueSelectorOpen(false)}
          onComplete={() => {
            setMultiVenueSelectorOpen(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
