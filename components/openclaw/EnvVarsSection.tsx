import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";

type EnvVar = { key: string; value: string };

type Props = {
  walletAddress: string | undefined;
  envVars: EnvVar[];
  isLoadingEnvVars: boolean;
  isAddingEnvVar: boolean;
  newEnvKey: string;
  newEnvValue: string;
  onNewEnvKeyChange: (v: string) => void;
  onNewEnvValueChange: (v: string) => void;
  envVarMessage: { type: "success" | "error"; text: string } | null;
  showEnvVarsSection: boolean;
  onToggle: () => void;
  revealedEnvVars: Set<string>;
  onToggleReveal: (key: string) => void;
  deletingEnvKey: string | null;
  onAddEnvVar: () => void;
  onDeleteEnvVar: (key: string) => void;
};

export function EnvVarsSection({
  walletAddress,
  envVars,
  isLoadingEnvVars,
  isAddingEnvVar,
  newEnvKey,
  newEnvValue,
  onNewEnvKeyChange,
  onNewEnvValueChange,
  envVarMessage,
  showEnvVarsSection,
  onToggle,
  revealedEnvVars,
  onToggleReveal,
  deletingEnvKey,
  onAddEnvVar,
  onDeleteEnvVar,
}: Props) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-surface)] rounded-lg">
      <button
        onClick={onToggle}
        className="w-full border-b border-[var(--border)] p-4 flex items-center justify-between hover:bg-[var(--bg-card)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[var(--accent)]" />
          <h4 className="font-display text-sm">ENVIRONMENT VARIABLES</h4>
          {envVars.length > 0 && (
            <span className="text-xs px-2 py-0.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full text-[var(--text-muted)]">
              {envVars.length}
            </span>
          )}
        </div>
        {showEnvVarsSection ? (
          <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        )}
      </button>

      {showEnvVarsSection && (
        <div className="p-4 space-y-4">
          {envVarMessage && (
            <div
              className={`rounded-lg p-3 text-sm ${
                envVarMessage.type === "success"
                  ? "border border-green-500/50 bg-green-500/10 text-green-400"
                  : "border border-red-500/50 bg-red-500/10 text-red-400"
              }`}
            >
              {envVarMessage.text}
            </div>
          )}

          {isLoadingEnvVars ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              {envVars.length > 0 ? (
                <div className="space-y-2">
                  {envVars.map((ev) => (
                    <div
                      key={ev.key}
                      className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono font-semibold text-[var(--text-secondary)] truncate">
                          {ev.key}
                        </p>
                        <p className="text-xs font-mono text-[var(--text-muted)] truncate">
                          {revealedEnvVars.has(ev.key)
                            ? ev.value
                            : "••••••••••••"}
                        </p>
                      </div>
                      <button
                        onClick={() => onToggleReveal(ev.key)}
                        className="p-1.5 hover:text-[var(--accent)] transition-colors"
                      >
                        {revealedEnvVars.has(ev.key) ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteEnvVar(ev.key)}
                        disabled={deletingEnvKey === ev.key}
                        className="p-1.5 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        {deletingEnvKey === ev.key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">
                  No environment variables set.
                </p>
              )}

              <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold">Add Variable</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newEnvKey}
                    onChange={(e) => onNewEnvKeyChange(e.target.value)}
                    placeholder="KEY"
                    className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-xs font-mono focus:border-[var(--accent)] focus:outline-none transition-colors uppercase"
                  />
                  <input
                    type="text"
                    value={newEnvValue}
                    onChange={(e) => onNewEnvValueChange(e.target.value)}
                    placeholder="value"
                    className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-xs font-mono focus:border-[var(--accent)] focus:outline-none transition-colors"
                  />
                </div>
                <button
                  onClick={onAddEnvVar}
                  disabled={
                    isAddingEnvVar ||
                    !newEnvKey.trim() ||
                    !newEnvValue.trim() ||
                    !walletAddress
                  }
                  className="w-full py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isAddingEnvVar ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add Variable
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
