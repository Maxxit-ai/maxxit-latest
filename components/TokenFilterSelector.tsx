import { useState, useEffect } from 'react';
import { Check, X, Search } from 'lucide-react';

interface Token {
    id: number;
    symbol: string;
    group: string;
    maxLeverage: number | null;
}

interface TokenFilterSelectorProps {
    selectedTokens: string[];
    onChange: (tokens: string[]) => void;
}

// Define category presets for quick selection
const CATEGORY_PRESETS: Record<string, string[]> = {
    'Crypto Major': ['BTC/USD', 'ETH/USD', 'SOL/USD'],
    'Precious Metals': ['XAU/USD', 'XAG/USD'],
    'Energy': ['WTI/USD', 'BRENT/USD', 'NGAS/USD'],
    'Forex Major': ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    'US Indices': ['SPX/USD', 'NDX/USD', 'DJI/USD'],
};

export function TokenFilterSelector({ selectedTokens, onChange }: TokenFilterSelectorProps) {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [groupedTokens, setGroupedTokens] = useState<Record<string, Token[]>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchTokens();
    }, []);

    const fetchTokens = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/ostium/available-pairs');
            const data = await response.json();

            if (data.success) {
                setTokens(data.tokens);
                setGroupedTokens(data.groupedTokens);
            } else {
                setError(data.error || 'Failed to fetch tokens');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch tokens');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleToken = (symbol: string) => {
        if (selectedTokens.includes(symbol)) {
            onChange(selectedTokens.filter((t) => t !== symbol));
        } else {
            onChange([...selectedTokens, symbol]);
        }
    };

    const toggleCategory = (category: string) => {
        const categoryTokens = groupedTokens[category]?.map((t) => t.symbol) || [];
        const allSelected = categoryTokens.every((t) => selectedTokens.includes(t));

        if (allSelected) {
            // Deselect all in category
            onChange(selectedTokens.filter((t) => !categoryTokens.includes(t)));
        } else {
            // Select all in category
            const newTokens = new Set([...selectedTokens, ...categoryTokens]);
            onChange(Array.from(newTokens));
        }
    };

    const applyPreset = (presetName: string) => {
        const presetTokens = CATEGORY_PRESETS[presetName] || [];
        onChange([...presetTokens]);
    };

    const clearAll = () => {
        onChange([]);
    };

    const filteredGroups = Object.entries(groupedTokens).filter(([group, tokens]) => {
        if (!searchQuery) return true;
        return (
            group.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tokens.some((t) => t.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    });

    if (isLoading) {
        return (
            <div className="p-6 border border-[var(--border)] bg-[var(--bg-elevated)] text-center">
                <div className="animate-pulse">Loading available tokens...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 border border-[var(--danger)] bg-[var(--danger)]/10">
                <p className="text-[var(--danger)]">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with Search and Clear */}
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tokens..."
                        className="w-full pl-10 pr-4 py-2 bg-[var(--bg-deep)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                    />
                </div>
                {selectedTokens.length > 0 && (
                    <button
                        type="button"
                        onClick={clearAll}
                        className="px-3 py-2 text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger)]/10 border border-[var(--danger)]/30 transition-colors"
                    >
                        CLEAR ALL
                    </button>
                )}
            </div>

            {/* Selected Tokens Preview */}
            {selectedTokens.length > 0 && (
                <div className="p-3 bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                    <p className="data-label text-xs mb-2">SELECTED TOKENS ({selectedTokens.length})</p>
                    <div className="flex flex-wrap gap-2">
                        {selectedTokens.map((symbol) => (
                            <span
                                key={symbol}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--accent)]/20 border border-[var(--accent)] text-xs font-bold text-[var(--accent)]"
                            >
                                {symbol}
                                <button
                                    type="button"
                                    onClick={() => toggleToken(symbol)}
                                    className="hover:text-[var(--text-primary)]"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick Presets */}
            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border)]">
                <p className="data-label text-xs mb-2">QUICK PRESETS</p>
                <div className="flex flex-wrap gap-2">
                    {Object.keys(CATEGORY_PRESETS).map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => applyPreset(preset)}
                            className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                            {preset}
                        </button>
                    ))}
                </div>
            </div>

            {/* Token Groups */}
            <div className="space-y-3 max-h-[350px] overflow-y-scroll border border-[var(--border)] p-3 bg-[var(--bg-deep)]" onWheel={(e) => e.stopPropagation()}>
                {filteredGroups.map(([group, groupTokens]) => {
                    const allSelected = groupTokens.every((t) => selectedTokens.includes(t.symbol));
                    const someSelected = groupTokens.some((t) => selectedTokens.includes(t.symbol));

                    return (
                        <div key={group} className="border border-[var(--border)] bg-[var(--bg-elevated)]">
                            {/* Group Header */}
                            <button
                                type="button"
                                onClick={() => toggleCategory(group)}
                                className="w-full p-3 flex items-center justify-between hover:bg-[var(--bg-surface)] transition-colors"
                            >
                                <span className="font-bold text-sm text-[var(--text-primary)]">{group}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--text-muted)]">
                                        {groupTokens.filter((t) => selectedTokens.includes(t.symbol)).length}/{groupTokens.length}
                                    </span>
                                    <div
                                        className={`w-4 h-4 border flex items-center justify-center ${allSelected
                                            ? 'bg-[var(--accent)] border-[var(--accent)]'
                                            : someSelected
                                                ? 'border-[var(--accent)] bg-[var(--accent)]/30'
                                                : 'border-[var(--border)]'
                                            }`}
                                    >
                                        {allSelected && <Check className="h-3 w-3 text-[var(--bg-deep)]" />}
                                    </div>
                                </div>
                            </button>

                            {/* Token List */}
                            <div className="p-3 pt-0 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                {groupTokens
                                    .filter((t) =>
                                        searchQuery
                                            ? t.symbol.toLowerCase().includes(searchQuery.toLowerCase())
                                            : true
                                    )
                                    .map((token) => {
                                        const isSelected = selectedTokens.includes(token.symbol);
                                        return (
                                            <button
                                                key={token.id}
                                                type="button"
                                                onClick={() => toggleToken(token.symbol)}
                                                className={`px-2 py-1.5 text-xs font-medium border transition-all ${isSelected
                                                    ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]'
                                                    : 'border-[var(--border)] hover:border-[var(--text-muted)] text-[var(--text-secondary)]'
                                                    }`}
                                            >
                                                {token.symbol}
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Help Text */}
            <p className="text-xs text-[var(--text-muted)]">
                💡 Select the tokens your club will trade. Signals for other tokens will be automatically rejected.
            </p>
        </div>
    );
}
