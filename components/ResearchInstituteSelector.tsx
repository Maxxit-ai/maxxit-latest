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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
        ⚠️ {error}
      </div>
    );
  }

  if (institutes.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
        No research institutes available. Contact admin to add institutes.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md p-4 shadow-[0_0_30px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-emerald-300/90 uppercase font-semibold">
              Research Intelligence Feed
            </p>
            <h3 className="text-lg font-semibold text-white mt-1">
              Select institutes to route high-conviction signals (auto 5% per trade)
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[10px] uppercase font-semibold text-gray-300/80">Available</p>
              <p className="text-xl font-bold text-white">{institutes.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2">
              <p className="text-[10px] uppercase font-semibold text-gray-300/80">Selected</p>
              <p className="text-xl font-bold text-emerald-200">{selectedIds.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[10px] uppercase font-semibold text-gray-300/80">Live Agents</p>
              <p className="text-xl font-bold text-white">{totalAgentsFollowing}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, description, or X handle"
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-gray-500 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowSelectedOnly(!showSelectedOnly)}
          className={`rounded-2xl px-4 py-3 text-sm font-medium transition-colors border ${showSelectedOnly
            ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
            : 'border-white/10 bg-white/5 text-gray-200 hover:border-white/20'
            }`}
        >
          {showSelectedOnly ? 'Showing Selected' : 'Show Selected Only'}
        </button>
      </div>

      <div className="text-sm text-gray-400">
        Tap a card to toggle it. We auto-balance exposure by allocating a fixed 5% per signal.
      </div>

      {filteredInstitutes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-gray-400">
          No institutes match your filters. Clear the search or toggle to view all.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredInstitutes.map(institute => {
            const isSelected = selectedIds.includes(institute.id);

            return (
              <button
                key={institute.id}
                onClick={() => toggleInstitute(institute.id)}
                type="button"
                className={`
                group relative overflow-hidden rounded-2xl border p-5 text-left transition-all
                ${isSelected
                    ? 'border-emerald-400/60 bg-gradient-to-br from-emerald-500/20 to-transparent shadow-lg shadow-emerald-900/30'
                    : 'border-white/10 bg-white/5 hover:border-emerald-400/40 hover:bg-white/10'
                  }
              `}
              >
                <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-white/5 to-transparent" />
                <div className="relative flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    {/* Logo or Icon */}
                    <div className={`
                    w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0
                    ${isSelected ? 'bg-emerald-500/25' : 'bg-white/10'}
                  `}>
                      {institute.logo_url ? (
                        <img
                          src={institute.logo_url}
                          alt={institute.name}
                          className="w-12 h-12 rounded-xl object-cover"
                        />
                      ) : (
                        <Building2 className={`w-7 h-7 ${isSelected ? 'text-emerald-200' : 'text-gray-400'}`} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <h3 className={`font-semibold text-base ${isSelected ? 'text-white' : 'text-gray-100'}`}>
                          {institute.name}
                        </h3>
                        {institute._count.agent_research_institutes > 0 && (
                          <span className="text-[11px] px-2 py-0.5 bg-white/10 text-gray-300 rounded-full">
                            {institute._count.agent_research_institutes} live agents
                          </span>
                        )}
                        {isSelected && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-400/30 text-emerald-100">
                            Following
                          </span>
                        )}
                      </div>

                      {institute.description && (
                        <p className="text-sm text-gray-400 mb-3 line-clamp-2">
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
                            className="flex items-center space-x-1 text-emerald-200 hover:text-emerald-100"
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
                            className="flex items-center space-x-1 text-emerald-200 hover:text-emerald-100"
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
                  w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-3 transition-all
                  ${isSelected ? 'bg-emerald-300 text-black' : 'bg-white/10 text-gray-400'}
                `}>
                    {isSelected && <Check className="w-4 h-4 text-black" />}
                    {!isSelected && <Check className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="mt-2 rounded-2xl border border-emerald-400/50 bg-emerald-500/10 p-4">
          <div className="text-sm text-emerald-100 font-medium">
            ✅ Following {selectedIds.length} institute{selectedIds.length !== 1 ? 's' : ''}
          </div>
          <div className="text-xs text-emerald-200 mt-1">
            Their signals will be executed automatically with a fixed 5% allocation per trade.
          </div>
        </div>
      )}
    </div>
  );
}

