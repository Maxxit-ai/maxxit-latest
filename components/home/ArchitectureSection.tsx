import { ArrowBigDown } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';

interface ArchitectureSectionProps {
  activeAgent: string | null;
  onHover: (id: string | null) => void;
}

const ArchitectureSection = ({ activeAgent, onHover }: ArchitectureSectionProps) => {
  const [animationStep, setAnimationStep] = useState(0);
  const [progress, setProgress] = useState(0);

  // Animation steps: 0=sources, 1=agent-what, 2=agent-how, 3=agent-where, 4=executed
  const animationSteps = ['sources', 'agent-what', 'agent-how', 'agent-where', 'executed'];
  const stepDuration = 2500; // 2.5 seconds per step

  useEffect(() => {
    // Progress bar animation - resets with each step
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const increment = 100 / (stepDuration / 50); // Calculate increment to reach 100% in stepDuration
        if (prev >= 100) return 0;
        return Math.min(100, prev + increment);
      });
    }, 50);

    // Step animation
    const stepInterval = setInterval(() => {
      setAnimationStep((prev) => {
        const next = (prev + 1) % animationSteps.length;
        setProgress(0); // Reset progress at each step change
        return next;
      });
    }, stepDuration);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
    };
  }, [stepDuration, animationSteps.length]);
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
                  className={`border-2 border-[var(--border)] bg-[var(--bg-surface)] p-8 transition-all duration-300 ${activeAgent === agent.id
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
                    className={`h-0.5 mb-4 transition-all duration-500 ${activeAgent === agent.id ? 'w-full bg-[var(--accent)]' : 'w-12 bg-[var(--border)]'
                      }`}
                  ></div>
                  <p className="text-sm leading-relaxed opacity-70">{agent.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center">
            <div className="w-full border-2 border-[var(--border)] bg-[var(--bg-surface)] p-8 shadow-[8px_8px_0px_0px_var(--border)]">
              <div className="flex items-center justify-between mb-8">
                <p className="text-xs tracking-[0.2em] font-mono opacity-60">SIGNAL FLOW</p>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1 bg-[var(--bg-elevated)] border border-[var(--border)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-100 ease-linear"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {Math.round(progress)}%
                  </span>
                </div>
              </div>

              <div className="space-y-6">
                {/* SOURCES */}
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    {['CT', 'TG', 'RI'].map((source, idx) => (
                      <div
                        key={source}
                        className={`w-12 h-12 border-2 flex items-center justify-center text-xs font-bold transition-all duration-500 relative ${animationStep === 0
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-deep)] shadow-[0_0_20px_var(--accent-glow)]'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--accent)] hover:text-[var(--bg-deep)]'
                          }`}
                        style={{
                          animationDelay: `${idx * 200}ms`,
                        }}
                      >
                        {source}
                        {animationStep === 0 && (
                          <div className="absolute inset-0 border-2 border-[var(--accent)] animate-ping opacity-75"></div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 relative h-0.5 bg-[var(--border)] opacity-40 overflow-hidden">
                    <div
                      className={`absolute inset-0 h-full transition-all duration-500 ${animationStep >= 1 ? 'bg-[var(--accent)] opacity-100' : 'bg-[var(--border)] opacity-0'
                        }`}
                      style={{
                        width: animationStep >= 1 ? '100%' : '0%',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">SOURCES</span>
                </div>

                <div className="flex justify-center">
                  <ArrowBigDown
                    className={`transition-all duration-500 ${animationStep === 1 ? 'text-[var(--accent)] animate-bounce' : 'text-[var(--accent)] opacity-50'
                      }`}
                    size={32}
                  />
                </div>

                {/* AGENT WHAT */}
                <div className={`border-2 p-5 relative overflow-hidden transition-all duration-500 ${animationStep === 1
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-deep)] shadow-[0_0_30px_var(--accent-glow)] scale-[1.02]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] group hover:bg-[var(--accent)] hover:text-[var(--bg-deep)]'
                  }`}>
                  {animationStep === 1 && (
                    <div className="absolute inset-0 bg-[var(--accent)] opacity-20 animate-pulse"></div>
                  )}
                  <div className={`absolute top-0 right-0 w-16 h-16 border-l-2 border-b-2 transition-colors duration-500 ${animationStep === 1 ? 'border-[var(--bg-deep)]' : 'border-[var(--border)] group-hover:border-[var(--bg-deep)]'
                    }`}></div>
                  <div className="relative">
                    <p className={`text-xs font-mono mb-2 transition-colors duration-500 ${animationStep === 1 ? 'text-[var(--bg-deep)] opacity-100' : 'text-[var(--text-muted)] group-hover:text-[var(--bg-deep)] group-hover:opacity-100'
                      }`}>
                      AGENT WHAT
                    </p>
                    <p className="text-xl font-bold mb-2">SIGNAL: LONG BTC</p>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-2 h-4 border transition-all duration-500 ${animationStep === 1
                              ? `border-[var(--bg-deep)] bg-[var(--bg-deep)] ${i < 9 ? 'animate-[fillBar_0.5s_ease-in_forwards]' : ''
                              }`
                              : `border-[var(--border)] ${i < 9 ? 'bg-[var(--accent-dim)] group-hover:bg-[var(--bg-deep)]' : 'bg-transparent'
                              } group-hover:border-[var(--bg-deep)]`
                              }`}
                            style={{
                              animationDelay: `${i * 50}ms`,
                            }}
                          ></div>
                        ))}
                      </div>
                      <span className={`text-xs transition-colors duration-500 ${animationStep === 1 ? 'text-[var(--bg-deep)]' : 'text-[var(--text-muted)] group-hover:text-[var(--bg-deep)]'
                        }`}>87%</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowBigDown
                    className={`transition-all duration-500 ${animationStep === 2 ? 'text-[var(--accent)] animate-bounce' : 'text-[var(--accent)] opacity-50'
                      }`}
                    size={32}
                  />
                </div>

                {/* AGENT HOW */}
                <div className={`border-2 p-5 relative overflow-hidden transition-all duration-500 ${animationStep === 2
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-deep)] shadow-[0_0_30px_var(--accent-glow)] scale-[1.02]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)]'
                  }`}>
                  {animationStep === 2 && (
                    <div className="absolute inset-0 bg-[var(--accent)] opacity-20 animate-pulse"></div>
                  )}
                  <div className="relative">
                    <p className={`text-xs font-mono mb-4 text-center transition-colors duration-500 ${animationStep === 2 ? 'text-[var(--bg-deep)]' : 'text-[var(--text-muted)]'
                      }`}>AGENT HOW</p>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: 'SIZE', value: '5%' },
                        { label: 'LEVERAGE', value: '3x' },
                        { label: 'STOP', value: '-5%' },
                      ].map((param, idx) => (
                        <div
                          key={param.label}
                          className={`text-center border-l-2 first:border-l-0 px-2 transition-all duration-500 ${animationStep === 2
                            ? 'border-[var(--bg-deep)] animate-[slideIn_0.3s_ease-out_forwards]'
                            : 'border-[var(--border)]'
                            }`}
                          style={{
                            animationDelay: `${idx * 100}ms`,
                          }}
                        >
                          <p className={`text-xs mb-1 transition-colors duration-500 ${animationStep === 2 ? 'text-[var(--bg-deep)]' : 'text-[var(--text-muted)]'
                            }`}>{param.label}</p>
                          <p className="text-2xl font-bold">{param.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowBigDown
                    className={`transition-all duration-500 ${animationStep === 3 ? 'text-[var(--accent)] animate-bounce' : 'text-[var(--accent)] opacity-50'
                      }`}
                    size={32}
                  />
                </div>

                {/* AGENT WHERE */}
                <div className={`border-2 p-5 text-center relative overflow-hidden transition-all duration-500 ${animationStep === 3
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-deep)] shadow-[0_0_30px_var(--accent-glow)] scale-[1.02]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)]'
                  }`}>
                  {animationStep === 3 && (
                    <div className="absolute inset-0 bg-[var(--accent)] opacity-20 animate-pulse"></div>
                  )}
                  <div className={`absolute inset-0 transition-opacity duration-500 ${animationStep === 3
                    ? 'opacity-0'
                    : 'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,255,136,0.05)_10px,rgba(0,255,136,0.05)_20px)]'
                    }`}></div>
                  <div className="relative">
                    <p className={`text-xs font-mono mb-2 transition-colors duration-500 ${animationStep === 3 ? 'text-[var(--bg-deep)]' : 'text-[var(--text-muted)]'
                      }`}>AGENT WHERE</p>
                    <p className={`text-2xl font-bold mb-1 transition-colors duration-500 ${animationStep === 3 ? 'text-[var(--bg-deep)]' : 'text-[var(--accent)]'
                      }`}>→ OSTIUM</p>
                    <p className={`text-xs transition-colors duration-500 ${animationStep === 3 ? 'text-[var(--bg-deep)]' : 'text-[var(--text-muted)]'
                      }`}>Best execution for BTC-PERP</p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowBigDown
                    className={`transition-all duration-500 ${animationStep === 4 ? 'text-[var(--accent)] animate-bounce' : 'text-[var(--accent)] opacity-50'
                      }`}
                    size={32}
                  />
                </div>

                {/* EXECUTED */}
                <div className={`border-2 p-5 text-center relative overflow-hidden transition-all duration-500 ${animationStep === 4
                  ? 'bg-[var(--accent)] text-[var(--bg-deep)] border-[var(--accent-dim)] shadow-[0_0_40px_var(--accent-glow)]'
                  : 'bg-[var(--accent)] text-[var(--bg-deep)] border-[var(--accent-dim)]'
                  }`}>
                  <div className={`absolute top-0 left-0 w-full h-1 bg-[var(--bg-deep)] transition-opacity duration-500 ${animationStep === 4 ? 'animate-[slideRight_2s_ease-in-out_infinite]' : 'opacity-50'
                    }`}></div>
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
          
          @keyframes fillBar {
            0% { 
              background-color: transparent;
              transform: scaleY(0);
            }
            100% { 
              background-color: var(--bg-deep);
              transform: scaleY(1);
            }
          }
          
          @keyframes slideIn {
            0% {
              opacity: 0;
              transform: translateY(-10px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          @keyframes pulseGlow {
            0%, 100% {
              box-shadow: 0 0 20px var(--accent-glow);
            }
            50% {
              box-shadow: 0 0 40px var(--accent-glow), 0 0 60px var(--accent-glow);
            }
          }
        `}</style>
      </div>
    </section>
  );
};

export default ArchitectureSection;


