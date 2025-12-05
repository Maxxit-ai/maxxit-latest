const EconomySection = () => (
  <section className="py-24 border-t border-[var(--border)] bg-[var(--bg-deep)]">
    <div className="max-w-7xl mx-auto px-6">
      <div className="text-center mb-16">
        <p className="text-sm text-accent mb-4 tracking-widest font-mono">THE DECENTRALIZED ECONOMY</p>
        <h2 className="font-display text-4xl md:text-5xl mb-6">
          EVERYONE GETS <span className="text-accent">PAID</span><br />
          FOR PERFORMANCE
        </h2>
        <p className="font-serif text-lg text-[var(--text-secondary)] max-w-2xl mx-auto italic">
          Alpha creators earn proportional to their signal performance.
          You get institutional-grade execution. The system rewards merit.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-px bg-[var(--border)]">
        <div className="bg-[var(--bg-surface)] p-8">
          <p className="data-label mb-2">ALPHA CREATORS</p>
          <p className="font-display text-3xl text-accent mb-4">EARN %</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Research institutes, CT influencers, and Telegram channels
            receive profit share based on signal performance.
          </p>
        </div>
        <div className="bg-[var(--bg-surface)] p-8">
          <p className="data-label mb-2">RETAIL TRADERS</p>
          <p className="font-display text-3xl text-accent mb-4">24/7</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Deploy once, trade forever. Your agent consumes best-in-class
            alpha and executes while you sleep.
          </p>
        </div>
        <div className="bg-[var(--bg-surface)] p-8">
          <p className="data-label mb-2">EXECUTION</p>
          <p className="font-display text-3xl text-accent mb-4">GASLESS</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Non-custodial, gasless execution.
            No hidden costs, complete transparency.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default EconomySection;


