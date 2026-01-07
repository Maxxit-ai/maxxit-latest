import { useState, useEffect } from 'react';
import { Check, TrendingUp, Wallet, Search, Trophy } from 'lucide-react';

interface TopTrader {
  id: string;
  walletAddress: string;
  totalVolume: string;
  totalClosedVolume: string;
  totalPnl: string;
  totalProfitTrades: number;
  totalLossTrades: number;
  totalTrades: number;
  lastActiveAt: Date;
  edgeScore: number;
  consistencyScore: number;
  stakeScore: number;
  freshnessScore: number;
  impactFactor: number;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    agents: number;
  };
}

interface TopTradersSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TopTradersSelector({
  selectedIds,
  onChange,
}: TopTradersSelectorProps) {
  const [traders, setTraders] = useState<TopTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTopTraders();
  }, []);

  const fetchTopTraders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/top-traders?limit=10');
      const data = await response.json();

      if (data.success) {
        setTraders(data.topTraders);
      } else {
        setError('Failed to load top traders');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load top traders');
    } finally {
      setLoading(false);
    }
  };

  const toggleTrader = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const filteredTraders = traders.filter(trader => {
    const matchesSearch =
      searchQuery.trim().length === 0 ||
      trader.walletAddress.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(2)}K`;
    }
    return `$${num.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-[var(--danger)] bg-[var(--danger)]/10">
        <p className="text-[var(--danger)] text-sm">⚠️ {error}</p>
      </div>
    );
  }

  if (traders.length === 0) {
    return (
      <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)] text-center">
        <TrendingUp className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-[var(--text-muted)]">No top traders available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-[var(--border)]">
        <div className="flex-1">
          <p className="data-label text-sm">TOP TRADERS SIGNAL PROVIDERS</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Select traders ranked by impact factor</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="text-[var(--text-muted)] text-xs">Available</p>
            <p className="font-bold text-[var(--text-primary)] text-base">{traders.length}</p>
          </div>
          <div className="text-center border-l border-[var(--border)] pl-4">
            <p className="text-[var(--accent)] text-xs">Selected</p>
            <p className="font-bold text-[var(--accent)] text-base">{selectedIds.length}</p>
          </div>
        </div>
      </div>

      {/* Compact Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search wallet address..."
          className="w-full pl-10 pr-3 py-2 text-base bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20"
        />
      </div>

      {filteredTraders.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-center">
          <TrendingUp className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
          <p className="text-sm text-[var(--text-muted)]">No traders match your search</p>
        </div>
      ) : (
        <div
          className="border border-[var(--border)] bg-[var(--bg-deep)] rounded overflow-hidden"
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="max-h-[450px] overflow-y-auto overflow-x-hidden"
            style={{
              scrollbarWidth: 'thin',
            }}
          >
            {/* Table Header */}
            <div className="sticky top-0 z-10 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
              <div className="grid grid-cols-[50px_auto_100px_80px_80px_90px] gap-3 px-4 py-2 text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                <div className="text-center">#</div>
                <div>Wallet</div>
                <div className="text-right">Impact</div>
                <div className="text-center">Trades</div>
                <div className="text-center">W/L</div>
                <div className="text-center">Win %</div>
              </div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-[var(--border)]">
              {filteredTraders.map((trader, index) => {
                const isSelected = selectedIds.includes(trader.id);
                const winRate = trader.totalTrades > 0
                  ? ((trader.totalProfitTrades / trader.totalTrades) * 100).toFixed(1)
                  : '0.0';

                return (
                  <button
                    key={trader.id}
                    onClick={() => toggleTrader(trader.id)}
                    type="button"
                    className={`
                      w-full group relative text-left transition-all
                      ${isSelected
                        ? 'bg-[var(--accent)]/10'
                        : 'hover:bg-[var(--bg-elevated)]'
                      }
                    `}
                  >
                    <div className="grid grid-cols-[50px_auto_100px_80px_80px_90px] gap-3 px-4 py-3 items-center text-base">
                      {/* Rank & Checkbox */}
                      <div className="flex flex-col items-center gap-2">
                        <div className={`
                          w-7 h-7 rounded text-sm font-bold flex items-center justify-center
                          ${index === 0 ? 'bg-yellow-500/20 text-yellow-500' : ''}
                          ${index === 1 ? 'bg-gray-400/20 text-gray-400' : ''}
                          ${index === 2 ? 'bg-orange-500/20 text-orange-500' : ''}
                          ${index > 2 ? 'text-[var(--text-muted)]' : ''}
                        `}>
                          {index + 1}
                        </div>
                        <div className={`
                          w-5 h-5 border-2 rounded flex items-center justify-center
                          ${isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent)]'
                            : 'border-[var(--border)]'
                          }
                        `}>
                          {isSelected && <Check className="h-3 w-3 text-[var(--bg-deep)]" />}
                        </div>
                      </div>

                      {/* Wallet */}
                      <div className="flex items-center gap-3 min-w-0">
                        <Wallet className={`h-5 w-5 flex-shrink-0 ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                        <span className="font-mono text-base font-semibold text-[var(--text-primary)] truncate">
                          {formatAddress(trader.walletAddress)}
                        </span>
                        {trader._count?.agents > 0 && (
                          <span className="text-xs px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] rounded flex-shrink-0 font-semibold">
                            {trader._count.agents}
                          </span>
                        )}
                      </div>

                      {/* Impact Factor */}
                      <div className="text-right">
                        <span className="font-bold text-base text-[var(--accent)]">{trader.impactFactor.toFixed(2)}</span>
                      </div>

                      {/* Trades */}
                      <div className="text-center">
                        <span className="font-semibold text-sm text-[var(--text-primary)]">{trader.totalTrades}</span>
                      </div>

                      {/* W/L */}
                      <div className="text-center">
                        <span className="text-[var(--accent)] font-semibold text-base">{trader.totalProfitTrades}</span>
                        <span className="text-[var(--text-muted)] mx-1">/</span>
                        <span className="text-[var(--danger)] font-semibold text-base">{trader.totalLossTrades}</span>
                      </div>

                      {/* Win Rate */}
                      <div className="text-center">
                        <span className="font-semibold text-base text-[var(--text-primary)]">{winRate}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2.5 px-3 py-2 border border-[var(--accent)]/50 bg-[var(--accent)]/5 rounded text-sm">
          <Check className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
          <span className="font-semibold text-[var(--accent)]">
            {selectedIds.length} trader{selectedIds.length !== 1 ? 's' : ''} selected
          </span>
          <span className="text-[var(--text-secondary)] text-xs">• Signal providers for your agent</span>
        </div>
      )}
    </div>
  );
}