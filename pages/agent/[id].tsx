import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { TrendingUp, Activity, DollarSign, Target, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { Header } from "@components/Header";
import { usePrivy } from '@privy-io/react-auth';

// Custom styles for checkboxes and range sliders
const customStyles = `
  /* Custom checkbox styling */
  input[type="checkbox"].deployment-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 1rem;
    height: 1rem;
    border: 2px solid #fff;
    border-radius: 0.25rem;
    background: transparent;
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  
  input[type="checkbox"].deployment-checkbox:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  
  input[type="checkbox"].deployment-checkbox:hover:not(:disabled) {
    border-color: var(--accent);
  }
  
  input[type="checkbox"].deployment-checkbox:checked::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #000;
    font-size: 0.75rem;
    font-weight: bold;
    line-height: 1;
  }
  
  input[type="checkbox"].deployment-checkbox:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  /* Custom range slider styling */
  input[type="range"].deployment-range {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 0.5rem;
    border-radius: 0.25rem;
    background: #fff;
    outline: none;
    cursor: pointer;
    border: 1px solid var(--border);
  }
  
  input[type="range"].deployment-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: 3px solid #000;
    box-shadow: 0 0 0 1px var(--accent);
    transition: all 0.2s;
  }
  
  input[type="range"].deployment-range::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }
  
  input[type="range"].deployment-range::-moz-range-thumb {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: 3px solid #000;
    box-shadow: 0 0 0 1px var(--accent);
    transition: all 0.2s;
  }
  
  input[type="range"].deployment-range::-moz-range-thumb:hover {
    transform: scale(1.1);
  }
  
  input[type="range"].deployment-range::-moz-range-track {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    height: 0.5rem;
  }
`;

interface Agent {
  id: string;
  name: string;
  venue: string;
  status: string;
  creatorWallet: string;
  profitReceiverAddress: string;
  apr30d: number | null;
  apr90d: number | null;
  aprSi: number | null;
  sharpe30d: number | null;
}

interface Position {
  id: string;
  deploymentId: string;
  signalId: string;
  tokenSymbol: string;
  venue: string;
  side: 'LONG' | 'SHORT' | string;
  entryPrice: number;
  currentPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  size: number;
  pnl: number;
  pnlPercentage: number;
  status: string;
  source?: string;
  exitReason?: string | null;
  openedAt: string;
  closedAt: string | null;
}

interface PositionResponse {
  data: Position[];
  page: number;
  pageSize: number;
  total: number;
  summary: {
    openCount: number;
    closedCount: number;
    totalPnl: number;
    totalNotional: number;
  };
}

interface Signal {
  id: string;
  agent_id: string;
  token_symbol: string;
  venue: string;
  side: 'LONG' | 'SHORT' | string;
  lunarcrush_score?: number | null;
  proof_verified?: boolean | null;
  executor_agreement_verified?: boolean | null;
  created_at: string;
  bucket6h?: string;
}

interface PaginatedSignalsResponse {
  data: Signal[];
  page: number;
  pageSize: number;
  total: number;
}

interface Deployment {
  subActive: boolean;
  enabledVenues: string[];
  riskTolerance: number;
  tradeFrequency: number;
  socialSentimentWeight: number;
  priceMomentumFocus: number;
  marketRankPriority: number;
}

const PaginationControls = ({
  page,
  pageSize,
  total,
  onPageChange,
  loading = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (nextPage: number) => void;
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between px-2 py-3 text-sm text-muted-foreground">
      <div>
        Page {page} of {totalPages} • {total} records
      </div>
      <div className="flex items-center gap-2">
        <button
          disabled={!canPrev || loading}
          onClick={() => canPrev && onPageChange(page - 1)}
          className="px-3 py-1 rounded border border-border bg-card disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          disabled={!canNext || loading}
          onClick={() => canNext && onPageChange(page + 1)}
          className="px-3 py-1 rounded border border-border bg-card disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default function AgentDashboard() {
  const router = useRouter();
  const { id: agentId } = router.query;
  const { authenticated, user } = usePrivy();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [positionsMeta, setPositionsMeta] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  const [positionSummary, setPositionSummary] = useState({
    openCount: 0,
    closedCount: 0,
    totalPnl: 0,
    totalNotional: 0,
  });
  const [positionFilters, setPositionFilters] = useState({
    status: "OPEN",
    side: "ALL",
    venue: "ALL",
    symbol: "",
  });
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [signalsMeta, setSignalsMeta] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  const [signalFilters, setSignalFilters] = useState({
    side: "ALL",
    venue: "ALL",
    tokenSymbol: "",
  });
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Deployment state
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [deploymentLoading, setDeploymentLoading] = useState(false);
  const [deploymentEditOpen, setDeploymentEditOpen] = useState(false);
  const [deploymentSaving, setDeploymentSaving] = useState(false);
  const [deploymentForm, setDeploymentForm] = useState<Deployment | null>(null);

  const agentIdParam = Array.isArray(agentId) ? agentId[0] : agentId;

  useEffect(() => {
    if (agentIdParam) {
      fetchAgentData();
      fetchPositions(1);
      fetchSignals(1);
    }
  }, [agentIdParam]);

  useEffect(() => {
    if (agentIdParam && authenticated) {
      fetchDeployment();
    }
  }, [agentIdParam, authenticated]);

  useEffect(() => {
    if (agentIdParam) {
      fetchPositions(1);
    }
  }, [agentIdParam, positionFilters]);

  useEffect(() => {
    if (agentIdParam) {
      fetchSignals(1);
    }
  }, [agentIdParam, signalFilters]);

  const fetchAgentData = async () => {
    setLoading(true);
    setError("");

    try {
      const agentRes = await fetch(`/api/agents/${agentIdParam}`);
      if (!agentRes.ok) throw new Error("Failed to fetch agent");
      const agentData = await agentRes.json();
      setAgent(agentData);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to load agent data");
      setLoading(false);
    }
  };

  const fetchPositions = async (page = positionsMeta.page) => {
    if (!agentIdParam) return;
    setPositionsLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(positionsMeta.pageSize));
      if (positionFilters.status !== "ALL") params.set("status", positionFilters.status);
      if (positionFilters.side !== "ALL") params.set("side", positionFilters.side);
      if (positionFilters.venue !== "ALL") params.set("venue", positionFilters.venue);
      if (positionFilters.symbol) params.set("symbol", positionFilters.symbol);

      const positionsRes = await fetch(`/api/agents/${agentIdParam}/positions?${params.toString()}`);
      if (!positionsRes.ok) throw new Error("Failed to fetch positions");

      const data: PositionResponse = await positionsRes.json();
      setPositions(data.data);
      setPositionsMeta({
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
      });
      setPositionSummary(data.summary);
    } catch (err: any) {
      setError(err.message || "Failed to load positions");
    } finally {
      setPositionsLoading(false);
    }
  };

  const fetchSignals = async (page = signalsMeta.page) => {
    if (!agentIdParam) return;
    setSignalsLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("agentId", String(agentIdParam));
      params.set("page", String(page));
      params.set("pageSize", String(signalsMeta.pageSize));
      if (signalFilters.side !== "ALL") params.set("side", signalFilters.side);
      if (signalFilters.venue !== "ALL") params.set("venue", signalFilters.venue);
      if (signalFilters.tokenSymbol) params.set("tokenSymbol", signalFilters.tokenSymbol);

      const signalsRes = await fetch(`/api/signals?${params.toString()}`);
      if (!signalsRes.ok) throw new Error("Failed to fetch signals");

      const data: PaginatedSignalsResponse = await signalsRes.json();
      setSignals(data.data);
      setSignalsMeta({
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load signals");
    } finally {
      setSignalsLoading(false);
    }
  };

  const fetchDeployment = async () => {
    if (!agentIdParam) return;
    if (!authenticated || !user?.wallet?.address) {
      setError("User not authenticated");
      return;
    }
    
    setDeploymentLoading(true);

    try {
      const userWallet = user.wallet.address;
      const deploymentRes = await fetch(`/api/agents/${agentIdParam}/deployments?userWallet=${encodeURIComponent(userWallet)}`);
      if (!deploymentRes.ok) throw new Error("Failed to fetch deployment");

      const deploymentData: Deployment = await deploymentRes.json();
      setDeployment(deploymentData);
      setDeploymentForm(deploymentData);
    } catch (err: any) {
      setError(err.message || "Failed to load deployment");
    } finally {
      setDeploymentLoading(false);
    }
  };

  const saveDeployment = async () => {
    if (!deploymentForm || !agentIdParam || !authenticated || !user?.wallet?.address) return;
    setDeploymentSaving(true);

    try {
      const userWallet = user.wallet.address;
      const deploymentRes = await fetch(`/api/agents/${agentIdParam}/deployments?userWallet=${encodeURIComponent(userWallet)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subActive: deploymentForm.subActive,
          enabledVenues: deploymentForm.enabledVenues,
          riskTolerance: deploymentForm.riskTolerance,
          tradeFrequency: deploymentForm.tradeFrequency,
          socialSentimentWeight: deploymentForm.socialSentimentWeight,
          priceMomentumFocus: deploymentForm.priceMomentumFocus,
          marketRankPriority: deploymentForm.marketRankPriority,
        }),
      });
      
      if (!deploymentRes.ok) throw new Error("Failed to update deployment");

      const updatedDeployment: Deployment = await deploymentRes.json();
      setDeployment(updatedDeployment);
      setDeploymentForm(updatedDeployment);
      setDeploymentEditOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to update deployment");
    } finally {
      setDeploymentSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Agent</h2>
          <p className="text-muted-foreground mb-4">{error || 'Agent not found'}</p>
          <button
            onClick={() => router.push('/creator')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Back to Agents
          </button>
        </div>
      </div>
    );
  }

  const totalPnl = positionSummary.totalPnl;
  const totalPnlPercentage = positionSummary.totalNotional > 0
    ? (totalPnl / positionSummary.totalNotional) * 100
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <style dangerouslySetInnerHTML={{ __html: customStyles }} />
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Deployments
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{agent.name}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  {agent.venue}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${agent.status === 'ACTIVE' ? 'bg-green-500/10 text-green-500' :
                  agent.status === 'PAUSED' ? 'bg-yellow-500/10 text-yellow-500' :
                    'bg-gray-500/10 text-gray-500'
                  }`}>
                  {agent.status}
                </span>
              </div>
            </div>

            <button
              onClick={fetchAgentData}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-6 bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total P&L</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USDC
            </div>
            <div className={`text-xs ${totalPnlPercentage >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalPnlPercentage >= 0 ? '+' : ''}{totalPnlPercentage.toFixed(2)}%
            </div>
          </div>

          <div className="p-6 bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">APR (30d)</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">
              {agent.apr30d ? `${agent.apr30d.toFixed(2)}%` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground">Last 30 days</div>
          </div>

          <div className="p-6 bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Sharpe Ratio</span>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">
              {agent.sharpe30d ? agent.sharpe30d.toFixed(2) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground">Risk-adjusted return</div>
          </div>

          <div className="p-6 bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Open Positions</span>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{positionSummary.openCount}</div>
            <div className="text-xs text-muted-foreground">{positionSummary.closedCount} closed</div>
          </div>
        </div>

        {/* Deployment Configuration */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center">
                <Activity className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <div>
                <p className="data-label mb-1">AGENT SETTINGS</p>
                <h2 className="font-display text-xl">Deployment Configuration</h2>
              </div>
            </div>
            <button
              onClick={() => deploymentEditOpen ? setDeploymentEditOpen(false) : setDeploymentEditOpen(true)}
              disabled={deploymentLoading}
              className={`px-4 py-2 border font-bold transition-colors ${
                deploymentEditOpen
                  ? 'border-[var(--text-muted)] text-[var(--text-muted)]'
                  : 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10'
              }`}
            >
              {deploymentEditOpen ? 'CANCEL' : 'EDIT SETTINGS'}
            </button>
          </div>

          {deploymentLoading ? (
            <div className="border border-[var(--border)] bg-[var(--bg-deep)] p-6 rounded">
              <div className="flex items-center justify-center gap-2">
                <Activity className="h-5 w-5 text-[var(--accent)] animate-spin" />
                Loading deployment configuration...
              </div>
            </div>
          ) : deployment ? (
            <div className="border border-[var(--border)] bg-[var(--bg-deep)] p-6 rounded">
              {deploymentEditOpen ? (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="border border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">SUBSCRIPTION STATUS</p>
                        <span className={`text-[10px] px-2 py-1 border font-bold rounded ${
                          deploymentForm?.subActive 
                            ? 'border-[var(--accent)] text-[var(--accent)]'
                            : 'border-[var(--text-muted)] text-[var(--text-muted)]'
                        }`}>
                          {deploymentForm?.subActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 mt-2">
                        <input
                          type="checkbox"
                          id="subActive"
                          checked={deploymentForm?.subActive || false}
                          onChange={(e) => setDeploymentForm({
                            ...deploymentForm!,
                            subActive: e.target.checked
                          })}
                          className="deployment-checkbox"
                        />
                        <label htmlFor="subActive" className="text-sm text-[var(--text-secondary)]">
                          Enable trading for this agent
                        </label>
                      </div>
                    </div>
                    
                    <div className="border border-[var(--border)] p-4 space-y-3">
                      <p className="text-sm font-bold text-[var(--text-primary)]">ENABLED VENUES</p>
                      <div className="space-y-3">
                        {['HYPERLIQUID', 'GMX', 'OSTIUM', 'SPOT', 'MULTI'].map((venue) => (
                          <div key={venue} className={`flex items-center space-x-3 ${
                            venue === 'OSTIUM' ? '' : 'opacity-50'
                          }`}>
                            <input
                              type="checkbox"
                              id={`venue-${venue}`}
                              checked={deploymentForm?.enabledVenues.includes(venue) || false}
                              disabled={venue !== 'OSTIUM'}
                              onChange={(e) => {
                                const venues = deploymentForm?.enabledVenues || [];
                                if (e.target.checked) {
                                  setDeploymentForm({
                                    ...deploymentForm!,
                                    enabledVenues: [...venues, venue]
                                  });
                                } else {
                                  setDeploymentForm({
                                    ...deploymentForm!,
                                    enabledVenues: venues.filter(v => v !== venue)
                                  });
                                }
                              }}
                              className="deployment-checkbox"
                            />
                            <label 
                              htmlFor={`venue-${venue}`} 
                              className={`text-sm ${
                                venue === 'OSTIUM' 
                                  ? 'text-[var(--text-primary)]' 
                                  : 'text-[var(--text-muted)]'
                              }`}
                            >
                              {venue}
                              {venue === 'OSTIUM' && (
                                <span className="ml-2 text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                                  ACTIVE
                                </span>
                              )}
                            </label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-2">
                        Only Ostium is available for this deployment. Other venues are disabled.
                      </p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="border border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">RISK TOLERANCE</p>
                        <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                          {deploymentForm?.riskTolerance}/100
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={deploymentForm?.riskTolerance || 50}
                          onChange={(e) => setDeploymentForm({
                            ...deploymentForm!,
                            riskTolerance: parseInt(e.target.value)
                          })}
                          className="deployment-range"
                        />
                        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                          <span>CONSERVATIVE</span>
                          <span>AGGRESSIVE</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">TRADE FREQUENCY</p>
                        <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                          {deploymentForm?.tradeFrequency}/100
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={deploymentForm?.tradeFrequency || 50}
                          onChange={(e) => setDeploymentForm({
                            ...deploymentForm!,
                            tradeFrequency: parseInt(e.target.value)
                          })}
                          className="deployment-range"
                        />
                        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                          <span>LOW</span>
                          <span>HIGH</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">SOCIAL SENTIMENT WEIGHT</p>
                        <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                          {deploymentForm?.socialSentimentWeight}/100
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={deploymentForm?.socialSentimentWeight || 50}
                          onChange={(e) => setDeploymentForm({
                            ...deploymentForm!,
                            socialSentimentWeight: parseInt(e.target.value)
                          })}
                          className="deployment-range"
                        />
                        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                          <span>LOW</span>
                          <span>HIGH</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">PRICE MOMENTUM FOCUS</p>
                        <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                          {deploymentForm?.priceMomentumFocus}/100
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={deploymentForm?.priceMomentumFocus || 50}
                          onChange={(e) => setDeploymentForm({
                            ...deploymentForm!,
                            priceMomentumFocus: parseInt(e.target.value)
                          })}
                          className="deployment-range"
                        />
                        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                          <span>LOW</span>
                          <span>HIGH</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">MARKET RANK PRIORITY</p>
                        <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                          {deploymentForm?.marketRankPriority}/100
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={deploymentForm?.marketRankPriority || 50}
                          onChange={(e) => setDeploymentForm({
                            ...deploymentForm!,
                            marketRankPriority: parseInt(e.target.value)
                          })}
                          className="deployment-range"
                        />
                        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                          <span>LOW</span>
                          <span>HIGH</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setDeploymentEditOpen(false)}
                      className="px-4 py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveDeployment}
                      disabled={deploymentSaving}
                      className="px-4 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {deploymentSaving ? (
                        <>
                          <Activity className="w-5 h-5 animate-pulse" />
                          SAVING...
                        </>
                      ) : (
                        'SAVE CONFIGURATION'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {deployment.subActive ? (
                    <div className="border border-[var(--border)]/60 bg-[var(--accent)]/5 p-4">
                      <p className="text-sm font-bold text-[var(--accent)] mb-1">DEPLOYMENT ACTIVE</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Your agent is currently deployed and trading on Ostium. Adjust settings below to modify trading behavior.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-[var(--border)]/60 bg-[var(--text-muted)]/10 p-4">
                      <p className="text-sm font-bold text-[var(--text-muted)] mb-1">DEPLOYMENT INACTIVE</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Your agent deployment is currently inactive. Enable the subscription to start trading.
                      </p>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="border border-[var(--border)] p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">SUBSCRIPTION STATUS</p>
                        <span className={`text-[10px] px-2 py-1 border font-bold rounded ${
                          deployment.subActive 
                            ? 'border-[var(--accent)] text-[var(--accent)]'
                            : 'border-[var(--text-muted)] text-[var(--text-muted)]'
                        }`}>
                          {deployment.subActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">ENABLED VENUES</p>
                        <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                          {deployment.enabledVenues.includes('OSTIUM') ? 'OSTIUM' : 'NONE'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-[var(--border)] p-4">
                        <p className="text-xs text-[var(--text-muted)] mb-1">RISK TOLERANCE</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{deployment.riskTolerance}/100</p>
                      </div>

                      <div className="border border-[var(--border)] p-4">
                        <p className="text-xs text-[var(--text-muted)] mb-1">TRADE FREQUENCY</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{deployment.tradeFrequency}/100</p>
                      </div>

                      <div className="border border-[var(--border)] p-4">
                        <p className="text-xs text-[var(--text-muted)] mb-1">SOCIAL SENTIMENT</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{deployment.socialSentimentWeight}/100</p>
                      </div>

                      <div className="border border-[var(--border)] p-4">
                        <p className="text-xs text-[var(--text-muted)] mb-1">PRICE MOMENTUM</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{deployment.priceMomentumFocus}/100</p>
                      </div>

                      <div className="border border-[var(--border)] p-4">
                        <p className="text-xs text-[var(--text-muted)] mb-1">MARKET RANK</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{deployment.marketRankPriority}/100</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border border-[var(--border)] bg-[var(--bg-deep)] p-6 text-center rounded">
              <p className="text-[var(--text-muted)]">No deployment configuration found for this agent.</p>
            </div>
          )}
        </div>

        {/* Positions */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Positions</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full md:w-auto">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Symbol</label>
                <input
                  value={positionFilters.symbol}
                  onChange={(e) => setPositionFilters({ ...positionFilters, symbol: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background"
                  placeholder="e.g. ETH"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Status</label>
                <select
                  value={positionFilters.status}
                  onChange={(e) => setPositionFilters({ ...positionFilters, status: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background"
                >
                  <option value="ALL">All</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Side</label>
                <select
                  value={positionFilters.side}
                  onChange={(e) => setPositionFilters({ ...positionFilters, side: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background"
                >
                  <option value="ALL">All</option>
                  <option value="LONG">Long</option>
                  <option value="SHORT">Short</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Venue</label>
                <select
                  value={positionFilters.venue}
                  onChange={(e) => setPositionFilters({ ...positionFilters, venue: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background"
                >
                  <option value="ALL">All</option>
                  <option value="HYPERLIQUID">Hyperliquid</option>
                  <option value="GMX">GMX</option>
                  <option value="OSTIUM">Ostium</option>
                  <option value="SPOT">Spot</option>
                  <option value="MULTI">Multi</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Symbol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Venue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Side</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Entry / Exit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Size</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">P&L</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Opened</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positionsLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading positions...
                      </div>
                    </td>
                  </tr>
                ) : positions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                      No positions match the current filters
                    </td>
                  </tr>
                ) : (
                  positions.map((position) => (
                    <tr key={position.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{position.tokenSymbol}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{position.venue}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${position.side === 'LONG' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                          {position.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        ${position.entryPrice.toFixed(2)}{position.exitPrice ? ` → ${position.exitPrice.toFixed(2)}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">${position.size.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className={`font-mono text-sm ${position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(2)} USDC
                        </div>
                        <div className={`text-xs ${position.pnlPercentage >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {position.pnlPercentage >= 0 ? '+' : ''}{position.pnlPercentage.toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${position.status === 'OPEN' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-foreground'}`}>
                          {position.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                        {new Date(position.openedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                        {position.closedAt ? new Date(position.closedAt).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <PaginationControls
              page={positionsMeta.page}
              pageSize={positionsMeta.pageSize}
              total={positionsMeta.total}
              loading={positionsLoading}
              onPageChange={(nextPage) => fetchPositions(nextPage)}
            />
          </div>
        </div>

        {/* Recent Signals */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Recent Signals</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full md:w-auto">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Symbol</label>
                <input
                  value={signalFilters.tokenSymbol}
                  onChange={(e) => setSignalFilters({ ...signalFilters, tokenSymbol: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background"
                  placeholder="e.g. ETH"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Side</label>
                <select
                  value={signalFilters.side}
                  onChange={(e) => setSignalFilters({ ...signalFilters, side: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background"
                >
                  <option value="ALL">All</option>
                  <option value="LONG">Long</option>
                  <option value="SHORT">Short</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Venue</label>
                <select
                  value={signalFilters.venue}
                  onChange={(e) => setSignalFilters({ ...signalFilters, venue: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background"
                >
                  <option value="ALL">All</option>
                  <option value="OSTIUM">Ostium</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Symbol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Venue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Side</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Proof</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Executor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Bucket (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {signalsLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading signals...
                      </div>
                    </td>
                  </tr>
                ) : signals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                      No signals found for this agent
                    </td>
                  </tr>
                ) : (
                  signals.map((signal) => (
                    <tr key={signal.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{signal.token_symbol}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{signal.venue}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${signal.side === 'LONG' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                          {signal.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {signal.lunarcrush_score !== undefined && signal.lunarcrush_score !== null
                          ? (signal.lunarcrush_score * 100).toFixed(0) + '%'
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${signal.proof_verified ? 'bg-green-500/10 text-green-500' : 'bg-muted text-foreground'}`}>
                          {signal.proof_verified ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${signal.executor_agreement_verified ? 'bg-green-500/10 text-green-500' : 'bg-muted text-foreground'}`}>
                          {signal.executor_agreement_verified ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                        {new Date(signal.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                        {signal.bucket6h ? new Date(signal.bucket6h).toISOString().slice(0, 16).replace('T', ' ') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <PaginationControls
              page={signalsMeta.page}
              pageSize={signalsMeta.pageSize}
              total={signalsMeta.total}
              loading={signalsLoading}
              onPageChange={(nextPage) => fetchSignals(nextPage)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

