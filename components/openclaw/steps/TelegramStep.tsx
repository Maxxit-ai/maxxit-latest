import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquare,
  Shield,
} from "lucide-react";
import { StepKey } from "../types";

type Props = {
  telegramLinked: boolean;
  telegramVerified: boolean;
  botUsername: string | null;
  botToken: string;
  onBotTokenChange: (token: string) => void;
  isValidatingBot: boolean;
  errorMessage: string;
  onSubmitBotToken: () => void;
  onBack: () => void;
  onContinue: () => void;
  markComplete: (key: StepKey) => void;
};

export function TelegramStep({
  telegramLinked,
  telegramVerified,
  botUsername,
  botToken,
  onBotTokenChange,
  isValidatingBot,
  errorMessage,
  onSubmitBotToken,
  onBack,
  onContinue,
  markComplete,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-2xl mb-2">
          Create Your Telegram Bot
        </h1>
        <p className="text-[var(--text-secondary)]">
          Your own private bot — messages go directly to your instance.
        </p>
      </div>

      {telegramLinked ? (
        <div className="space-y-4">
          <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-6 text-center space-y-2">
            <Check className="w-10 h-10 mx-auto text-[var(--accent)]" />
            <p className="font-bold text-lg">
              Bot connected{botUsername ? ` — @${botUsername}` : ""}
            </p>
          </div>

          {!telegramVerified && (
            <div className="border border-yellow-500/50 bg-yellow-500/10 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-yellow-500" />
                <p className="font-bold text-yellow-500">
                  Verification Required
                </p>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Send any message to your bot{" "}
                <strong>@{botUsername}</strong> to verify your account. This
                links your Telegram ID for secure access.
              </p>
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <ExternalLink className="w-4 h-4" />
                Open @{botUsername} in Telegram
              </a>
            </div>
          )}

          {telegramVerified && (
            <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4 flex items-center gap-3">
              <Shield className="w-5 h-5 text-green-500" />
              <p className="text-sm text-green-400">
                <strong>Verified!</strong> Your Telegram account is linked and
                ready.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border border-[var(--border)] rounded-lg p-5 space-y-3">
            <p className="font-bold text-sm uppercase tracking-wider text-[var(--text-muted)]">
              Setup Guide
            </p>
            <ol className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex gap-2">
                <span className="font-bold text-[var(--accent)] shrink-0">
                  1.
                </span>
                <span>
                  Open{" "}
                  <a
                    href="https://t.me/BotFather"
                    className="text-[#0088cc] underline"
                  >
                    @BotFather
                  </a>{" "}
                  in Telegram
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[var(--accent)] shrink-0">
                  2.
                </span>
                <span>
                  Send{" "}
                  <code className="px-1.5 py-0.5 bg-[var(--bg-card)] rounded text-xs font-mono">
                    /newbot
                  </code>{" "}
                  and follow the prompts
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[var(--accent)] shrink-0">
                  3.
                </span>
                <span>Copy the bot token BotFather gives you</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[var(--accent)] shrink-0">
                  4.
                </span>
                <span>Paste it below</span>
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--text-secondary)]">
              Bot Token
            </label>
            <input
              type="password"
              value={botToken}
              onChange={(e) => onBotTokenChange(e.target.value)}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              className="w-full px-4 py-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm font-mono focus:border-[var(--accent)] focus:outline-none transition-colors"
            />
          </div>

          <button
            onClick={onSubmitBotToken}
            disabled={isValidatingBot || !botToken.trim()}
            className="w-full py-4 bg-[#0088cc] text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isValidatingBot ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <MessageSquare className="w-5 h-5" />
                Verify & Connect Bot
              </>
            )}
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={() => {
            markComplete("telegram");
            onContinue();
          }}
          disabled={!telegramVerified}
          className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Continue
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {errorMessage && (
        <p className="text-red-500 text-sm text-center">{errorMessage}</p>
      )}
    </div>
  );
}
