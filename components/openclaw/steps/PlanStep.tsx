import { Check, ChevronRight, Globe, Loader2, Search, Shield } from "lucide-react";
import {
  InstanceData,
  PlanId,
  PLAN_OPTIONS,
  StepKey,
  WebSearchProvider,
  WEB_SEARCH_OPTIONS,
} from "../types";

type Props = {
  completedSteps: Set<StepKey>;
  instanceData: InstanceData | null;
  selectedPlan: PlanId;
  onSelectPlan: (plan: PlanId) => void;
  openaiKeyStatus: "not_created" | "creating" | "created";
  isCreatingOpenAIKey: boolean;
  openaiKeyPrefix: string | null;
  openaiKeyCreatedAt: string | null;
  maxxitApiKey: string | null;
  maxxitApiKeyPrefix: string | null;
  isGeneratingApiKey: boolean;
  canContinueFromPlanStep: boolean;
  isLoading: boolean;
  errorMessage: string;
  webSearchEnabled: boolean;
  selectedWebSearchProvider: WebSearchProvider;
  onWebSearchEnabledChange: (enabled: boolean) => void;
  onSelectWebSearchProvider: (provider: WebSearchProvider) => void;
  isUpdatingWebSearch?: boolean;
  onUpdateWebSearch?: (enabled: boolean, provider: WebSearchProvider) => void;
  isActive?: boolean;
  onContinue: () => void;
  onPlanContinue: () => void;
};

export function PlanStep({
  completedSteps,
  instanceData,
  selectedPlan,
  onSelectPlan,
  openaiKeyStatus,
  isCreatingOpenAIKey,
  openaiKeyPrefix,
  openaiKeyCreatedAt,
  maxxitApiKey,
  maxxitApiKeyPrefix,
  isGeneratingApiKey,
  canContinueFromPlanStep,
  isLoading,
  errorMessage,
  webSearchEnabled,
  selectedWebSearchProvider,
  onWebSearchEnabledChange,
  onSelectWebSearchProvider,
  isUpdatingWebSearch,
  onUpdateWebSearch,
  isActive,
  onContinue,
  onPlanContinue,
}: Props) {
  return (
    <div className="space-y-6">
      {completedSteps.has("plan") && instanceData ? (
        <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-6 text-center space-y-4">
          <div className="space-y-3">
            <Check className="w-10 h-10 mx-auto text-[var(--accent)]" />
            <p className="font-bold text-lg">
              Plan selected:{" "}
              <span className="text-[var(--accent)]">
                {PLAN_OPTIONS.find((p) => p.id === selectedPlan)?.name}
              </span>
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Instance created and keys initialized for your wallet.
            </p>
          </div>

          <div className="border border-[var(--border)] bg-[var(--bg-card)] rounded-lg p-5 sm:p-6 text-left space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  Your access keys
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  These credentials are generated just for you and wired into
                  your OpenClaw instance.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-deep)]/60 px-2.5 py-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <Shield className="w-3 h-3 text-[var(--accent)]" />
                Secure
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* OpenAI key */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                    OpenAI API Key
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${openaiKeyStatus === "created"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : openaiKeyStatus === "creating" || isCreatingOpenAIKey
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-[var(--border)] bg-[var(--bg-deep)]/60 text-[var(--text-muted)]"
                      }`}
                  >
                    {openaiKeyStatus === "created"
                      ? "Ready"
                      : openaiKeyStatus === "creating" || isCreatingOpenAIKey
                        ? "Creating…"
                        : "Pending"}
                  </span>
                </div>

                {openaiKeyStatus === "created" && openaiKeyPrefix ? (
                  <div className="space-y-3">
                    <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-3 sm:p-4 text-center space-y-2">
                      <Check className="w-6 h-6 mx-auto text-[var(--accent)]" />
                      <p className="font-semibold text-sm sm:text-base">
                        OpenAI API Key Created
                      </p>
                      <div className="bg-[var(--bg-deep)]/40 rounded-lg p-3 space-y-1">
                        <div className="flex justify-between text-[10px] sm:text-xs">
                          <span className="text-[var(--text-muted)]">
                            Key Prefix
                          </span>
                          <span className="font-mono font-semibold">
                            {openaiKeyPrefix}
                          </span>
                        </div>
                        {openaiKeyCreatedAt && (
                          <div className="flex justify-between text-[10px] sm:text-xs">
                            <span className="text-[var(--text-muted)]">
                              Created
                            </span>
                            <span className="font-semibold">
                              {new Date(openaiKeyCreatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ul className="text-[10px] sm:text-xs text-[var(--text-secondary)] space-y-1">
                      <li className="flex items-start gap-1.5">
                        <span className="text-[var(--accent)]">•</span>
                        <span>
                          Your personal key enables per-user usage tracking.
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-[var(--accent)]">•</span>
                        <span>
                          LLM costs are deducted from your plan&apos;s monthly
                          budget.
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-[var(--accent)]">•</span>
                        <span>Isolated from other users for fair usage.</span>
                      </li>
                    </ul>
                  </div>
                ) : openaiKeyStatus === "creating" || isCreatingOpenAIKey ? (
                  <div className="border border-[var(--accent)]/60 bg-[var(--accent)]/5 rounded-lg p-3 flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold">
                        Creating OpenAI project…
                      </p>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        Setting up your dedicated project and API key.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-red-400">
                    Failed to create OpenAI key. Please retry your subscription
                    flow or contact support.
                  </p>
                )}
              </div>

              {/* Maxxit API key */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                    Maxxit API Key
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${maxxitApiKey || maxxitApiKeyPrefix
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : isGeneratingApiKey
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-[var(--border)] bg-[var(--bg-deep)]/60 text-[var(--text-muted)]"
                      }`}
                  >
                    {maxxitApiKey || maxxitApiKeyPrefix
                      ? "Ready"
                      : isGeneratingApiKey
                        ? "Generating…"
                        : "Pending"}
                  </span>
                </div>

                {maxxitApiKey || maxxitApiKeyPrefix ? (
                  <div className="space-y-3">
                    <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-3 sm:p-4 text-center space-y-2">
                      <Check className="w-6 h-6 mx-auto text-[var(--accent)]" />
                      <p className="font-semibold text-sm sm:text-base">
                        Maxxit API Key Generated
                      </p>
                      <div className="bg-[var(--bg-deep)]/40 rounded-lg p-3 space-y-1">
                        <div className="flex justify-between text-[10px] sm:text-xs">
                          <span className="text-[var(--text-muted)]">
                            Key Preview
                          </span>
                          <span className="font-mono font-semibold">
                            {maxxitApiKeyPrefix
                              ? `${maxxitApiKeyPrefix}...`
                              : maxxitApiKey
                                ? `${maxxitApiKey.slice(0, 12)}...`
                                : ""}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] sm:text-xs">
                          <span className="text-[var(--text-muted)]">
                            Scope
                          </span>
                          <span className="font-semibold">
                            Lazy Trading skill
                          </span>
                        </div>
                      </div>
                    </div>
                    <ul className="text-[10px] sm:text-xs text-[var(--text-secondary)] space-y-1">
                      <li className="flex items-start gap-1.5">
                        <span className="text-[var(--accent)]">•</span>
                        <span>
                          Lets your Maxxit Lazy Trading agent execute trades on
                          your behalf.
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-[var(--accent)]">•</span>
                        <span>
                          Stored in secure infrastructure and never exposed in
                          plaintext to bots.
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-[var(--accent)]">•</span>
                        <span>
                          Tied to your wallet so you stay in full control.
                        </span>
                      </li>
                    </ul>
                  </div>
                ) : isGeneratingApiKey ? (
                  <div className="border border-[var(--accent)]/60 bg-[var(--accent)]/5 rounded-lg p-3 flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold">
                        Generating Maxxit API key…
                      </p>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        Preparing secure credentials for your trading agent.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {errorMessage &&
                      errorMessage.toLowerCase().includes("generate api key") ? (
                      <p className="text-[10px] text-red-400">
                        Failed to generate Maxxit API key. Please retry your
                        subscription flow or contact support.
                      </p>
                    ) : (
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        Waiting for Maxxit API key to be created…
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <p className="text-[10px] text-[var(--text-muted)]">
              You don&apos;t need to copy these keys manually — they are stored
              in secure infrastructure and wired into your OpenClaw instance.
            </p>
          </div>

          {/* Web Search Provider (only editable for active/running instances) */}
          {isActive && <div className="border border-[var(--border)] bg-[var(--bg-card)] rounded-lg p-5 text-left space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <Globe className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Web Search</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {webSearchEnabled
                      ? `${WEB_SEARCH_OPTIONS.find((o) => o.id === selectedWebSearchProvider)?.name ?? selectedWebSearchProvider} enabled`
                      : "Disabled"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isActive && onUpdateWebSearch) {
                    onUpdateWebSearch(!webSearchEnabled, selectedWebSearchProvider);
                  } else {
                    onWebSearchEnabledChange(!webSearchEnabled);
                  }
                }}
                disabled={isUpdatingWebSearch}
                className={`relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border-2 outline-none transition-all duration-300 disabled:opacity-50 ${webSearchEnabled
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

            {webSearchEnabled && (
              <div className="grid gap-3 sm:grid-cols-3">
                {WEB_SEARCH_OPTIONS.map((opt) => {
                  const isSelected = selectedWebSearchProvider === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isUpdatingWebSearch}
                      onClick={() => {
                        if (isActive && onUpdateWebSearch) {
                          onUpdateWebSearch(true, opt.id);
                        } else {
                          onSelectWebSearchProvider(opt.id);
                        }
                      }}
                      className={`group relative flex flex-col rounded-xl border p-3 text-left transition-all duration-200 disabled:opacity-50 ${isSelected
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
                      <p className="font-semibold text-xs pr-5">{opt.name}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                        {opt.costLabel}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {isUpdatingWebSearch && (
              <div className="flex items-center gap-2 text-xs text-[var(--accent)]">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating web search configuration...
              </div>
            )}
          </div>}

          {/* Read-only web search summary when not yet active */}
          {!isActive && webSearchEnabled && (
            <div className="border border-[var(--border)] bg-[var(--bg-card)] rounded-lg p-5 text-left">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <Globe className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Web Search</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {WEB_SEARCH_OPTIONS.find((o) => o.id === selectedWebSearchProvider)?.name ?? selectedWebSearchProvider}{" "}
                    will be configured when your instance launches.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-medium text-[var(--accent)] uppercase tracking-wide">
                  <Check className="w-3 h-3" />
                  Enabled
                </span>
              </div>
            </div>
          )}

          <button
            onClick={onContinue}
            disabled={!canContinueFromPlanStep}
            className="mt-2 px-8 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center gap-2 mx-auto hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="text-center">
            <h1 className="font-display text-2xl mb-2">Choose your plan</h1>
            <p className="text-[var(--text-secondary)]">
              Each plan includes hosting, usage tracking, and Telegram
              integration.
            </p>
          </div>
          <div className="space-y-3">
            {PLAN_OPTIONS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => onSelectPlan(plan.id)}
                className={`w-full p-5 border text-left rounded-lg transition-all ${selectedPlan === plan.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:border-[var(--accent)]/50"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg">{plan.name}</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {plan.budgetLabel} · {plan.modelsLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-xl">
                      {plan.priceLabel}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedPlan === plan.id
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--border)]"
                        }`}
                    >
                      {selectedPlan === plan.id && (
                        <Check className="w-3 h-3 text-[var(--bg-deep)]" />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Web search configuration */}
          <div className="mt-6 border border-[var(--border)] bg-[var(--bg-card)] rounded-xl overflow-hidden">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 p-5 pb-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <Globe className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="font-semibold text-sm leading-tight">
                    Web Search
                    <span className="ml-2 inline-flex items-center rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)] uppercase tracking-wider">
                      Included
                    </span>
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Let your assistant fetch real-time information from the web. API keys are provided by Maxxit.
                  </p>
                </div>
              </div>
              {/* Toggle */}
              <button
                type="button"
                onClick={() => onWebSearchEnabledChange(!webSearchEnabled)}
                disabled={isLoading}
                className={`relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border-2 outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${webSearchEnabled
                  ? "bg-[var(--accent)] border-[var(--accent)] shadow-[0_0_12px_rgba(var(--accent-rgb,0,255,157),0.35)]"
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
              <div className="px-5 pb-2">
                <div className="grid gap-3 sm:grid-cols-3">
                  {WEB_SEARCH_OPTIONS.map((opt) => {
                    const isSelected = selectedWebSearchProvider === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isLoading}
                        onClick={() => onSelectWebSearchProvider(opt.id)}
                        className={`group relative flex flex-col rounded-xl border p-4 text-left transition-all duration-200 ${isSelected
                          ? "border-[var(--accent)] bg-gradient-to-b from-[var(--accent)]/8 to-[var(--accent)]/3 shadow-[0_0_16px_-4px_rgba(var(--accent-rgb,0,255,157),0.25)]"
                          : "border-[var(--border)] bg-[var(--bg-deep)]/40 hover:border-[var(--accent)]/40 hover:bg-[var(--bg-deep)]/60"
                          }`}
                      >
                        {/* Radio indicator — top right */}
                        <div className="absolute top-3 right-3">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200 ${isSelected
                              ? "border-[var(--accent)] bg-[var(--accent)]"
                              : "border-[var(--border)] group-hover:border-[var(--accent)]/50"
                              }`}
                          >
                            {isSelected && (
                              <Check className="w-3 h-3 text-[var(--bg-deep)]" />
                            )}
                          </div>
                        </div>

                        {/* Icon */}
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200 ${isSelected
                            ? "bg-[var(--accent)]/15 border-[var(--accent)]/30"
                            : "bg-[var(--bg-card)] border-[var(--border)] group-hover:border-[var(--accent)]/30"
                            }`}
                        >
                          <Search
                            className={`w-4 h-4 transition-colors duration-200 ${isSelected
                              ? "text-[var(--accent)]"
                              : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
                              }`}
                          />
                        </div>

                        {/* Name + description */}
                        <p className="mt-3 font-semibold text-sm leading-tight pr-6">
                          {opt.name}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)] flex-1">
                          {opt.description}
                        </p>

                        {/* Cost badge */}
                        <div className="mt-3 pt-3 border-t border-[var(--border)]/60">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium tracking-wide ${isSelected
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
              </div>
            )}

            {/* Footer note */}
            <div className="px-5 py-3 border-t border-[var(--border)]/40">
              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                Web search usage is billed to Maxxit&apos;s provider accounts. We
                may introduce optional add-ons in the future, but there is no
                extra setup required on your side.
              </p>
            </div>
          </div>

          <button
            onClick={onPlanContinue}
            disabled={isLoading}
            className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Subscribe & Continue
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </>
      )}
      {errorMessage && (
        <p className="text-red-500 text-sm text-center">{errorMessage}</p>
      )}
    </div>
  );
}
