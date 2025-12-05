import Link from 'next/link';

const CreateAgentSection = () => (
  <section className="py-24 border-t border-[var(--border)] bg-[var(--bg-surface)]">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <p className="data-label mb-4">CREATE YOUR AGENT</p>
          <h2 className="font-display text-4xl md:text-5xl mb-6">
            COPY TRADING,<br />
            <span className="text-accent">EVOLVED.</span>
          </h2>
          <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-6">
            Traditional copy trading copies exact trades. Maxxit copies signals and intelligence
            from traders you trust — Vitalik, research institutes, or private Telegram channels.
          </p>
          <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-8">
            Their tweets and posts become real-time signals. But you control execution: Agent HOW
            sets position size and leverage based on your risk profile. Agent WHERE routes to the
            optimal venue. You copy the intelligence, not the exact trade.
          </p>
          <Link href="/create-agent">
            <button className="px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-all">
              CREATE YOUR AGENT →
            </button>
          </Link>
        </div>

        <div className="border border-[var(--border)] p-8">
          <p className="data-label mb-6">SELECT YOUR ALPHA SOURCES</p>
          <div className="mb-6">
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Choose X accounts, Telegram channels, or research institutes whose signals you want to follow:
            </p>

            <div className="space-y-3">
              <div className="border border-accent p-4 hover:bg-accent/5 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 border-2 border-accent flex items-center justify-center font-bold text-accent">
                    X
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-display text-base text-[var(--text-primary)]">@VitalikButerin</p>
                      <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent border border-accent/30">ACTIVE</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">Ethereum co-founder • 5.2M followers</p>
                    <p className="text-xs text-[var(--text-secondary)] italic">
                      "His tweets about ETH upgrades become trading signals"
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-accent p-4 hover:bg-accent/5 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 border-2 border-accent flex items-center justify-center font-bold text-accent">
                    TG
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-display text-base text-[var(--text-primary)]">Crypto Alpha Channel</p>
                      <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent border border-accent/30">ACTIVE</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">Private Telegram • Premium signals</p>
                    <p className="text-xs text-[var(--text-secondary)] italic">
                      "Early calls on altcoins before they pump"
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-accent p-4 hover:bg-accent/5 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 border-2 border-accent flex items-center justify-center font-bold text-accent">
                    RI
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-display text-base text-[var(--text-primary)]">DeFi Research Lab</p>
                      <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent border border-accent/30">ACTIVE</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">Research Institute • Institutional-grade analysis</p>
                    <p className="text-xs text-[var(--text-secondary)] italic">
                      "Deep research reports converted to actionable signals"
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-[var(--border)] border-dashed p-4 opacity-50 hover:opacity-75 transition-opacity cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border border-[var(--text-muted)] flex items-center justify-center">
                    <span className="text-[var(--text-muted)] text-xl">+</span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">Add more sources...</p>
                </div>
              </div>
            </div>
          </div>

          <div className="py-4 border-y border-[var(--border)]">
            <div className="flex items-center justify-center gap-3 text-sm text-accent">
              <span className="text-lg">↓</span>
              <span className="font-display">Their content becomes signals</span>
              <span className="text-lg">↓</span>
            </div>
          </div>

          <div className="mt-6 bg-accent/10 border border-accent p-6">
            <p className="text-xs text-accent mb-2 font-bold">YOUR PERSONALIZED COPY TRADING SYSTEM</p>
            <p className="text-sm text-[var(--text-primary)] mb-3">
              Trades 24/7 based on signals from sources you selected
            </p>
            <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
              <span>• You control sizing</span>
              <span>• You control leverage</span>
              <span>• Best execution</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default CreateAgentSection;


