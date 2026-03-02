import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { EigenVerificationRecord } from "./types";

type Props = {
  walletAddress: string | undefined;
  eigenRecords: EigenVerificationRecord[];
  eigenRecordsLoading: boolean;
  eigenRecordsError: string | null;
  showEigenSection: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onVerify: (record: EigenVerificationRecord) => void;
};

export function EigenAISection({
  walletAddress,
  eigenRecords,
  eigenRecordsLoading,
  eigenRecordsError,
  showEigenSection,
  onToggle,
  onRefresh,
  onVerify,
}: Props) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-surface)] rounded-lg">
      <button
        onClick={onToggle}
        className="w-full border-b border-[var(--border)] p-4 flex items-center justify-between hover:bg-[var(--bg-card)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--accent)]" />
          <h4 className="font-display text-sm">EIGENAI VERIFICATION</h4>
          {eigenRecords.length > 0 && (
            <span className="text-xs px-2 py-0.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full text-[var(--text-muted)]">
              {eigenRecords.length}
            </span>
          )}
        </div>
        {showEigenSection ? (
          <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        )}
      </button>

      {showEigenSection && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">
              Cryptographically verify AI trade signals via EigenAI.
            </p>
            <button
              onClick={onRefresh}
              disabled={eigenRecordsLoading || !walletAddress}
              className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${eigenRecordsLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>

          {eigenRecordsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : eigenRecordsError ? (
            <p className="text-sm text-red-400">{eigenRecordsError}</p>
          ) : eigenRecords.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)]">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No trade signals recorded yet.</p>
              <p className="text-xs mt-1">
                Signals appear here after your bot executes trades.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {eigenRecords.map((record) => (
                <div
                  key={record.id}
                  className="border border-[var(--border)] rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          record.side === "buy"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {record.side?.toUpperCase() ?? "—"}
                      </span>
                      <span className="text-sm font-semibold truncate">
                        {record.market ?? "Unknown"}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      {new Date(record.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {record.agent_address && (
                    <p className="text-xs font-mono text-[var(--text-muted)] truncate">
                      Agent: {record.agent_address}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onVerify(record)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[var(--accent)] text-[var(--accent)] rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Verify Signature
                    </button>
                    <a
                      href="https://docs.eigencloud.xyz/eigenai/howto/verify-signature"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Docs
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
