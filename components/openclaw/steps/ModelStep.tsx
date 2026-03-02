import { ArrowLeft, Check, ChevronRight, Loader2 } from "lucide-react";
import { MODEL_OPTIONS, PlanId, PLAN_RANKS } from "../types";

type Props = {
  selectedPlan: PlanId;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  isLoading: boolean;
  errorMessage: string;
  onBack: () => void;
  onContinue: () => void;
};

export function ModelStep({
  selectedPlan,
  selectedModel,
  onSelectModel,
  isLoading,
  errorMessage,
  onBack,
  onContinue,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-2xl mb-2">Choose your model</h1>
        <p className="text-[var(--text-secondary)]">
          Model access depends on your plan tier.
        </p>
      </div>
      <div className="space-y-3">
        {MODEL_OPTIONS.map((model) => {
          const allowed =
            PLAN_RANKS[selectedPlan] >= PLAN_RANKS[model.minPlan];
          return (
            <button
              key={model.id}
              onClick={() => allowed && onSelectModel(model.id)}
              disabled={!allowed}
              className={`w-full p-4 border text-left rounded-lg transition-all ${
                !allowed
                  ? "opacity-40 cursor-not-allowed border-[var(--border)]"
                  : selectedModel === model.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:border-[var(--accent)]/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{model.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {model.speedLabel}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-[var(--text-secondary)]">
                      {model.costLabel}
                    </p>
                    {!allowed && (
                      <p className="text-xs text-[var(--accent)]">
                        Requires {model.minPlan}
                      </p>
                    )}
                  </div>
                  {allowed && (
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedModel === model.id
                          ? "border-[var(--accent)] bg-[var(--accent)]"
                          : "border-[var(--border)]"
                      }`}
                    >
                      {selectedModel === model.id && (
                        <Check className="w-3 h-3 text-[var(--bg-deep)]" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={isLoading}
          className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
      {errorMessage && (
        <p className="text-red-500 text-sm text-center">{errorMessage}</p>
      )}
    </div>
  );
}
