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
    <section className="py-12 sm:py-16 md:py-20 lg:py-24 border-t-2 border-[var(--border)] bg-[var(--bg-deep)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8 sm:mb-12 md:mb-16">
          <p className="text-xs sm:text-sm text-accent mb-3 sm:mb-4 tracking-widest font-mono uppercase">THE DECENTRALIZED ECONOMY</p>
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-4 sm:mb-6 leading-tight">
            EVERYONE GETS <span className="text-accent">PAID</span>
            <br />
            FOR PERFORMANCE
          </h2>
          <div className="max-w-2xl mx-auto p-4 sm:p-6">
            <p className="text-sm sm:text-base text-[var(--text-secondary)] font-medium">
              Alpha creators earn proportional to their signal performance.
              You get institutional-grade execution. The system rewards merit.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3">
          {benefits.map((benefit, index) => (
            <div
              key={benefit.label}
              className={`p-6 sm:p-8 bg-[var(--bg-surface)] border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-black last:border-b-0 md:last:border-r-0 hover:bg-[var(--bg-elevated)] transition-colors group`}
            >
              <div className="mb-3 sm:mb-4 pb-3 sm:pb-4">
                <p className="data-label mb-2 sm:mb-3">{benefit.label}</p>
                <p className="font-display text-3xl sm:text-4xl md:text-5xl text-accent leading-none group-hover:scale-105 transition-transform">
                  {benefit.value}
                </p>
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default EconomySection;


