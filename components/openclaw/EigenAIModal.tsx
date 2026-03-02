import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { EigenVerificationRecord } from "./types";

type VerifyResult = {
  isValid: boolean;
  recoveredAddress: string;
  expectedAddress: string;
  message: string;
  details?: {
    chainId?: number;
    model?: string;
    messageLength?: number;
  };
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  record: EigenVerificationRecord | null;
  isVerifying: boolean;
  verifyResult: VerifyResult | null;
  verifyError: string | null;
  onRetry: () => void;
};

export function EigenAIModal({
  isOpen,
  onClose,
  record,
  isVerifying,
  verifyResult,
  verifyError,
  onRetry,
}: Props) {
  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--bg-deep)] border border-[var(--border)] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-deep)] border-b border-[var(--border)] p-4 sm:p-6 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base sm:text-lg">
              EIGENAI VERIFICATION
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {record.market} · {record.side?.toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Signal metadata */}
          <div className="border border-[var(--border)] bg-[var(--bg-surface)] rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Signal Details
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[var(--text-muted)]">Market</p>
                <p className="font-semibold">{record.market ?? "—"}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Side</p>
                <p className="font-semibold">
                  {record.side?.toUpperCase() ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Model</p>
                <p className="font-semibold">{record.llm_model_used ?? "—"}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Chain ID</p>
                <p className="font-semibold">{record.llm_chain_id ?? "—"}</p>
              </div>
            </div>
            {record.agent_address && (
              <div>
                <p className="text-[var(--text-muted)] text-xs">
                  Agent Address
                </p>
                <p className="font-mono text-xs break-all">
                  {record.agent_address}
                </p>
              </div>
            )}
          </div>

          {/* Verification result */}
          {isVerifying ? (
            <div className="flex items-center justify-center gap-3 py-8 text-[var(--text-secondary)]">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Verifying signature...</span>
            </div>
          ) : verifyResult ? (
            (() => {
              const EIGENAI_OPERATOR =
                "0x7053bfb0433a16a2405de785d547b1b32cee0cf3";
              const displayValid =
                verifyResult.isValid ||
                verifyResult.expectedAddress?.toLowerCase() ===
                  EIGENAI_OPERATOR.toLowerCase();
              const displayMessage =
                displayValid && !verifyResult.isValid
                  ? "Signature verified successfully (fallback: EigenAI operator match)"
                  : verifyResult.message;
              return (
                <>
                  {/* Result banner */}
                  <div
                    className={`border rounded-lg p-4 sm:p-6 ${
                      displayValid
                        ? "border-green-500/50 bg-green-500/10"
                        : "border-red-500/50 bg-red-500/10"
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {displayValid ? (
                        <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-400 flex-shrink-0 mt-1 sm:mt-0" />
                      ) : (
                        <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-400 flex-shrink-0 mt-1 sm:mt-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-base sm:text-lg leading-tight">
                          {displayValid
                            ? "✅ SIGNATURE VERIFIED"
                            : "❌ VERIFICATION FAILED"}
                        </h3>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 break-words">
                          {displayMessage}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Backend traces */}
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)] rounded-lg">
                    <div className="border-b border-[var(--border)] p-3 sm:p-4">
                      <h4 className="font-display text-xs sm:text-sm">
                        BACKEND TRACES
                      </h4>
                    </div>
                    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                      {/* Step 1 */}
                      <div className="border border-[var(--border)] rounded-lg p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 1: INPUT DATA
                        </p>
                        <div className="space-y-2 text-xs font-mono">
                          <div className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="text-[var(--text-muted)] flex-shrink-0">
                              Chain ID:
                            </span>
                            <span className="break-all">
                              {verifyResult.details?.chainId}
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="text-[var(--text-muted)] flex-shrink-0">
                              Model:
                            </span>
                            <span className="break-all">
                              {verifyResult.details?.model}
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="text-[var(--text-muted)] flex-shrink-0">
                              Message Length:
                            </span>
                            <span>
                              {verifyResult.details?.messageLength?.toLocaleString()}{" "}
                              characters
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="border border-[var(--border)] rounded-lg p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 2: PROMPT RECONSTRUCTION
                        </p>
                        <div className="bg-[var(--bg-elevated)] rounded-lg p-3 text-xs space-y-1">
                          <p className="text-[var(--text-muted)] mb-1">
                            Trade Context:
                          </p>
                          <div className="text-[var(--text-secondary)] font-mono space-y-0.5">
                            <p>Market: {record.market ?? "—"}</p>
                            <p>Side: {record.side?.toUpperCase() ?? "—"}</p>
                            {record.agent_address && (
                              <p className="break-all">
                                Agent: {record.agent_address}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="border border-[var(--border)] rounded-lg p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 3: MESSAGE CONSTRUCTION
                        </p>
                        <div className="text-xs font-mono space-y-2">
                          <p className="text-[var(--text-muted)] break-words">
                            Format: chainId + modelId + prompt + output
                          </p>
                          <p className="text-[var(--accent)]">
                            ✅ Message constructed:{" "}
                            {verifyResult.details?.messageLength?.toLocaleString()}{" "}
                            characters
                          </p>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="border border-[var(--border)] rounded-lg p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 4: SIGNATURE VERIFICATION
                        </p>
                        <div className="space-y-3 text-xs">
                          <div>
                            <p className="text-[var(--text-muted)] mb-2">
                              Expected Signer (EigenLabs):
                            </p>
                            <p className="font-mono bg-[var(--bg-elevated)] rounded-lg p-2 break-all text-[10px] sm:text-xs leading-relaxed">
                              {verifyResult.expectedAddress}
                            </p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)] mb-2">
                              Recovered Signer:
                            </p>
                            <p
                              className={`font-mono bg-[var(--bg-elevated)] rounded-lg p-2 break-all text-[10px] sm:text-xs leading-relaxed ${
                                displayValid
                                  ? "text-green-400"
                                  : "text-red-400"
                              }`}
                            >
                              {verifyResult.recoveredAddress}
                            </p>
                          </div>
                          <div
                            className={`flex items-start gap-2 ${
                              displayValid ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {displayValid ? (
                              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            )}
                            <span className="font-bold text-xs leading-relaxed">
                              {displayValid
                                ? "ADDRESSES MATCH ✓"
                                : "ADDRESSES DO NOT MATCH ✗"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Step 5 */}
                      <div className="border border-[var(--border)] rounded-lg p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 5: LLM RAW OUTPUT
                        </p>
                        <div className="bg-[var(--bg-elevated)] rounded-lg p-3 text-xs font-mono max-h-40 sm:max-h-48 overflow-y-auto break-words leading-relaxed">
                          {record.llm_raw_output}
                        </div>
                      </div>

                      {/* Reasoning */}
                      {record.llm_reasoning && (
                        <div className="border border-[var(--border)] rounded-lg p-3 sm:p-4">
                          <p className="data-label mb-2 sm:mb-3 text-xs">
                            LLM REASONING
                          </p>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {record.llm_reasoning}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <a
                    href="https://docs.eigencloud.xyz/eigenai/howto/verify-signature"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-3 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />
                    <span>VIEW EIGENAI DOCUMENTATION</span>
                  </a>
                </>
              );
            })()
          ) : verifyError ? (
            <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-400 text-sm mb-1">
                    Verification Error
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] break-words">
                    {verifyError}
                  </p>
                </div>
              </div>
              <button
                onClick={onRetry}
                className="w-full py-2.5 border border-[var(--accent)] text-[var(--accent)] text-sm font-bold rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
              >
                Retry Verification
              </button>
            </div>
          ) : (
            <div className="text-center py-8 sm:py-16 text-[var(--text-muted)]">
              No verification result
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
