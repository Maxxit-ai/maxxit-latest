import Link from 'next/link';
import { AgentSummary } from './types';
import { useState } from 'react';
import { ArrowRight, Zap } from 'lucide-react';

interface AgentsSectionProps {
  agents: AgentSummary[];
  loading: boolean;
  error: string | null;
  onCardClick: (agent: AgentSummary) => void;
  onDeployClick: (agent: AgentSummary) => void;
}

const AgentsSection = ({ agents, loading, error, onCardClick, onDeployClick }: AgentsSectionProps) => {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  return (
    <section id="agents" className="py-24 border-t-2 border-[var(--border)] bg-[var(--bg-deep)]">
      <style jsx>{`
        @keyframes borderScan {
          0% {
            clip-path: polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%);
          }
          25% {
            clip-path: polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%);
          }
          50% {
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 100% 100%);
          }
          75% {
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
          }
          100% {
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
          }
        }

        @keyframes fillUp {
          0% {
            transform: translateY(100%) scaleY(0.8);
            opacity: 0.9;
          }
          50% {
            transform: translateY(50%) scaleY(1);
            opacity: 1;
          }
          100% {
            transform: translateY(0%) scaleY(1);
            opacity: 1;
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%) translateY(-50%) skewX(-20deg);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(300%) translateY(-50%) skewX(-20deg);
            opacity: 0;
          }
        }

        @keyframes borderPulse {
          0%, 100% {
            border-color: var(--accent);
            box-shadow: 0 0 0 0 rgba(0, 255, 136, 0);
          }
          50% {
            border-color: var(--accent-dim);
            box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.1);
          }
        }

        @keyframes cardEnter {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .card-enter {
          animation: cardEnter 0.6s ease-out forwards;
          opacity: 0;
        }

        .border-scan {
          position: relative;
        }

        .border-scan::before {
          content: '';
          position: absolute;
          inset: -2px;
          border: 2px solid var(--accent);
          clip-path: polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%);
          pointer-events: none;
        }

        .border-scan:hover::before {
          animation: borderScan 1.5s ease-in-out forwards;
        }

        .button-animated {
          position: relative;
          overflow: hidden;
          background: var(--bg-elevated);
          isolation: isolate;
          transition: border-color 0.3s ease, color 0.3s ease 0.15s;
        }

        .button-animated::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 100%;
          background: linear-gradient(
            180deg,
            var(--accent-dim) 0%,
            var(--accent) 50%,
            var(--accent-dim) 100%
          );
          transform: translateY(100%) scaleY(0.8);
          transform-origin: bottom;
          transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 0;
        }

        .button-animated::after {
          content: '';
          position: absolute;
          top: 50%;
          left: -50%;
          width: 50%;
          height: 200%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.4) 50%,
            transparent 100%
          );
          transform: translateX(-100%) translateY(-50%) skewX(-25deg);
          z-index: 1;
          pointer-events: none;
        }

        .button-animated:hover::before {
          transform: translateY(0%) scaleY(1);
        }

        .button-animated:hover::after {
          animation: shimmer 0.8s ease-out 0.2s;
        }

        .button-animated:hover {
          border-color: var(--accent);
          color: var(--bg-deep);
        }

        .button-animated:active {
          transform: scale(0.98);
        }

        .button-animated > * {
          position: relative;
          z-index: 2;
          transition: transform 0.3s ease;
        }

        .button-animated:hover > * {
          transform: scale(1.02);
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-8 border-b-2 border-[var(--border)]">
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
            <div className="border-2 border-[var(--border)] px-4 py-2 bg-[var(--bg-surface)]">
              <span className="text-sm text-[var(--text-muted)] font-mono">
                {!loading && `${agents.length} AVAILABLE`}
              </span>
            </div>
            <Link href="/create-agent">
              <button className="group px-4 py-2 border-2 border-[var(--border)] bg-[var(--bg-surface)] text-sm font-bold hover:border-accent hover:text-accent hover:bg-accent/5 transition-all flex items-center gap-2">
                <Zap className="group-hover:rotate-12 transition-transform" size={14} />
                CREATE AGENT
              </button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-2 border-[var(--border)] p-8 bg-[var(--bg-surface)] animate-pulse">
                <div className="h-6 w-3/4 bg-[var(--border)] mb-4" />
                <div className="h-4 w-1/2 bg-[var(--border)] mb-8" />
                <div className="h-16 w-1/3 bg-[var(--border)]" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="border-2 border-[var(--danger)] p-12 text-center bg-[var(--bg-surface)]">
            <p className="text-[var(--danger)] mb-4 font-mono font-bold">ERROR: {error}</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="border-2 border-[var(--border)] p-16 text-center bg-[var(--bg-surface)]">
            <p className="font-display text-3xl mb-4">NO AGENTS YET</p>
            <p className="text-[var(--text-secondary)] mb-8">Be the first to deploy</p>
            <Link href="/create-agent">
              <button className="px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold border-2 border-accent hover:bg-[var(--bg-deep)] hover:text-accent transition-all">
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
                onMouseEnter={() => setHoveredCard(agent.id)}
                onMouseLeave={() => setHoveredCard(null)}
                className="border-scan flex flex-col justify-between border-2 border-[var(--border)] p-6 cursor-pointer bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all group card-enter"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-display text-xl group-hover:text-accent transition-colors mb-2">
                        {agent.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        {agent.venue === 'MULTI' ? (
                          <span className="text-xs px-2 py-1 border-2 border-accent text-accent bg-accent/10 font-bold">
                            MULTI-VENUE
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)] font-mono uppercase">
                            {agent.venue}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="border-2 border-[var(--border)] px-2 py-1 bg-[var(--bg-elevated)]">
                      <span className="text-[var(--text-muted)] text-xs font-mono font-bold">
                        #{String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                  </div>

                  <div className="mb-6 pb-4">
                    <p className="data-label mb-2">30D RETURN</p>
                    <p
                      className={`data-value text-4xl font-display leading-none ${agent.apr30d && agent.apr30d > 0
                        ? 'text-accent'
                        : agent.apr30d && agent.apr30d < 0
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--text-muted)]'
                        }`}
                    >
                      {agent.apr30d != null
                        ? `${agent.apr30d > 0 ? '+' : ''}${agent.apr30d.toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>

                  {agent.sharpe30d != null && (
                    <div className="flex justify-between items-center text-sm mb-4 pb-3">
                      <span className="text-[var(--text-muted)] font-mono uppercase text-xs">Sharpe</span>
                      <span className="font-mono font-bold text-accent">{agent.sharpe30d.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-[var(--border)]">
                  <button
                    onMouseEnter={() => setHoveredButton(agent.id)}
                    onMouseLeave={() => setHoveredButton(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeployClick(agent);
                    }}
                    className="button-animated w-full py-3 border-2 border-[var(--border)] text-sm font-bold bg-[var(--bg-elevated)] flex items-center justify-center gap-2 group/btn relative"
                  >
                    <span className="relative z-10 font-bold">DEPLOY</span>
                    <ArrowRight
                      className={`relative z-10 transition-transform ${hoveredButton === agent.id ? 'translate-x-1' : ''
                        }`}
                      size={16}
                    />
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


