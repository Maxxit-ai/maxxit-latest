import { useState, useEffect } from 'react';
import { Check, Building2, ExternalLink, Twitter, Search } from 'lucide-react';
import Link from 'next/link';

interface ResearchInstitute {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  x_handle: string | null;
  _count: {
    agent_research_institutes: number;
  };
}

interface ResearchInstituteSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ResearchInstituteSelector({
  selectedIds,
  onChange,
}: ResearchInstituteSelectorProps) {
  const [institutes, setInstitutes] = useState<ResearchInstitute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  useEffect(() => {
    fetchInstitutes();
  }, []);

  const fetchInstitutes = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/research-institutes');
      const data = await response.json();

      if (data.success) {
        setInstitutes(data.institutes);
      } else {
        setError('Failed to load research institutes');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load research institutes');
    } finally {
      setLoading(false);
    }
  };

  const toggleInstitute = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const totalAgentsFollowing = institutes.reduce(
    (sum, institute) => sum + institute._count.agent_research_institutes,
    0
  );

  const filteredInstitutes = institutes.filter(institute => {
    const matchesSearch =
      searchQuery.trim().length === 0 ||
      institute.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      institute.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      institute.x_handle?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSelectedFilter =
      !showSelectedOnly || selectedIds.includes(institute.id);

    return matchesSearch && matchesSelectedFilter;
  });

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

  if (institutes.length === 0) {
    return (
      <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)] text-center">
        <Building2 className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-[var(--text-muted)]">No research institutes available. Contact admin to add institutes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="data-label mb-1">
              Research Intelligence Feed
            </p>
            <h3 className="font-bold text-[var(--text-primary)] mt-1">
              Select institutes to route high-conviction signals (auto 5% per trade)
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="border border-[var(--border)] bg-[var(--bg-deep)] py-2">
              <p className="data-label">Available</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{institutes.length}</p>
            </div>
            <div className="border border-[var(--accent)] bg-[var(--accent)]/10 px-1 py-2">
              <p className="data-label">Selected</p>
              <p className="text-xl font-bold text-[var(--accent)]">{selectedIds.length}</p>
            </div>
            <div className="border border-[var(--border)] bg-[var(--bg-deep)] px-1 py-2">
              <p className="data-label">Live Agents</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{totalAgentsFollowing}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, description, or X handle"
            className="w-full pl-10 pr-3 py-2 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowSelectedOnly(!showSelectedOnly)}
          className={`px-4 py-2 text-sm font-bold transition-colors border ${showSelectedOnly
            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
            : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent)]/50'
            }`}
        >
          {showSelectedOnly ? 'Showing Selected' : 'Show Selected Only'}
        </button>
      </div>

      <div className="text-sm text-[var(--text-secondary)]">
        Tap a card to toggle it. We auto-balance exposure by allocating a fixed 5% per signal.
      </div>

      {filteredInstitutes.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-center">
          <Building2 className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No institutes match your filters. Clear the search or toggle to view all.</p>
        </div>
      ) : (
        <div className="border border-[var(--border)] bg-[var(--bg-deep)] h-[500px] flex flex-col overflow-hidden">
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden pr-2 space-y-2 custom-scrollbar"
            style={{ minHeight: 0 }}
            onWheel={(e) => {
              const element = e.currentTarget;
              const isScrollable = element.scrollHeight > element.clientHeight;
              const isAtTop = element.scrollTop === 0;
              const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;

              if (isScrollable && ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0))) {
                // Allow parent scroll only when at boundaries
                return;
              }
              // Prevent parent scroll when scrolling within the container
              if (isScrollable) {
                e.stopPropagation();
              }
            }}
          >
            {filteredInstitutes.map(institute => {
              const isSelected = selectedIds.includes(institute.id);

              return (
                <button
                  key={institute.id}
                  onClick={() => toggleInstitute(institute.id)}
                  type="button"
                  className={`
                w-full group relative border p-4 text-left transition-all
                ${isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_20px_rgba(0,255,136,0.1)]'
                      : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-surface)]'
                    }
              `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Icon - Always use Building2 icon */}
                      <div className={`
                    w-10 h-10 border flex items-center justify-center flex-shrink-0
                    ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--border)]'}
                  `}>
                        <Building2 className={`h-5 w-5 ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-2">
                          <h3 className={`font-bold text-base ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                            {institute.name}
                          </h3>
                          {institute._count.agent_research_institutes > 0 && (
                            <span className="text-[10px] px-2 py-0.5 bg-[var(--bg-deep)] text-[var(--text-muted)] border border-[var(--border)]">
                              {institute._count.agent_research_institutes} live agents
                            </span>
                          )}
                          {isSelected && (
                            <span className="text-[10px] px-2 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/50">
                              Following
                            </span>
                          )}
                        </div>

                        {institute.description && (
                          <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">
                            {institute.description}
                          </p>
                        )}

                        {/* Links */}
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          {institute.website_url && (
                            <Link
                              href={institute.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Website</span>
                            </Link>
                          )}
                          {institute.x_handle && (
                            <a
                              href={`https://x.com/${institute.x_handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors"
                            >
                              <Twitter className="w-3 h-3" />
                              <span>@{institute.x_handle}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Checkmark */}
                    <div className={`
                  flex-shrink-0 ml-3
                  ${isSelected ? 'text-[var(--accent)]' : 'text-transparent'}
                `}>
                      <Check className="h-5 w-5" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="mt-2 border border-[var(--accent)]/50 bg-[var(--accent)]/5 p-3">
          <div className="text-sm text-[var(--accent)] font-bold">
            ✓ Following {selectedIds.length} institute{selectedIds.length !== 1 ? 's' : ''}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Their signals will be executed automatically with a fixed 5% allocation per trade.
          </div>
        </div>
      )}
    </div>
  );
}

