import { Check } from "lucide-react";
import { STEPS, StepKey } from "./types";

export function StepIndicator({
  steps,
  currentIndex,
  completedSteps,
}: {
  steps: typeof STEPS;
  currentIndex: number;
  completedSteps: Set<StepKey>;
}) {
  return (
    <div className="flex items-center justify-center gap-1 mb-10">
      {steps.map((s, i) => {
        const isCompleted = completedSteps.has(s.key);
        const isCurrent = i === currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${isCompleted
                  ? "bg-[var(--accent)] text-[var(--bg-deep)]"
                  : isCurrent
                    ? "border-2 border-[var(--accent)] text-[var(--accent)]"
                    : "border border-[var(--border)] text-[var(--text-muted)]"
                  }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider ${isCurrent
                  ? "text-[var(--accent)]"
                  : isCompleted
                    ? "text-[var(--text-secondary)]"
                    : "text-[var(--text-muted)]"
                  } whitespace-nowrap leading-none`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-10 h-px mb-5 ${isCompleted
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--border)]"
                  }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
