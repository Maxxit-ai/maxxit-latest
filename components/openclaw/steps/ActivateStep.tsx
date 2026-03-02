import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  MessageSquare,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { EigenVerificationRecord, MODEL_OPTIONS, PLAN_OPTIONS, PlanId } from "../types";
import { EigenAISection } from "../EigenAISection";
import { EnvVarsSection } from "../EnvVarsSection";
import { LlmCreditsSection } from "../LlmCreditsSection";
import { SoftwareUpdatesSection } from "../SoftwareUpdatesSection";

type VersionInfo = {
  installed: string | null;
  latest: string | null;
  updateAvailable: boolean;
};

type LlmBalance = {
  balanceCents: number;
  totalPurchased: number;
  totalUsed: number;
  limitReached: boolean;
};

type Props = {
  activated: boolean;
  instanceStatusPhase: string | null;
  instanceStatusMessage: string;
  selectedPlan: PlanId;
  selectedModel: string;
  telegramUsername: string | null;
  openaiKeyStatus: "not_created" | "creating" | "created";
  openaiKeyPrefix: string | null;
  maxxitApiKey: string | null;
  maxxitApiKeyPrefix: string | null;
  isLoading: boolean;
  errorMessage: string;
  onBack: () => void;
  onActivate: () => void;
  botUsername: string | null;
  welcomeImage: { src: string };
  walletAddress: string | undefined;
  // LLM credits
  llmBalance: LlmBalance | null;
  isLoadingLlmBalance: boolean;
  llmBalanceError: string | null;
  llmTopUpSuccess: boolean;
  selectedTopUpAmount: number;
  onSelectTopUpAmount: (cents: number) => void;
  isRedirecting: boolean;
  onTopUp: () => void;
  // Software updates
  openclawVersion: VersionInfo | null;
  skillVersion: VersionInfo | null;
  isCheckingVersions: boolean;
  isUpdatingOpenclaw: boolean;
  isUpdatingSkill: boolean;
  versionUpdateMessage: { type: "success" | "error"; text: string } | null;
  showVersionsSection: boolean;
  onToggleVersions: () => void;
  onUpdateOpenclaw: () => void;
  onUpdateSkill: () => void;
  // Env vars
  envVars: { key: string; value: string }[];
  isLoadingEnvVars: boolean;
  isAddingEnvVar: boolean;
  newEnvKey: string;
  newEnvValue: string;
  onNewEnvKeyChange: (v: string) => void;
  onNewEnvValueChange: (v: string) => void;
  envVarMessage: { type: "success" | "error"; text: string } | null;
  showEnvVarsSection: boolean;
  onToggleEnvVars: () => void;
  revealedEnvVars: Set<string>;
  onToggleRevealEnvVar: (key: string) => void;
  deletingEnvKey: string | null;
  onAddEnvVar: () => void;
  onDeleteEnvVar: (key: string) => void;
  // EigenAI
  eigenRecords: EigenVerificationRecord[];
  eigenRecordsLoading: boolean;
  eigenRecordsError: string | null;
  showEigenSection: boolean;
  onToggleEigen: () => void;
  onRefreshEigen: () => void;
  onVerifyEigen: (record: EigenVerificationRecord) => void;
};

export function ActivateStep({
  activated,
  instanceStatusPhase,
  instanceStatusMessage,
  selectedPlan,
  selectedModel,
  telegramUsername,
  openaiKeyStatus,
  openaiKeyPrefix,
  maxxitApiKey,
  maxxitApiKeyPrefix,
  isLoading,
  errorMessage,
  onBack,
  onActivate,
  botUsername,
  welcomeImage,
  walletAddress,
  llmBalance,
  isLoadingLlmBalance,
  llmBalanceError,
  llmTopUpSuccess,
  selectedTopUpAmount,
  onSelectTopUpAmount,
  isRedirecting,
  onTopUp,
  openclawVersion,
  skillVersion,
  isCheckingVersions,
  isUpdatingOpenclaw,
  isUpdatingSkill,
  versionUpdateMessage,
  showVersionsSection,
  onToggleVersions,
  onUpdateOpenclaw,
  onUpdateSkill,
  envVars,
  isLoadingEnvVars,
  isAddingEnvVar,
  newEnvKey,
  newEnvValue,
  onNewEnvKeyChange,
  onNewEnvValueChange,
  envVarMessage,
  showEnvVarsSection,
  onToggleEnvVars,
  revealedEnvVars,
  onToggleRevealEnvVar,
  deletingEnvKey,
  onAddEnvVar,
  onDeleteEnvVar,
  eigenRecords,
  eigenRecordsLoading,
  eigenRecordsError,
  showEigenSection,
  onToggleEigen,
  onRefreshEigen,
  onVerifyEigen,
}: Props) {
  return (
    <div className="space-y-6">
      {activated ? (
        <div className="text-center space-y-6">
          {/* Status icon */}
          <div
            className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
              instanceStatusPhase === "ready"
                ? "bg-[var(--accent)]"
                : instanceStatusPhase === "error"
                ? "bg-red-500"
                : "bg-[var(--accent)]/20"
            }`}
          >
            {instanceStatusPhase === "ready" ? (
              <Check className="w-10 h-10 text-[var(--bg-deep)]" />
            ) : instanceStatusPhase === "error" ? (
              <span className="text-3xl">⚠️</span>
            ) : (
              <Loader2 className="w-10 h-10 animate-spin text-[var(--accent)]" />
            )}
          </div>

          {/* Status heading */}
          <div>
            <h1 className="font-display text-2xl mb-2">
              {instanceStatusPhase === "ready"
                ? "OpenClaw is running"
                : instanceStatusPhase === "error"
                ? "Something went wrong"
                : instanceStatusPhase === "configuring"
                ? "Setting up OpenClaw..."
                : instanceStatusPhase === "checking"
                ? "Running status checks..."
                : instanceStatusPhase === "starting"
                ? "Starting up..."
                : "Launching instance..."}
            </h1>
            <p className="text-[var(--text-secondary)]">
              {instanceStatusPhase === "ready"
                ? "Your instance is live. You should receive a welcome message from your assistant soon as shown below:"
                : instanceStatusPhase === "error"
                ? instanceStatusMessage || "Please try again or contact support."
                : instanceStatusPhase === "configuring"
                ? "Installing packages and configuring your assistant. This may take 2-3 minutes..."
                : instanceStatusMessage || "This may take 1-2 minutes..."}
            </p>
            {instanceStatusPhase === "ready" && (
              <div className="mt-6 border border-[var(--border)] rounded-lg p-6 bg-[var(--bg-card)]">
                <div className="flex items-center justify-center">
                  <img
                    src={welcomeImage.src}
                    alt="Welcome to OpenClaw"
                    className="w-full max-w-md rounded-lg shadow-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Progress steps */}
          {instanceStatusPhase &&
            instanceStatusPhase !== "ready" &&
            instanceStatusPhase !== "error" && (
              <div className="border border-[var(--border)] rounded-lg p-4 space-y-3 text-left">
                {[
                  {
                    phase: "launching",
                    label: "Creating instance",
                    active: ["launching", "starting", "checking", "configuring"],
                  },
                  {
                    phase: "starting",
                    label: "Starting instance",
                    active: ["starting", "checking", "configuring"],
                  },
                  {
                    phase: "checking",
                    label: "Running status checks",
                    active: ["checking", "configuring"],
                  },
                  {
                    phase: "configuring",
                    label: "Configuring OpenClaw",
                    active: ["configuring"],
                  },
                ].map(({ phase, label, active }) => (
                  <div key={phase} className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        active.includes(instanceStatusPhase ?? "")
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--border)]"
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        instanceStatusPhase === phase
                          ? "text-[var(--accent)] font-medium"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            )}

          {/* Summary card */}
          <div className="border border-[var(--border)] rounded-lg p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Plan</span>
              <span className="font-semibold">
                {PLAN_OPTIONS.find((p) => p.id === selectedPlan)?.name}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Model</span>
              <span className="font-semibold">
                {MODEL_OPTIONS.find((m) => m.id === selectedModel)?.name}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Telegram</span>
              <span className="font-semibold text-[var(--accent)]">
                {telegramUsername ? `@${telegramUsername}` : "Connected"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">OpenAI Key</span>
              <span className="font-semibold text-[var(--accent)]">
                {openaiKeyStatus === "created" ? "Created" : "Not Created"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">LLM Credits</span>
              <Link
                href="/llm-credit-history"
                className="font-semibold text-[var(--accent)] hover:underline"
              >
                View History
              </Link>
            </div>
          </div>

          {/* LLM Credits */}
          <LlmCreditsSection
            llmBalance={llmBalance}
            isLoadingLlmBalance={isLoadingLlmBalance}
            llmBalanceError={llmBalanceError}
            llmTopUpSuccess={llmTopUpSuccess}
            selectedTopUpAmount={selectedTopUpAmount}
            onSelectTopUpAmount={onSelectTopUpAmount}
            isRedirecting={isRedirecting}
            onTopUp={onTopUp}
          />

          {/* Software Updates */}
          <SoftwareUpdatesSection
            walletAddress={walletAddress}
            openclawVersion={openclawVersion}
            skillVersion={skillVersion}
            isCheckingVersions={isCheckingVersions}
            isUpdatingOpenclaw={isUpdatingOpenclaw}
            isUpdatingSkill={isUpdatingSkill}
            versionUpdateMessage={versionUpdateMessage}
            showVersionsSection={showVersionsSection}
            onToggle={onToggleVersions}
            onUpdateOpenclaw={onUpdateOpenclaw}
            onUpdateSkill={onUpdateSkill}
          />

          {/* Env Vars */}
          <EnvVarsSection
            walletAddress={walletAddress}
            envVars={envVars}
            isLoadingEnvVars={isLoadingEnvVars}
            isAddingEnvVar={isAddingEnvVar}
            newEnvKey={newEnvKey}
            newEnvValue={newEnvValue}
            onNewEnvKeyChange={onNewEnvKeyChange}
            onNewEnvValueChange={onNewEnvValueChange}
            envVarMessage={envVarMessage}
            showEnvVarsSection={showEnvVarsSection}
            onToggle={onToggleEnvVars}
            revealedEnvVars={revealedEnvVars}
            onToggleReveal={onToggleRevealEnvVar}
            deletingEnvKey={deletingEnvKey}
            onAddEnvVar={onAddEnvVar}
            onDeleteEnvVar={onDeleteEnvVar}
          />

          {/* EigenAI */}
          <EigenAISection
            walletAddress={walletAddress}
            eigenRecords={eigenRecords}
            eigenRecordsLoading={eigenRecordsLoading}
            eigenRecordsError={eigenRecordsError}
            showEigenSection={showEigenSection}
            onToggle={onToggleEigen}
            onRefresh={onRefreshEigen}
            onVerify={onVerifyEigen}
          />

          {/* Open Telegram */}
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full py-4 font-bold rounded-lg flex items-center justify-center gap-2 transition-opacity ${
              instanceStatusPhase === "ready"
                ? "bg-[#0088cc] text-white hover:opacity-90"
                : "bg-[#0088cc]/50 text-white/70 cursor-not-allowed"
            }`}
            onClick={(e) => {
              if (instanceStatusPhase !== "ready") e.preventDefault();
            }}
          >
            <MessageSquare className="w-5 h-5" />
            {instanceStatusPhase === "ready"
              ? "Open Telegram"
              : "Waiting for instance..."}
            {instanceStatusPhase === "ready" && (
              <ExternalLink className="w-4 h-4" />
            )}
          </a>
        </div>
      ) : (
        <>
          {/* Pre-launch review */}
          <div className="text-center">
            <h1 className="font-display text-2xl mb-2">
              Launch your OpenClaw
            </h1>
            <p className="text-[var(--text-secondary)]">
              Review your setup and spin up your instance.
            </p>
          </div>

          <div className="border border-[var(--border)] rounded-lg p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Plan</span>
              <span className="font-semibold">
                {PLAN_OPTIONS.find((p) => p.id === selectedPlan)?.name} —{" "}
                {PLAN_OPTIONS.find((p) => p.id === selectedPlan)?.priceLabel}
              </span>
            </div>
            <div className="h-px bg-[var(--border)]" />
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Model</span>
              <span className="font-semibold">
                {MODEL_OPTIONS.find((m) => m.id === selectedModel)?.name}
              </span>
            </div>
            <div className="h-px bg-[var(--border)]" />
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Telegram</span>
              <span className="font-semibold text-[var(--accent)]">
                {telegramUsername ? `@${telegramUsername}` : "Connected"}
              </span>
            </div>
            <div className="h-px bg-[var(--border)]" />
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">OpenAI Key</span>
              <span className="font-semibold text-[var(--accent)]">
                {openaiKeyStatus === "created" ? "Created" : "Not Created"}
              </span>
            </div>
            {openaiKeyStatus === "created" && openaiKeyPrefix && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-[var(--text-muted)]">
                  OpenAI Key Prefix
                </span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {openaiKeyPrefix}
                </span>
              </div>
            )}
            {(maxxitApiKey || maxxitApiKeyPrefix) && (
              <>
                <div className="h-px bg-[var(--border)] mt-3" />
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">
                    Maxxit API Key
                  </span>
                  <span className="font-mono text-[var(--text-secondary)] break-all max-w-[60%] text-right">
                    {maxxitApiKeyPrefix
                      ? `${maxxitApiKeyPrefix}...`
                      : maxxitApiKey
                      ? `${maxxitApiKey.slice(0, 12)}...`
                      : ""}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={onActivate}
              disabled={isLoading || openaiKeyStatus !== "created"}
              className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Launch OpenClaw
                </>
              )}
            </button>
          </div>
        </>
      )}
      {errorMessage && (
        <p className="text-red-500 text-sm text-center">{errorMessage}</p>
      )}
    </div>
  );
}
