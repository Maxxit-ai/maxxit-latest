import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquare,
  Phone,
  Shield,
} from "lucide-react";
import { StepKey } from "../types";

type ChannelType = "telegram" | "whatsapp";

type Props = {
  // Channel selection
  selectedChannels: ChannelType[];
  onChannelSelectionChange: (channels: ChannelType[]) => void;

  // Telegram props
  telegramLinked: boolean;
  telegramVerified: boolean;
  botUsername: string | null;
  botToken: string;
  onBotTokenChange: (token: string) => void;
  isValidatingBot: boolean;
  onSubmitBotToken: () => void;

  // WhatsApp props
  whatsappPhoneNumber: string;
  onWhatsappPhoneNumberChange: (phone: string) => void;
  whatsappPhoneSaved: boolean;
  onSubmitWhatsappPhone: () => void;
  isSubmittingWhatsapp?: boolean;

  // Common props
  errorMessage: string;
  onBack: () => void;
  onContinue: () => void;
  markComplete: (key: StepKey) => void;
};

export function ChannelStep({
  selectedChannels,
  onChannelSelectionChange,
  telegramLinked,
  telegramVerified,
  botUsername,
  botToken,
  onBotTokenChange,
  isValidatingBot,
  onSubmitBotToken,
  whatsappPhoneNumber,
  onWhatsappPhoneNumberChange,
  whatsappPhoneSaved,
  onSubmitWhatsappPhone,
  isSubmittingWhatsapp,
  errorMessage,
  onBack,
  onContinue,
  markComplete,
}: Props) {
  const canContinue =
    (selectedChannels.includes("telegram") && telegramVerified) ||
    (selectedChannels.includes("whatsapp") && whatsappPhoneSaved);

  const toggleChannel = (channel: ChannelType) => {
    if (selectedChannels.includes(channel)) {
      if (selectedChannels.length > 1) {
        onChannelSelectionChange(
          selectedChannels.filter((c) => c !== channel)
        );
      }
    } else {
      onChannelSelectionChange([...selectedChannels, channel]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-2xl mb-2">
          Choose Your Channels
        </h1>
        <p className="text-[var(--text-secondary)]">
          Select how you want to communicate with your AI assistant.
        </p>
      </div>

      {/* Channel Selection */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-[var(--text-secondary)]">
          Communication Channels
        </label>
        <div className="grid grid-cols-2 gap-3">
          {/* Telegram Option */}
          <button
            onClick={() => toggleChannel("telegram")}
            className={`p-4 border rounded-lg flex flex-col items-center gap-2 transition-all ${
              selectedChannels.includes("telegram")
                ? "border-[#0088cc] bg-[#0088cc]/10"
                : "border-[var(--border)] hover:border-[var(--text-muted)]"
            }`}
          >
            <MessageSquare
              className={`w-6 h-6 ${
                selectedChannels.includes("telegram")
                  ? "text-[#0088cc]"
                  : "text-[var(--text-muted)]"
              }`}
            />
            <span
              className={`font-medium text-sm ${
                selectedChannels.includes("telegram")
                  ? "text-[#0088cc]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              Telegram
            </span>
            {telegramVerified && (
              <Check className="w-4 h-4 text-green-500" />
            )}
          </button>

          {/* WhatsApp Option */}
          <button
            onClick={() => toggleChannel("whatsapp")}
            className={`p-4 border rounded-lg flex flex-col items-center gap-2 transition-all ${
              selectedChannels.includes("whatsapp")
                ? "border-green-500 bg-green-500/10"
                : "border-[var(--border)] hover:border-[var(--text-muted)]"
            }`}
          >
            <Phone
              className={`w-6 h-6 ${
                selectedChannels.includes("whatsapp")
                  ? "text-green-500"
                  : "text-[var(--text-muted)]"
              }`}
            />
            <span
              className={`font-medium text-sm ${
                selectedChannels.includes("whatsapp")
                  ? "text-green-500"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              WhatsApp
            </span>
            {whatsappPhoneSaved && (
              <Check className="w-4 h-4 text-green-500" />
            )}
          </button>
        </div>
      </div>

      {/* Telegram Section */}
      {selectedChannels.includes("telegram") && (
        <div className="border border-[var(--border)] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#0088cc]" />
            <h3 className="font-bold">Telegram Setup</h3>
          </div>

          {telegramLinked ? (
            <div className="space-y-3">
              <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-4 text-center">
                <Check className="w-6 h-6 mx-auto text-[var(--accent)] mb-2" />
                <p className="font-bold text-sm">
                  Bot connected{botUsername ? ` — @${botUsername}` : ""}
                </p>
              </div>

              {!telegramVerified && (
                <div className="border border-yellow-500/50 bg-yellow-500/10 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-yellow-500" />
                    <p className="font-bold text-yellow-500 text-sm">
                      Verification Required
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Send any message to your bot{" "}
                    <strong>@{botUsername}</strong> to verify.
                  </p>
                  <a
                    href={`https://t.me/${botUsername}`}
                    target="_blank"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#0088cc] text-white rounded text-xs font-medium hover:opacity-90"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open in Telegram
                  </a>
                </div>
              )}

              {telegramVerified && (
                <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-green-400">
                    <strong>Verified!</strong> Your Telegram account is linked.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Create a bot via{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  className="text-[#0088cc] underline"
                >
                  @BotFather
                </a>{" "}
                using <code className="px-1 bg-[var(--bg-card)] rounded text-xs">/newbot</code>
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  Bot Token
                </label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => onBotTokenChange(e.target.value)}
                  placeholder="123456789:ABCdefGHI..."
                  className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs font-mono focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <button
                onClick={onSubmitBotToken}
                disabled={isValidatingBot || !botToken.trim()}
                className="w-full py-2 bg-[#0088cc] text-white font-bold rounded flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
              >
                {isValidatingBot ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    Connect Bot
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp Section */}
      {selectedChannels.includes("whatsapp") && (
        <div className="border border-[var(--border)] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-green-500" />
            <h3 className="font-bold">WhatsApp Setup</h3>
          </div>

          {whatsappPhoneSaved ? (
            <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-bold text-sm text-green-400">
                  Phone number saved
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {whatsappPhoneNumber}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  You will scan a QR code after your instance is ready.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                Enter your WhatsApp phone number in E.164 format. This will be used to configure your instance.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  Phone Number (E.164 format)
                </label>
                <input
                  type="tel"
                  value={whatsappPhoneNumber}
                  onChange={(e) => onWhatsappPhoneNumberChange(e.target.value)}
                  placeholder="+15551234567"
                  className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded text-sm font-mono focus:border-green-500 focus:outline-none"
                />
                <p className="text-xs text-[var(--text-muted)]">
                  Include country code (e.g., +1 for US, +44 for UK).
                </p>
              </div>

              <button
                onClick={onSubmitWhatsappPhone}
                disabled={isSubmittingWhatsapp || !whatsappPhoneNumber.trim()}
                className="w-full py-2 bg-green-500 text-white font-bold rounded flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
              >
                {isSubmittingWhatsapp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Phone className="w-4 h-4" />
                    Save Phone Number
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
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
          disabled={!canContinue}
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
