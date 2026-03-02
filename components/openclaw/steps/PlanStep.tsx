import { Check, ChevronRight, Loader2, Shield } from "lucide-react";
import { InstanceData, PlanId, PLAN_OPTIONS, StepKey } from "../types";

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
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                      openaiKeyStatus === "created"
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
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                      maxxitApiKey || maxxitApiKeyPrefix
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
                className={`w-full p-5 border text-left rounded-lg transition-all ${
                  selectedPlan === plan.id
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
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedPlan === plan.id
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
