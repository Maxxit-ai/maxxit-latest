import { ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";

type VersionInfo = {
  installed: string | null;
  latest: string | null;
  updateAvailable: boolean;
};

type Props = {
  walletAddress: string | undefined;
  openclawVersion: VersionInfo | null;
  skillVersion: VersionInfo | null;
  isCheckingVersions: boolean;
  isUpdatingOpenclaw: boolean;
  isUpdatingSkill: boolean;
  versionUpdateMessage: { type: "success" | "error"; text: string } | null;
  showVersionsSection: boolean;
  onToggle: () => void;
  onUpdateOpenclaw: () => void;
  onUpdateSkill: () => void;
};

export function SoftwareUpdatesSection({
  walletAddress,
  openclawVersion,
  skillVersion,
  isCheckingVersions,
  isUpdatingOpenclaw,
  isUpdatingSkill,
  versionUpdateMessage,
  showVersionsSection,
  onToggle,
  onUpdateOpenclaw,
  onUpdateSkill,
}: Props) {
  const hasAnyUpdate =
    openclawVersion?.updateAvailable || skillVersion?.updateAvailable;

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-surface)] rounded-lg">
      <button
        onClick={onToggle}
        className="w-full border-b border-[var(--border)] p-4 flex items-center justify-between hover:bg-[var(--bg-card)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-[var(--accent)]" />
          <h4 className="font-display text-sm">SOFTWARE UPDATES</h4>
          {hasAnyUpdate && (
            <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">
              Update available
            </span>
          )}
        </div>
        {showVersionsSection ? (
          <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        )}
      </button>

      {showVersionsSection && (
        <div className="p-4 space-y-4">
          {isCheckingVersions ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              {versionUpdateMessage && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    versionUpdateMessage.type === "success"
                      ? "border border-green-500/50 bg-green-500/10 text-green-400"
                      : "border border-red-500/50 bg-red-500/10 text-red-400"
                  }`}
                >
                  {versionUpdateMessage.text}
                </div>
              )}

              {/* OpenClaw version */}
              <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">OpenClaw</p>
                  {openclawVersion?.updateAvailable ? (
                    <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">
                      Update available
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                      Up to date
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[var(--text-muted)]">Installed</p>
                    <p className="font-mono">
                      {openclawVersion?.installed ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)]">Latest</p>
                    <p className="font-mono">
                      {openclawVersion?.latest ?? "—"}
                    </p>
                  </div>
                </div>
                {openclawVersion?.updateAvailable && (
                  <button
                    onClick={onUpdateOpenclaw}
                    disabled={isUpdatingOpenclaw || !walletAddress}
                    className="w-full py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isUpdatingOpenclaw ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Update OpenClaw
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Skill version */}
              <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Lazy Trading Skill</p>
                  {skillVersion?.updateAvailable ? (
                    <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">
                      Update available
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                      Up to date
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[var(--text-muted)]">Installed</p>
                    <p className="font-mono">
                      {skillVersion?.installed ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)]">Latest</p>
                    <p className="font-mono">{skillVersion?.latest ?? "—"}</p>
                  </div>
                </div>
                {skillVersion?.updateAvailable && (
                  <button
                    onClick={onUpdateSkill}
                    disabled={isUpdatingSkill || !walletAddress}
                    className="w-full py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isUpdatingSkill ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Update Skill
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
