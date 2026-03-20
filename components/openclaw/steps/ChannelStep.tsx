import { useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquare,
  Pencil,
  Shield,
} from "lucide-react";
import { StepKey } from "../types";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

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
  const [isEditingWhatsapp, setIsEditingWhatsapp] = useState(false);

  const canContinue =
    (selectedChannels.includes("telegram") && telegramVerified) ||
    (selectedChannels.includes("whatsapp") && whatsappPhoneSaved && !isEditingWhatsapp);

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
            <WhatsAppIcon
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
            <WhatsAppIcon className="w-5 h-5 text-green-500" />
            <h3 className="font-bold">WhatsApp Setup</h3>
          </div>

          {whatsappPhoneSaved && !isEditingWhatsapp ? (
            <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500 shrink-0" />
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
              <button
                onClick={() => setIsEditingWhatsapp(true)}
                className="shrink-0 p-1.5 rounded hover:bg-green-500/20 text-green-400 hover:text-green-300 transition-colors"
                title="Edit phone number"
              >
                <Pencil className="w-4 h-4" />
              </button>
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

              <div className="flex gap-2">
                {isEditingWhatsapp && (
                  <button
                    onClick={() => setIsEditingWhatsapp(false)}
                    className="px-4 py-2 border border-[var(--border)] rounded text-sm font-medium hover:border-[var(--text-muted)] transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => {
                    onSubmitWhatsappPhone();
                    setIsEditingWhatsapp(false);
                  }}
                  disabled={isSubmittingWhatsapp || !whatsappPhoneNumber.trim()}
                  className="flex-1 py-2 bg-green-500 text-white font-bold rounded flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
                >
                  {isSubmittingWhatsapp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <WhatsAppIcon className="w-4 h-4" />
                      {isEditingWhatsapp ? "Update Number" : "Save Phone Number"}
                    </>
                  )}
                </button>
              </div>
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
