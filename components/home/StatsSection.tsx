const StatsSection = () => {
  const stats = [
    { label: 'TRADING VOLUME', value: '$2.4M+', sub: 'ALL TIME' },
    { label: 'ALPHA SOURCES', value: '47', sub: 'CURATED' },
    { label: 'TRADING PAIRS', value: '261', sub: 'ACROSS VENUES' },
    { label: 'UPTIME', value: '99.9%', sub: 'RELIABILITY' },
  ];

  return (
    <section className="border-t border-[var(--border)] bg-[var(--bg-deep)]">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4">
        {stats.map((stat, i) => (
          <div key={stat.label} className={`py-10 px-6 ${i < 3 ? 'border-r border-[var(--border)]' : ''}`}>
            <p className="data-label mb-2">{stat.label}</p>
            <p className="data-value text-accent">{stat.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default StatsSection;


