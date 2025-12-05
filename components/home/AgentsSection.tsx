import Link from 'next/link';
import { AgentSummary } from './types';

interface AgentsSectionProps {
  agents: AgentSummary[];
  loading: boolean;
  error: string | null;
  onCardClick: (agent: AgentSummary) => void;
  onDeployClick: (agent: AgentSummary) => void;
}

const AgentsSection = ({ agents, loading, error, onCardClick, onDeployClick }: AgentsSectionProps) => {
  return (
    <section id="agents" className="py-24 border-t border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-8 border-b border-[var(--border)]">
          <div>
            <p className="data-label mb-4">DEPLOY NOW</p>
            <h2 className="font-display text-4xl md:text-5xl">
              LIVE <span className="text-accent">AGENTS</span>
            </h2>
            <p className="text-[var(--text-secondary)] mt-2">
              Each agent has unique alpha sources and trading strategies
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--text-muted)] font-mono">
              {!loading && `${agents.length} AVAILABLE`}
            </span>
            <Link href="/create-agent">
              <button className="px-4 py-2 border border-[var(--border)] text-sm hover:border-accent hover:text-accent transition-all">
                + CREATE AGENT
              </button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-[var(--border)] p-8 animate-pulse">
                <div className="h-6 w-3/4 bg-[var(--border)] mb-4" />
                <div className="h-4 w-1/2 bg-[var(--border)] mb-8" />
                <div className="h-16 w-1/3 bg-[var(--border)]" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="border border-[var(--border)] p-12 text-center">
            <p className="text-[var(--danger)] mb-4 font-mono">ERROR: {error}</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="border border-[var(--border)] p-16 text-center">
            <p className="font-display text-3xl mb-4">NO AGENTS YET</p>
            <p className="text-[var(--text-secondary)] mb-8">Be the first to deploy</p>
            <Link href="/create-agent">
              <button className="px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold">
                CREATE AGENT →
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent, i) => (
              <div
                key={agent.id}
                onClick={() => onCardClick(agent)}
                className="border border-[var(--border)] p-6 cursor-pointer hover:border-accent transition-colors group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display text-xl group-hover:text-accent transition-colors">
                      {agent.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                      {agent.venue === 'MULTI' ? (
                        <span className="text-xs px-2 py-0.5 border border-accent text-accent">MULTI-VENUE</span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">{agent.venue}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[var(--text-muted)] text-xs font-mono">#{String(i + 1).padStart(2, '0')}</span>
                </div>

                <div className="mb-6">
                  <p className="data-label">30D RETURN</p>
                  <p
                    className={`data-value text-3xl ${
                      agent.apr30d && agent.apr30d > 0 ? 'text-accent' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {agent.apr30d != null ? `${agent.apr30d > 0 ? '+' : ''}${agent.apr30d.toFixed(1)}%` : '—'}
                  </p>
                </div>

                {agent.sharpe30d != null && (
                  <div className="flex justify-between text-sm mb-4">
                    <span className="text-[var(--text-muted)]">Sharpe</span>
                    <span className="font-mono">{agent.sharpe30d.toFixed(2)}</span>
                  </div>
                )}

                <div className="pt-4 border-t border-[var(--border)]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeployClick(agent);
                    }}
                    className="w-full py-3 border border-[var(--border)] text-sm font-bold hover:bg-accent hover:text-[var(--bg-deep)] hover:border-accent transition-all"
                  >
                    DEPLOY →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default AgentsSection;


