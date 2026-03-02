import { Bot, MessageSquare, Shield, Sparkles, Zap } from "lucide-react";

export function OpenClawLanding({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="text-center space-y-8">
      <div className="w-20 h-20 mx-auto bg-[var(--accent)] rounded-2xl flex items-center justify-center">
        <Bot className="w-10 h-10 text-[var(--bg-deep)]" />
      </div>
      <div>
        <h1 className="font-display text-4xl mb-4">OpenClaw on Maxxit</h1>
        <p className="text-lg text-[var(--text-secondary)] max-w-md mx-auto">
          Your personal AI assistant. Choose a plan, pick a model, link Telegram,
          and you&apos;re live.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        <div className="border border-[var(--border)] p-4 rounded-lg">
          <Shield className="w-6 h-6 text-[var(--accent)] mb-2" />
          <p className="font-semibold">Dedicated instance</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Isolated runtime with your own config.
          </p>
        </div>
        <div className="border border-[var(--border)] p-4 rounded-lg">
          <MessageSquare className="w-6 h-6 text-[var(--accent)] mb-2" />
          <p className="font-semibold">Telegram ready</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Connect once and chat from your phone.
          </p>
        </div>
        <div className="border border-[var(--border)] p-4 rounded-lg">
          <Sparkles className="w-6 h-6 text-[var(--accent)] mb-2" />
          <p className="font-semibold">LLM budget included</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Simple monthly limits per plan.
          </p>
        </div>
      </div>
      <button
        onClick={onGetStarted}
        className="px-10 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-lg rounded-lg flex items-center justify-center gap-2 mx-auto hover:opacity-90 transition-opacity"
      >
        <Zap className="w-5 h-5" />
        GET STARTED
      </button>
    </div>
  );
}
