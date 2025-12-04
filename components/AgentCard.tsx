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
  const isPositive = agent.apr30d !== null && agent.apr30d > 0;
  
  return (
    <div
      onClick={onClick}
      className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-all group"
      data-testid={`card-agent-${agent.id}`}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 
            className="font-display text-xl group-hover:text-[var(--accent)] transition-colors"
            data-testid={`text-name-${agent.id}`}
          >
            {agent.name}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            {agent.venue === 'MULTI' ? (
              <Tooltip content="Automatically routes trades to the best venue">
                <span className="tag text-[var(--accent)] border-[var(--accent)] cursor-help">
                  MULTI-VENUE
                </span>
              </Tooltip>
            ) : (
              <span className="tag text-[var(--text-muted)]">{agent.venue}</span>
            )}
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="flex gap-2 mb-6 text-xs">
        <Tooltip content="$0.20 per trade, we handle gas">
          <span className="px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 cursor-help">
            GASLESS
          </span>
        </Tooltip>
        <span className="px-2 py-1 bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]">
          NON-CUSTODIAL
        </span>
      </div>

      {/* Stats */}
      <div className="space-y-3 pt-4 border-t border-[var(--border)]">
        <div>
          <p className="data-label mb-1">30D RETURN</p>
          <p 
            className={`data-value text-3xl ${isPositive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
            data-testid={`text-apr30d-${agent.id}`}
          >
            {agent.apr30d != null ? (
              <>
                {isPositive && '+'}
                {agent.apr30d.toFixed(1)}%
              </>
            ) : (
              '—'
            )}
          </p>
        </div>
        
        {agent.sharpe30d != null && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-muted)]">Sharpe Ratio</span>
            <span className="font-mono">{agent.sharpe30d.toFixed(2)}</span>
          </div>
        )}
        
        {agent.apr90d != null && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-muted)]">90D Return</span>
            <span className={`font-mono ${agent.apr90d > 0 ? 'text-[var(--accent)]' : ''}`}>
              {agent.apr90d > 0 && '+'}
              {agent.apr90d.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Hover hint */}
      <div className="mt-6 pt-4 border-t border-[var(--border)] opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-[var(--text-muted)]">CLICK TO VIEW DETAILS →</span>
      </div>
    </div>
  );
}
