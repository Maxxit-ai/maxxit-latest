import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { TrendingUp, TrendingDown, Activity, DollarSign, Target, Clock, AlertCircle, Loader2, ArrowLeft } from "lucide-react";

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
  agentId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  pnl: number;
  pnlPercentage: number;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
}

interface Signal {
  id: string;
  agentId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  confidence: number;
  status: string;
  createdAt: string;
}

export default function AgentDashboard() {
  const router = useRouter();
  const { id: agentId } = router.query;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (agentId) {
      fetchAgentData();
    }
  }, [agentId]);

  const fetchAgentData = async () => {
    setLoading(true);
    setError("");

    try {
      // Fetch agent details
      const agentRes = await fetch(`/api/agents/${agentId}`);
      if (!agentRes.ok) throw new Error('Failed to fetch agent');
      const agentData = await agentRes.json();
      setAgent(agentData); // API returns single object, not array

      // Fetch positions
      // Note: You'll need to create this API endpoint
      try {
        const positionsRes = await fetch(`/api/agents/${agentId}/positions`);
        if (positionsRes.ok) {
          const positionsData = await positionsRes.json();
          setPositions(positionsData);
        }
      } catch (e) {
        console.log('Positions not available');
      }

      // Fetch recent signals
      try {
        const signalsRes = await fetch(`/api/signals?agentId=${agentId}&limit=10`);
        if (signalsRes.ok) {
          const signalsData = await signalsRes.json();
          setSignals(signalsData);
        }
      } catch (e) {
        console.log('Signals not available');
      }

      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load agent data');
      setLoading(false);
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

  const openPositions = positions.filter(p => p.status === 'OPEN');
  const closedPositions = positions.filter(p => p.status === 'CLOSED');
  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalPnlPercentage = positions.length > 0 
    ? (totalPnl / positions.reduce((sum, p) => sum + (p.size * p.entryPrice), 0)) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/creator')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Agents
          </button>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{agent.name}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  {agent.venue}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  agent.status === 'ACTIVE' ? 'bg-green-500/10 text-green-500' :
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
            <div className="text-2xl font-bold">{openPositions.length}</div>
            <div className="text-xs text-muted-foreground">{closedPositions.length} closed</div>
          </div>
        </div>

        {/* Open Positions */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Open Positions</h2>
          {openPositions.length === 0 ? (
            <div className="p-8 bg-card border border-border rounded-lg text-center text-muted-foreground">
              No open positions
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Side</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Entry</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Current</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Size</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">P&L</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {openPositions.map((position) => (
                    <tr key={position.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{position.symbol}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          position.side === 'LONG' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {position.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">${position.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">${position.currentPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">${position.size.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className={`font-mono text-sm ${position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(2)} USDC
                        </div>
                        <div className={`text-xs ${position.pnlPercentage >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {position.pnlPercentage >= 0 ? '+' : ''}{position.pnlPercentage.toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                        {new Date(position.openedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Signals */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Recent Signals</h2>
          {signals.length === 0 ? (
            <div className="p-8 bg-card border border-border rounded-lg text-center text-muted-foreground">
              No signals generated yet
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {signals.map((signal) => (
                <div key={signal.id} className="p-4 bg-card border border-border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold">{signal.symbol}</div>
                      <div className={`text-sm ${signal.side === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>
                        {signal.side}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{(signal.confidence * 100).toFixed(0)}%</div>
                      <div className="text-xs text-muted-foreground">confidence</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className={`px-2 py-1 rounded ${
                      signal.status === 'EXECUTED' ? 'bg-green-500/10 text-green-500' :
                      signal.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500' :
                      'bg-gray-500/10 text-gray-500'
                    }`}>
                      {signal.status}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(signal.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Trade History */}
        {closedPositions.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Recent Trade History</h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Side</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Entry/Exit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Size</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">P&L</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Closed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {closedPositions.slice(0, 10).map((position) => (
                    <tr key={position.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{position.symbol}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          position.side === 'LONG' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {position.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        ${position.entryPrice.toFixed(2)} → ${position.currentPrice.toFixed(2)}
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
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                        {position.closedAt ? new Date(position.closedAt).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

