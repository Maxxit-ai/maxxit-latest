import { useEffect, useState } from 'react';

interface Stats {
  tradingVolume: string;
  alphaSources: number;
  tradingPairs: number;
  uptime: string;
}

const StatsSection = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const displayStats = [
    {
      label: 'TRADING VOLUME',
      value: loading ? '...' : (stats?.tradingVolume || '$0'),
      sub: 'ALL TIME'
    },
    {
      label: 'ALPHA SOURCES',
      value: loading ? '...' : String(stats?.alphaSources || 0),
      sub: 'CURATED'
    },
    {
      label: 'TRADING PAIRS',
      value: loading ? '...' : String(stats?.tradingPairs || 0),
      sub: 'ACROSS VENUES'
    },
    {
      label: 'UPTIME',
      value: stats?.uptime || '99.9%',
      sub: 'RELIABILITY'
    },
  ];

  return (
    <section className="border-t-2 border-[var(--border)] bg-[var(--bg-deep)]">
      <div className="max-w-7xl mx-auto border-l-0 sm:border-l-2 border-r-0 sm:border-r-2 border-[var(--border)] grid grid-cols-2 md:grid-cols-4">
        {displayStats.map((stat, i) => (
          <div
            key={stat.label}
            className={`py-6 sm:py-8 md:py-10 px-3 sm:px-4 md:px-6 bg-[var(--bg-surface)] border-r-2 border-b-2 md:border-b-0 border-[var(--border)] last:border-r-0 md:last:border-r-0 hover:bg-accent/5 transition-colors group ${i === 0 ? 'md:border-l-0' : ''
              } ${stat.label === 'ALPHA SOURCES' ? 'border-r-0 md:border-r-2' : ''} ${(stat.label === 'UPTIME' || stat.label === 'TRADING PAIRS') ? 'border-b-0 md:border-b-2' : ''}`}
          >
            <p className="data-label mb-2 sm:mb-3">{stat.label}</p>
            <div className="mb-2 pb-2 sm:pb-3 border-b-2 border-[var(--border)]">
              <p className={`data-value text-accent text-2xl sm:text-3xl md:text-4xl group-hover:scale-105 transition-transform inline-block ${loading ? 'animate-pulse' : ''}`}>
                {stat.value}
              </p>
            </div>
            <p className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-wider">{stat.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default StatsSection;