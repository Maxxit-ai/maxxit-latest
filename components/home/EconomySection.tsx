const EconomySection = () => {
  const benefits = [
    {
      label: 'ALPHA CREATORS',
      value: 'EARN %',
      description: 'Research institutes, CT influencers, and Telegram channels receive profit share based on signal performance.',
    },
    {
      label: 'RETAIL TRADERS',
      value: '24/7',
      description: 'Deploy once, trade forever. Your agent consumes best-in-class alpha and executes while you sleep.',
    },
    {
      label: 'EXECUTION',
      value: 'GASLESS',
      description: 'Non-custodial, gasless execution. No hidden costs, complete transparency.',
    },
  ];

  return (
    <section className="py-24 border-t-2 border-[var(--border)] bg-[var(--bg-deep)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm text-accent mb-4 tracking-widest font-mono uppercase">THE DECENTRALIZED ECONOMY</p>
          <h2 className="font-display text-4xl md:text-5xl mb-6 leading-tight">
            EVERYONE GETS <span className="text-accent">PAID</span>
            <br />
            FOR PERFORMANCE
          </h2>
          <div className="max-w-2xl mx-auto p-6">
            <p className="text-base text-[var(--text-secondary)] font-medium">
              Alpha creators earn proportional to their signal performance.
              You get institutional-grade execution. The system rewards merit.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3">
          {benefits.map((benefit, index) => (
            <div
              key={benefit.label}
              className={`p-8 bg-[var(--bg-surface)] border-r-2 border-black last:border-r-0 hover:bg-[var(--bg-elevated)] transition-colors group`}
            >
              <div className="mb-4 pb-4">
                <p className="data-label mb-3">{benefit.label}</p>
                <p className="font-display text-4xl md:text-5xl text-accent leading-none group-hover:scale-105 transition-transform">
                  {benefit.value}
                </p>
              </div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default EconomySection;


