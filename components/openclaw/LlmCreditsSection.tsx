import { CreditCard, Loader2, Zap } from "lucide-react";

type LlmBalance = {
  balanceCents: number;
  totalPurchased: number;
  totalUsed: number;
  limitReached: boolean;
};

type Props = {
  llmBalance: LlmBalance | null;
  isLoadingLlmBalance: boolean;
  llmBalanceError: string | null;
  llmTopUpSuccess: boolean;
  selectedTopUpAmount: number;
  onSelectTopUpAmount: (cents: number) => void;
  isRedirecting: boolean;
  onTopUp: () => void;
};

const TOP_UP_OPTIONS = [500, 1000, 2000, 5000];

export function LlmCreditsSection({
  llmBalance,
  isLoadingLlmBalance,
  llmBalanceError,
  llmTopUpSuccess,
  selectedTopUpAmount,
  onSelectTopUpAmount,
  isRedirecting,
  onTopUp,
}: Props) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-surface)] rounded-lg">
      <div className="border-b border-[var(--border)] p-4 flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-[var(--accent)]" />
        <h4 className="font-display text-sm">LLM CREDITS</h4>
      </div>
      <div className="p-4 space-y-4">
        {isLoadingLlmBalance ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : llmBalanceError ? (
          <p className="text-sm text-red-400">{llmBalanceError}</p>
        ) : llmBalance ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[var(--bg-card)] rounded-lg p-3 text-center">
                <p className="text-xs text-[var(--text-muted)] mb-1">
                  Balance
                </p>
                <p className="font-bold text-lg">
                  ${(llmBalance.balanceCents / 100).toFixed(2)}
                </p>
              </div>
              <div className="bg-[var(--bg-card)] rounded-lg p-3 text-center">
                <p className="text-xs text-[var(--text-muted)] mb-1">
                  Purchased
                </p>
                <p className="font-bold text-lg">
                  ${(llmBalance.totalPurchased / 100).toFixed(2)}
                </p>
              </div>
              <div className="bg-[var(--bg-card)] rounded-lg p-3 text-center">
                <p className="text-xs text-[var(--text-muted)] mb-1">Used</p>
                <p className="font-bold text-lg">
                  ${(llmBalance.totalUsed / 100).toFixed(2)}
                </p>
              </div>
            </div>

            {llmBalance.limitReached && (
              <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-3 text-sm text-red-400">
                Monthly LLM limit reached. Top up to continue using your bot.
              </div>
            )}

            {llmTopUpSuccess && (
              <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-3 text-sm text-green-400">
                Top-up successful! Your balance has been updated.
              </div>
            )}

            <div>
              <p className="text-sm font-semibold mb-2">Add Credits</p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {TOP_UP_OPTIONS.map((cents) => (
                  <button
                    key={cents}
                    onClick={() => onSelectTopUpAmount(cents)}
                    className={`py-2 text-sm font-bold rounded-lg border transition-all ${
                      selectedTopUpAmount === cents
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border)] hover:border-[var(--accent)]/50"
                    }`}
                  >
                    ${cents / 100}
                  </button>
                ))}
              </div>
              <button
                onClick={onTopUp}
                disabled={isRedirecting}
                className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isRedirecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Top Up ${selectedTopUpAmount / 100}
                  </>
                )}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
