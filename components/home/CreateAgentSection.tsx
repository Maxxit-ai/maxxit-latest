import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Sparkles, Zap } from 'lucide-react';

interface AlphaSource {
  id: string;
  type: 'X' | 'TG' | 'RI';
  name: string;
  subtitle: string;
  description: string;
  followers?: string;
}

const alphaSources: AlphaSource[] = [
  {
    id: 'vitalik',
    type: 'X',
    name: '@VitalikButerin',
    subtitle: 'Ethereum co-founder • 5.2M followers',
    description: 'His tweets about ETH upgrades become trading signals',
    followers: '5.2M',
  },
  {
    id: 'crypto-alpha',
    type: 'TG',
    name: 'Crypto Alpha Channel',
    subtitle: 'Private Telegram • Premium signals',
    description: 'Early calls on altcoins before they pump',
  },
  {
    id: 'defi-lab',
    type: 'RI',
    name: 'DeFi Research Lab',
    subtitle: 'Research Institute • Institutional-grade analysis',
    description: 'Deep research reports converted to actionable signals',
  },
];

const CreateAgentSection = () => {
  const [hoveredSource, setHoveredSource] = useState<string | null>(null);

  return (
    <section className="py-24 border-t border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Left Column - Content */}
          <div className="lg:sticky lg:top-24">
            <p className="data-label mb-4">CREATE YOUR ALPHA CLUB</p>
            <h2 className="font-display text-4xl md:text-5xl mb-6 leading-tight">
              COPY TRADING,<br />
              <span className="text-accent">EVOLVED.</span>
            </h2>
            <div className="space-y-4 mb-8">
              <p className="text-[var(--text-secondary)] text-base md:text-lg leading-relaxed">
                Traditional copy trading copies exact trades. Maxxit copies signals and intelligence
                from traders you trust — Vitalik, research institutes, or private Telegram channels.
              </p>
              <p className="text-[var(--text-secondary)] text-base md:text-lg leading-relaxed">
                Their tweets and posts become real-time signals. But you control execution: Agent HOW
                sets position size and leverage based on your risk profile. Agent WHERE routes to the
                optimal venue. You copy the intelligence, not the exact trade.
              </p>
            </div>
            <Link href="/create-agent">
              <button className="group px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5">
                CREATE YOUR CLUB
                <ArrowRight className="inline-block ml-2 group-hover:translate-x-1 transition-transform" size={20} />
              </button>
            </Link>
          </div>

          {/* Right Column - Visual Example */}
          <div className="border-2 border-[var(--border)] bg-[var(--bg-elevated)] p-6 md:p-8 shadow-[8px_8px_0px_0px_var(--border)]">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="text-accent" size={18} />
              <p className="data-label">SELECT YOUR ALPHA SOURCES</p>
            </div>

            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              Choose X accounts, Telegram channels, or research institutes whose signals you want to follow:
            </p>

            <div className="space-y-3 mb-6">
              {alphaSources.map((source) => (
                <div
                  key={source.id}
                  onMouseEnter={() => setHoveredSource(source.id)}
                  onMouseLeave={() => setHoveredSource(null)}
                  className={`group relative border-2 border-accent bg-[var(--bg-surface)] p-4 transition-all duration-300`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`relative flex-shrink-0 w-12 h-12 border-2 border-accent flex items-center justify-center font-bold text-accent transition-all duration-300'
                      }`}>
                      {source.type}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="font-display text-base text-[var(--text-primary)] group-hover:text-accent transition-colors">
                          {source.name}
                        </p>
                        <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-accent/20 text-accent border border-accent/30 font-mono">
                          ACTIVE
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mb-2 leading-relaxed">
                        {source.subtitle}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] italic leading-relaxed">
                        &ldquo;{source.description}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add More Button */}
              <div className="border-2 border-[var(--border)] border-dashed bg-[var(--bg-surface)] p-4 opacity-60 hover:opacity-100 hover:border-accent transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 border-2 border-[var(--border)] group-hover:border-accent flex items-center justify-center transition-colors">
                    <span className="text-[var(--text-muted)] group-hover:text-accent text-xl font-bold transition-colors">+</span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] group-hover:text-accent font-medium transition-colors">
                    Add more sources...
                  </p>
                </div>
              </div>
            </div>

            {/* Flow Arrow */}
            <div className="py-5 border-y-2 border-[var(--border)] my-6">
              <div className="flex items-center justify-center gap-3">
                <Zap className="text-accent" size={16} />
                <span className="font-display text-sm text-accent font-bold">Their content becomes signals</span>
                <Zap className="text-accent" size={16} />
              </div>
            </div>

            {/* Result Card */}
            <div className="relative border-2 border-accent bg-accent/10 p-6 overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-accent/30 group-hover:bg-accent transition-colors" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                  <p className="text-xs text-accent font-bold tracking-wider uppercase">YOUR PERSONALIZED COPY TRADING SYSTEM</p>
                </div>
                <p className="text-sm text-[var(--text-primary)] mb-4 font-medium leading-relaxed">
                  Trades 24/7 based on signals from sources you selected
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-accent/20">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                    <span className="text-xs text-[var(--text-secondary)] font-medium">You control sizing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                    <span className="text-xs text-[var(--text-secondary)] font-medium">You control leverage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Best execution</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CreateAgentSection;