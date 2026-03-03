import { Check, ChevronDown, ChevronUp, Globe, Loader2, Search } from "lucide-react";
import { WebSearchProvider, WEB_SEARCH_OPTIONS } from "./types";

type Props = {
    webSearchEnabled: boolean;
    selectedWebSearchProvider: WebSearchProvider;
    isUpdatingWebSearch: boolean;
    showWebSearchSection: boolean;
    onToggle: () => void;
    onUpdateWebSearch: (enabled: boolean, provider: WebSearchProvider) => void;
};

export function WebSearchSection({
    webSearchEnabled,
    selectedWebSearchProvider,
    isUpdatingWebSearch,
    showWebSearchSection,
    onToggle,
    onUpdateWebSearch,
}: Props) {
    return (
        <div className="border border-[var(--border)] bg-[var(--bg-surface)] rounded-lg">
            <button
                onClick={onToggle}
                className="w-full border-b border-[var(--border)] p-4 flex items-center justify-between hover:bg-[var(--bg-card)] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[var(--accent)]" />
                    <h4 className="font-display text-sm">WEB SEARCH</h4>
                    {webSearchEnabled ? (
                        <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                            Enabled
                        </span>
                    ) : (
                        <span className="text-xs px-2 py-0.5 bg-[var(--bg-deep)] text-[var(--text-muted)] rounded-full border border-[var(--border)]">
                            Disabled
                        </span>
                    )}
                </div>
                {showWebSearchSection ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                )}
            </button>

            {showWebSearchSection && (
                <div className="p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            Let your assistant fetch real-time information from the web.
                            API keys are provided by Maxxit — no extra setup on your side.
                        </p>
                        {/* Toggle */}
                        <button
                            type="button"
                            onClick={() =>
                                onUpdateWebSearch(!webSearchEnabled, selectedWebSearchProvider)
                            }
                            disabled={isUpdatingWebSearch}
                            className={`relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border-2 outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${webSearchEnabled
                                    ? "bg-[var(--accent)] border-[var(--accent)]"
                                    : "bg-[var(--bg-deep)] border-[var(--border)] hover:border-[var(--text-muted)]"
                                }`}
                            aria-pressed={webSearchEnabled}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-lg ring-0 transition-all duration-300 ${webSearchEnabled
                                        ? "translate-x-[25px] bg-white"
                                        : "translate-x-[3px] bg-[var(--text-muted)]"
                                    }`}
                            />
                        </button>
                    </div>

                    {/* Provider cards */}
                    {webSearchEnabled && (
                        <div className="grid gap-3 sm:grid-cols-3">
                            {WEB_SEARCH_OPTIONS.map((opt) => {
                                const isSelected = selectedWebSearchProvider === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        disabled={isUpdatingWebSearch}
                                        onClick={() => onUpdateWebSearch(true, opt.id)}
                                        className={`group relative flex flex-col rounded-xl border p-3 text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${isSelected
                                                ? "border-[var(--accent)] bg-gradient-to-b from-[var(--accent)]/8 to-[var(--accent)]/3"
                                                : "border-[var(--border)] bg-[var(--bg-deep)]/40 hover:border-[var(--accent)]/40"
                                            }`}
                                    >
                                        <div className="absolute top-2 right-2">
                                            <div
                                                className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all ${isSelected
                                                        ? "border-[var(--accent)] bg-[var(--accent)]"
                                                        : "border-[var(--border)]"
                                                    }`}
                                            >
                                                {isSelected && (
                                                    <Check className="w-2.5 h-2.5 text-[var(--bg-deep)]" />
                                                )}
                                            </div>
                                        </div>
                                        <div
                                            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${isSelected
                                                    ? "bg-[var(--accent)]/15 border-[var(--accent)]/30"
                                                    : "bg-[var(--bg-card)] border-[var(--border)]"
                                                }`}
                                        >
                                            <Search
                                                className={`w-3.5 h-3.5 transition-colors ${isSelected
                                                        ? "text-[var(--accent)]"
                                                        : "text-[var(--text-muted)]"
                                                    }`}
                                            />
                                        </div>
                                        <p className="mt-2 font-semibold text-xs pr-5">
                                            {opt.name}
                                        </p>
                                        <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                                            {opt.description}
                                        </p>
                                        <div className="mt-2 pt-2 border-t border-[var(--border)]/60">
                                            <span
                                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium tracking-wide ${isSelected
                                                        ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
                                                        : "bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)]"
                                                    }`}
                                            >
                                                {opt.costLabel}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Status indicator */}
                    {isUpdatingWebSearch && (
                        <div className="flex items-center gap-2 text-xs text-[var(--accent)]">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Updating web search configuration...
                        </div>
                    )}

                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                        Web search is currently free for all plans. Pricing may change in
                        the future.
                    </p>
                </div>
            )}
        </div>
    );
}
