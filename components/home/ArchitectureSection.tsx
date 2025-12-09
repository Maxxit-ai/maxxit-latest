import { ArrowBigDown } from 'lucide-react';
import { useMemo } from 'react';

interface ArchitectureSectionProps {
  activeAgent: string | null;
  onHover: (id: string | null) => void;
}

const ArchitectureSection = ({ activeAgent, onHover }: ArchitectureSectionProps) => {
  const agents = useMemo(
    () => [
      {
        id: 'what',
        name: 'AGENT WHAT',
        subtitle: 'The Alpha Layer',
        description:
          'Consumes signals from curated research institutes, crypto Twitter accounts, and private Telegram channels. Uses deterministic AI to filter noise and convert high-conviction calls into executable signals. Alpha creators are ranked and paid based on realized P&L of their signals.',
      },
      {
        id: 'how',
        name: 'AGENT HOW',
        subtitle: 'Your Trading Clone',
        description:
          'A personalized AI that becomes your 24/7 trading presence. For each signal, it analyzes current market conditions, determines optimal position size, sets appropriate leverage, and manages risk parameters — all tuned to your preferences and risk tolerance.',
      },
      {
        id: 'where',
        name: 'AGENT WHERE',
        subtitle: 'Best Execution',
        description:
          'Routes each trade to the optimal venue based on liquidity, fees, and available pairs. Currently supports Hyperliquid (200+ pairs) and Ostium (61 RWA pairs including forex and commodities). Executes non-custodially through Gnosis Safe modules.',
      },
    ],
    []
  );

  return (
    <section id="architecture" className="py-24 border-t border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16">
          <p className="data-label mb-4">ARCHITECTURE</p>
          <h2 className="font-display text-4xl md:text-5xl mb-8">
            THREE AGENTS.<br />
            <span className="text-accent">ONE SYSTEM.</span>
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 mb-20">
          <div className="space-y-6">
            {agents.map((agent, index) => (
              <div
                key={agent.id}
                className="relative group cursor-pointer"
                onMouseEnter={() => onHover(agent.id)}
                onMouseLeave={() => onHover(null)}
              >
                <div
                  className={`border-2 border-[var(--border)] bg-[var(--bg-surface)] p-8 transition-all duration-300 ${
                    activeAgent === agent.id
                      ? 'translate-x-2 -translate-y-2 shadow-[8px_8px_0px_0px_var(--border)]'
                      : 'shadow-[4px_4px_0px_0px_var(--border)]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-2xl font-bold mb-1">{agent.name}</h3>
                      <p className="text-sm opacity-60">{agent.subtitle}</p>
                    </div>
                    <span className="text-4xl font-bold opacity-30 text-[var(--text-muted)]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div
                    className={`h-0.5 mb-4 transition-all duration-500 ${
                      activeAgent === agent.id ? 'w-full bg-[var(--accent)]' : 'w-12 bg-[var(--border)]'
                    }`}
                  ></div>
                  <p className="text-sm leading-relaxed opacity-70">{agent.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center">
            <div className="w-full border-2 border-[var(--border)] bg-[var(--bg-surface)] p-8 shadow-[8px_8px_0px_0px_var(--border)]">
              <p className="text-xs tracking-[0.2em] font-mono mb-8 opacity-60">SIGNAL FLOW</p>

              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    {['CT', 'TG', 'RI'].map((source) => (
                      <div
                        key={source}
                        className="w-12 h-12 border-2 border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-center text-xs font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-deep)] transition-all duration-200"
                      >
                        {source}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 h-0.5 bg-[var(--border)] opacity-40" />
                  <span className="text-xs font-mono text-[var(--text-muted)]">SOURCES</span>
                </div>

                <div className="flex justify-center">
                  <ArrowBigDown className="text-accent" size={32} />
                </div>

                <div className="border-2 border-[var(--border)] p-5 relative overflow-hidden group bg-[var(--bg-elevated)] hover:bg-[var(--accent)] hover:text-[var(--bg-deep)] transition-all duration-300">
                  <div className="absolute top-0 right-0 w-16 h-16 border-l-2 border-b-2 border-[var(--border)] group-hover:border-[var(--bg-deep)] transition-colors duration-300"></div>
                  <p className="text-xs font-mono mb-2 text-[var(--text-muted)] group-hover:text-[var(--bg-deep)] group-hover:opacity-100">
                    AGENT WHAT
                  </p>
                  <p className="text-xl font-bold mb-2">SIGNAL: LONG BTC</p>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-4 border border-[var(--border)] group-hover:border-[var(--bg-deep)] ${
                            i < 9 ? 'bg-[var(--accent-dim)] group-hover:bg-[var(--bg-deep)]' : 'bg-transparent'
                          } transition-colors duration-300`}
                        ></div>
                      ))}
                    </div>
                    <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--bg-deep)]">87%</span>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowBigDown className="text-accent" size={32} />
                </div>

                <div className="border-2 border-[var(--border)] p-5 bg-[var(--bg-elevated)]">
                  <p className="text-xs font-mono mb-4 text-[var(--text-muted)] text-center">AGENT HOW</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'SIZE', value: '5%' },
                      { label: 'LEVERAGE', value: '3x' },
                      { label: 'STOP', value: '-5%' },
                    ].map((param) => (
                      <div key={param.label} className="text-center border-l-2 border-[var(--border)] first:border-l-0 px-2">
                        <p className="text-xs text-[var(--text-muted)] mb-1">{param.label}</p>
                        <p className="text-2xl font-bold">{param.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowBigDown className="text-accent" size={32} />
                </div>

                <div className="border-2 border-[var(--border)] p-5 text-center relative overflow-hidden bg-[var(--bg-elevated)]">
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,255,136,0.05)_10px,rgba(0,255,136,0.05)_20px)]"></div>
                  <div className="relative">
                    <p className="text-xs font-mono mb-2 text-[var(--text-muted)]">AGENT WHERE</p>
                    <p className="text-2xl font-bold mb-1 text-[var(--accent)]">→ OSTIUM</p>
                    <p className="text-xs text-[var(--text-muted)]">Best execution for BTC-PERP</p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowBigDown className="text-accent" size={32} />
                </div>

                <div className="bg-[var(--accent)] text-[var(--bg-deep)] border-2 border-[var(--accent-dim)] p-5 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-[var(--bg-deep)] animate-[slideRight_2s_ease-in-out_infinite]"></div>
                  <p className="text-xs font-mono mb-2">EXECUTED</p>
                  <p className="text-2xl font-bold mb-1">POSITION OPEN</p>
                  <p className="text-xs">Non-custodial execution</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          @keyframes slideRight {
            0%, 100% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    </section>
  );
};

export default ArchitectureSection;


