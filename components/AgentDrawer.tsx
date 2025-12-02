import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../client/src/lib/db';
import { usePrivy } from '@privy-io/react-auth';
import { Rocket } from 'lucide-react';
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
  onClose: () => void;
}

export function AgentDrawer({ agentId, agentName, agentVenue, onClose }: AgentDrawerProps) {
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
      if (venue) return; // Already have venue
      
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

    // Handle different venues
    if (venue === 'HYPERLIQUID') {
      setHyperliquidModalOpen(true);
    } else if (venue === 'OSTIUM') {
      // Deploy Ostium - assign agent and open approval modal
      try {
        setLoading(true);
        const userWallet = user.wallet.address;
        console.log('[Ostium Deploy from Drawer] Starting deployment for agent:', agentId, 'user wallet:', userWallet);

        const response = await fetch('/api/ostium/deploy-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, userWallet }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to deploy Ostium agent');
        }

        console.log('[Ostium Deploy from Drawer] Agent assigned:', data);
        
        // Open approval modal for user to sign
        setOstiumApprovalModal({
          deploymentId: data.deploymentId,
          agentAddress: data.agentAddress,
          userWallet: data.userWallet,
        });
      } catch (err: any) {
        console.error('[Ostium Deploy from Drawer] Error:', err);
        alert(`Failed to deploy: ${err.message}`);
      } finally {
        setLoading(false);
      }
    } else if (venue === 'MULTI') {
      // For MULTI venue agents, open venue selector modal
      setMultiVenueSelectorOpen(true);
    } else {
      // For SPOT/GMX, navigate to Safe wallet deployment page
      window.location.href = `/deploy-agent/${agentId}`;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose}>
      <div
        className="fixed right-0 top-0 h-full w-full max-w-2xl bg-background shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid={`drawer-agent-${agentId}`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-foreground">{agentName}</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-close-drawer"
            >
              ✕
            </button>
          </div>

          {/* Deploy Button */}
          <div className="mb-6">
            {isDeployed ? (
              <div className="space-y-3">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center gap-3">
                  <Rocket className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Agent Deployed</p>
                    <p className="text-sm text-muted-foreground">
                      This agent is actively trading for you
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => window.location.href = `/agent/${agentId}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-base font-semibold hover-elevate active-elevate-2 transition-all"
                >
                  <Rocket className="h-5 w-5" />
                  View Performance Dashboard
                </button>
              </div>
            ) : authenticated ? (
              <button
                onClick={handleDeploy}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-lg text-base font-semibold hover-elevate active-elevate-2 transition-all"
                data-testid="button-deploy-agent"
              >
                <Rocket className="h-5 w-5" />
                {venue === 'HYPERLIQUID' 
                  ? 'Deploy Hyperliquid Agent' 
                  : venue === 'OSTIUM'
                  ? 'Deploy Ostium Agent'
                  : 'Deploy Agent & Connect Safe Wallet'}
              </button>
            ) : (
              <button
                onClick={login}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-lg text-base font-semibold hover-elevate active-elevate-2 transition-all"
                data-testid="button-connect-to-deploy"
              >
                <Rocket className="h-5 w-5" />
                Connect Wallet to Deploy
              </button>
            )}
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-foreground">
              30-Day Performance
            </h3>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : data.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data}>
                  <XAxis
                    dataKey="day"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `${value.toFixed(1)}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="return_pct"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No performance data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hyperliquid Setup Modal */}
      {hyperliquidModalOpen && (
        <HyperliquidConnect
          agentId={agentId}
          agentName={agentName}
          onClose={() => setHyperliquidModalOpen(false)}
          onSuccess={() => {
            setHyperliquidModalOpen(false);
            setIsDeployed(true);
            onClose(); // Close the drawer
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
            setIsDeployed(true);
            onClose(); // Close the drawer
          }}
        />
      )}

      {/* Ostium Approval Modal - User signs with wallet */}
      {ostiumApprovalModal && (
        <OstiumApproval
          deploymentId={ostiumApprovalModal.deploymentId}
          agentAddress={ostiumApprovalModal.agentAddress}
          userWallet={ostiumApprovalModal.userWallet}
          onApprovalComplete={() => {
            setOstiumApprovalModal(null);
            setIsDeployed(true);
            onClose(); // Close the drawer
          }}
          onClose={() => setOstiumApprovalModal(null)}
        />
      )}

      {/* Multi-Venue Selector Modal */}
      {multiVenueSelectorOpen && (
        <MultiVenueSelector
          agentId={agentId}
          agentName={agentName}
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
