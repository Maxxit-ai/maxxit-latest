import { Tooltip } from './Tooltip';

interface Agent {
  id: string;
  name: string;
  venue: string;
  apr30d: number | null;
  apr90d: number | null;
  aprSi: number | null;
  sharpe30d: number | null;
}

interface AgentCardProps {
  agent: Agent;
  onClick: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-6 cursor-pointer hover:border-primary transition-colors"
      data-testid={`card-agent-${agent.id}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-semibold text-foreground" data-testid={`text-name-${agent.id}`}>
            {agent.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {agent.venue === 'MULTI' ? (
              <Tooltip content="Agent Where: Automatically routes trades to the best available venue (Hyperliquid → Ostium)">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gradient-to-r from-primary/20 to-purple-500/20 border border-primary/30 cursor-help">
                  <span className="text-xs">🌐</span>
                  <span className="text-xs font-semibold text-foreground">Multi-Venue</span>
                  <span className="text-xs text-muted-foreground">(261 pairs)</span>
                </div>
              </Tooltip>
            ) : (
              <p className="text-sm text-muted-foreground">{agent.venue}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Tooltip content="We relay transactions and charge a flat $0.20 per trade">
            <span className="px-2 py-1 text-xs rounded-md bg-primary/20 text-primary cursor-help">
              Gasless
            </span>
          </Tooltip>
          <span className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground">
            Non-custodial
          </span>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">APR (30d)</span>
          <span className="text-lg font-bold text-primary" data-testid={`text-apr30d-${agent.id}`}>
            {agent.apr30d != null ? `${agent.apr30d.toFixed(2)}%` : 'N/A'}
          </span>
        </div>
        
        {agent.sharpe30d != null && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Sharpe Ratio</span>
            <span className="text-foreground">{agent.sharpe30d.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
