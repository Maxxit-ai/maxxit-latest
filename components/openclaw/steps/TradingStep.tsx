import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";
import { SkillSubStep, StepKey } from "../types";

type Props = {
  walletAddress: string | undefined;
  errorMessage: string;
  onErrorMessage: (msg: string) => void;
  // Lazy trading
  lazyTradingEnabled: boolean;
  onSetLazyTradingEnabled: (v: boolean) => void;
  lazyTradingSetupComplete: boolean;
  onSetLazyTradingSetupComplete: (v: boolean) => void;
  maxxitApiKey: string | null;
  skillSubStep: SkillSubStep;
  onSetSkillSubStep: (s: SkillSubStep) => void;
  tradingAgentId: string | null;
  onSetTradingAgentId: (id: string | null) => void;
  ostiumAgentAddress: string | null;
  onSetOstiumAgentAddress: (addr: string | null) => void;
  delegationComplete: boolean;
  onSetDelegationComplete: (v: boolean) => void;
  allowanceComplete: boolean;
  onSetAllowanceComplete: (v: boolean) => void;
  skillTxHash: string | null;
  onSetSkillTxHash: (h: string | null) => void;
  skillCurrentAction: string;
  onSetSkillCurrentAction: (a: string) => void;
  agentSetupSource: "ostium" | "aster" | null;
  onSetAgentSetupSource: (s: "ostium" | "aster" | null) => void;
  enablingTrading: boolean;
  onSetEnablingTrading: (v: boolean) => void;
  hasDeployment: boolean;
  deploymentEnabledVenues: string[];
  onSetHasDeployment: (v: boolean) => void;
  onSetDeploymentEnabledVenues: (venues: string[]) => void;
  // Aster
  asterEnabled: boolean;
  onSetAsterEnabled: (v: boolean) => void;
  isSavingAsterConfig: boolean;
  onSetIsSavingAsterConfig: (v: boolean) => void;
  asterShowGuide: boolean;
  onSetAsterShowGuide: (v: boolean) => void;
  // Avantis
  avantisEnabled: boolean;
  onSetAvantisEnabled: (v: boolean) => void;
  avantisAgentAddress: string | null;
  onSetAvantisAgentAddress: (addr: string | null) => void;
  avantisDelegationComplete: boolean;
  onSetAvantisDelegationComplete: (v: boolean) => void;
  avantisAllowanceComplete: boolean;
  onSetAvantisAllowanceComplete: (v: boolean) => void;
  avantisSetupComplete: boolean;
  onSetAvantisSetupComplete: (v: boolean) => void;
  avantisSkillSubStep: "idle" | "creating-agent" | "agent-created" | "complete";
  onSetAvantisSkillSubStep: (s: "idle" | "creating-agent" | "agent-created" | "complete") => void;
  enablingAvantisTrading: boolean;
  avantisSkillCurrentAction: string;
  avantisSkillTxHash: string | null;
  // Navigation
  onBack: () => void;
  onContinue: () => void;
  onCreateTradingDeployment: (enabledVenues: string[]) => void;
  onSetupTradingAgent: () => void;
  onEnableTrading: () => void;
  onSetupAvantisAgent: () => void;
  onEnableAvantisTrading: () => void;
  markComplete: (key: StepKey) => void;
};

export function TradingStep({
  walletAddress,
  errorMessage,
  onErrorMessage,
  lazyTradingEnabled,
  onSetLazyTradingEnabled,
  lazyTradingSetupComplete,
  onSetLazyTradingSetupComplete,
  maxxitApiKey,
  skillSubStep,
  onSetSkillSubStep,
  tradingAgentId,
  onSetTradingAgentId,
  ostiumAgentAddress,
  onSetOstiumAgentAddress,
  delegationComplete,
  onSetDelegationComplete,
  allowanceComplete,
  onSetAllowanceComplete,
  skillTxHash,
  skillCurrentAction,
  agentSetupSource,
  onSetAgentSetupSource,
  enablingTrading,
  hasDeployment,
  deploymentEnabledVenues,
  onSetHasDeployment,
  onSetDeploymentEnabledVenues,
  asterEnabled,
  onSetAsterEnabled,
  isSavingAsterConfig,
  onSetIsSavingAsterConfig,
  asterShowGuide,
  onSetAsterShowGuide,
  avantisEnabled,
  onSetAvantisEnabled,
  avantisAgentAddress,
  onSetAvantisAgentAddress,
  avantisDelegationComplete,
  onSetAvantisDelegationComplete,
  avantisAllowanceComplete,
  onSetAvantisAllowanceComplete,
  avantisSetupComplete,
  onSetAvantisSetupComplete,
  avantisSkillSubStep,
  onSetAvantisSkillSubStep,
  enablingAvantisTrading,
  avantisSkillCurrentAction,
  avantisSkillTxHash,
  onBack,
  onContinue,
  onCreateTradingDeployment,
  onSetupTradingAgent,
  onEnableTrading,
  onSetupAvantisAgent,
  onEnableAvantisTrading,
  markComplete,
}: Props) {
  const ostiumSelected =
    lazyTradingEnabled || lazyTradingSetupComplete || skillSubStep !== "idle";
  const avantisSelected =
    avantisEnabled || avantisSetupComplete || avantisSkillSubStep !== "idle";

  const selectedVenues: string[] = [];
  if (ostiumSelected) selectedVenues.push("OSTIUM");
  if (avantisSelected) selectedVenues.push("AVANTIS");

  const ostiumPrereqsReady =
    skillSubStep === "agent-created" && delegationComplete && allowanceComplete;
  const avantisPrereqsReady =
    avantisSkillSubStep === "agent-created" &&
    avantisDelegationComplete &&
    avantisAllowanceComplete;
  const normalizedDeploymentVenues = (deploymentEnabledVenues || []).map((v) =>
    String(v || "").trim().toUpperCase()
  );
  const hasOstiumDeployment = normalizedDeploymentVenues.includes("OSTIUM");

  const isOstiumReady =
    !ostiumSelected || lazyTradingSetupComplete || hasOstiumDeployment || ostiumPrereqsReady;
  const isAvantisReady =
    !avantisSelected || avantisSetupComplete || avantisPrereqsReady;

  const canProceed = selectedVenues.length > 0 && isOstiumReady && isAvantisReady;
  const hasRequiredDeploymentVenues =
    selectedVenues.length > 0 &&
    selectedVenues.every((venue) => normalizedDeploymentVenues.includes(venue));
  const shouldCreateDeployment = canProceed && !hasRequiredDeploymentVenues;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-2xl mb-2">
          Trading Skills
        </h1>
        <p className="text-[var(--text-secondary)]">
          Set up your trading agents for Ostium, Aster, and Avantis via your
          OpenClaw bot.
        </p>
      </div>

      {/* Ostium / Lazy Trading */}
      <div
        className={`border rounded-lg p-5 transition-all ${lazyTradingEnabled
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)]"
          }`}
      >
        <div className="flex items-start gap-4">
          <div className="text-3xl">📈</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold">Maxxit Lazy Trading</h3>
              {lazyTradingEnabled && maxxitApiKey && (
                <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                  Ready
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Execute trades on Ostium by sending message to your OpenClaw bot.
            </p>

            {!lazyTradingEnabled ? (
              <button
                onClick={() => onSetLazyTradingEnabled(true)}
                className="text-sm px-4 py-2 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] transition-colors"
              >
                Enable Skill
              </button>
            ) : lazyTradingSetupComplete || hasDeployment ? (
              <div className="space-y-3">
                <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                  <p className="text-sm text-green-400 mb-2">
                    <strong>Lazy Trading Ready ✓</strong>
                  </p>
                  {maxxitApiKey && (
                    <div className="space-y-1">
                      <p className="text-xs text-[var(--text-muted)]">
                        Maxxit API Key (preview)
                      </p>
                      <code className="text-xs bg-[var(--bg-card)] px-2 py-1 rounded font-mono break-all">
                        {`${maxxitApiKey.slice(0, 12)}...`}
                      </code>
                    </div>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Your trading agent is deployed and ready to execute trades
                    on Ostium.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onSetLazyTradingEnabled(false);
                    onSetSkillSubStep("idle");
                    onSetLazyTradingSetupComplete(false);
                    onSetTradingAgentId(null);
                    onSetOstiumAgentAddress(null);
                    onSetDelegationComplete(false);
                    onSetAllowanceComplete(false);
                    onSetHasDeployment(false);
                    onSetDeploymentEnabledVenues([]);
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Reset Lazy Trading
                </button>
              </div>
            ) : skillSubStep === "idle" || skillSubStep === "creating-agent" ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  We&apos;ll create a dedicated trading agent and set up
                  on-chain permissions.
                </p>
                <button
                  onClick={() => {
                    onSetAgentSetupSource("ostium");
                    onSetupTradingAgent();
                  }}
                  disabled={skillSubStep === "creating-agent"}
                  className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {skillSubStep === "creating-agent" &&
                    agentSetupSource === "ostium" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Creating
                      Agent...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" /> Setup Trading Agent
                    </>
                  )}
                </button>
                <button
                  onClick={() => onSetLazyTradingEnabled(false)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            ) : skillSubStep === "agent-created" ? (
              <div className="space-y-4">
                <div className="border border-[var(--border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--text-muted)] mb-1">
                    Your Trading Agent Address
                  </p>
                  <code className="text-sm font-mono break-all text-[var(--accent)]">
                    {ostiumAgentAddress}
                  </code>
                </div>

                <div className="space-y-3">
                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border ${delegationComplete
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-[var(--border)]"
                      }`}
                  >
                    {delegationComplete ? (
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-[var(--text-muted)] flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-bold">
                        {delegationComplete
                          ? "Delegation Complete"
                          : "Delegate Trading"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Allow your agent to trade on Ostium on your behalf
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border ${allowanceComplete
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-[var(--border)]"
                      }`}
                  >
                    {allowanceComplete ? (
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-[var(--text-muted)] flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-bold">
                        {allowanceComplete ? "USDC Approved" : "Approve USDC"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Allow Ostium to use your USDC for trading
                      </p>
                    </div>
                  </div>
                </div>

                {skillTxHash && (
                  <div className="text-center text-xs text-[var(--text-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                    Confirming transaction...
                  </div>
                )}

                {!delegationComplete || !allowanceComplete ? (
                  <button
                    onClick={onEnableTrading}
                    disabled={enablingTrading}
                    className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {enablingTrading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />{" "}
                        {skillCurrentAction || "Processing..."}
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" /> Enable 1-Click Trading
                      </>
                    )}
                  </button>
                ) : (
                  <div className="border border-green-500/40 bg-green-500/10 rounded-lg p-3 text-xs text-green-300">
                    Ready to create deployment
                  </div>
                )}

                <button
                  onClick={() => {
                    onSetLazyTradingEnabled(false);
                    onSetSkillSubStep("idle");
                    onSetTradingAgentId(null);
                    onSetOstiumAgentAddress(null);
                    onSetDelegationComplete(false);
                    onSetAllowanceComplete(false);
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            ) : skillSubStep === "creating-deployment" ? (
              <div className="flex items-center justify-center gap-2 py-4 text-[var(--text-secondary)]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating deployment...</span>
              </div>
            ) : lazyTradingSetupComplete ? (
              <div className="space-y-3">
                <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4 text-center">
                  <Check className="w-6 h-6 text-green-400 mx-auto mb-1" />
                  <p className="font-bold text-green-400">
                    Trading Setup Complete
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Your Ostium 1-click trading agent is ready. Continue to the
                    next step.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onSetLazyTradingEnabled(false);
                    onSetSkillSubStep("idle");
                    onSetLazyTradingSetupComplete(false);
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Reset
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Aster DEX (Optional) */}
      <div
        className={`border rounded-lg p-5 transition-all ${asterEnabled
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)]"
          }`}
      >
        <div className="flex items-start gap-4">
          <div className="text-3xl">🌟</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-baseline gap-2">
                <h3 className="font-bold">Aster DEX (BNB Chain)</h3>
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Optional
                </span>
              </div>
              {asterEnabled && (
                <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                  Enabled
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Authorize your agent wallet to also trade on Aster DEX (BNB
              Chain).
            </p>

            {!ostiumAgentAddress ? (
              <div className="space-y-3">
                <p className="text-xs text-[var(--text-muted)]">
                  You need a trading agent wallet before enabling Aster.
                </p>
                <button
                  onClick={() => {
                    onSetAgentSetupSource("aster");
                    onSetupTradingAgent();
                  }}
                  disabled={skillSubStep === "creating-agent"}
                  className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {skillSubStep === "creating-agent" &&
                    agentSetupSource === "aster" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Creating
                      Agent...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" /> Setup Trading Agent
                    </>
                  )}
                </button>
              </div>
            ) : asterEnabled ? (
              <div className="space-y-3">
                <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                  <p className="text-sm text-green-400 mb-1">
                    <strong>Aster DEX Enabled ✓</strong>
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Your agent wallet{" "}
                    <code className="bg-[var(--bg-deep)] px-1.5 py-0.5 rounded text-xs">
                      {ostiumAgentAddress}
                    </code>{" "}
                    is authorized for Aster trading.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    onSetIsSavingAsterConfig(true);
                    try {
                      const res = await fetch(
                        "/api/lazy-trading/save-aster-credentials",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            userWallet: walletAddress,
                            enabled: false,
                          }),
                        }
                      );
                      const data = await res.json();
                      if (data.success) onSetAsterEnabled(false);
                    } catch {
                    } finally {
                      onSetIsSavingAsterConfig(false);
                    }
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors"
                >
                  Disable Aster
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg p-3">
                  <p className="text-xs text-[var(--text-muted)] mb-1">
                    Your Agent Address
                  </p>
                  <p className="text-sm font-mono break-all">
                    {ostiumAgentAddress}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">To enable Aster trading:</p>
                  <ol className="text-sm text-[var(--text-secondary)] list-decimal list-inside space-y-1">
                    <li>Go to Aster&apos;s API Wallet page</li>
                    <li>Click &quot;Authorize new API wallet&quot;</li>
                    <li>
                      Paste your above given agent address as the &quot;API
                      wallet address&quot;
                    </li>
                    <li>
                      Select API options: <strong>Read</strong>,{" "}
                      <strong>Perps trading</strong>, and{" "}
                      <strong>Spot trading</strong>
                    </li>
                    <li>
                      Click &quot;Authorize&quot; to grant those permissions
                    </li>
                    <li>
                      Come back here and click &quot;Enable Aster&quot;
                    </li>
                  </ol>
                </div>

                <button
                  onClick={() => onSetAsterShowGuide(!asterShowGuide)}
                  className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                >
                  {asterShowGuide ? "Hide" : "Show"} visual guide ▾
                </button>

                {asterShowGuide && (
                  <div className="space-y-3">
                    <div className="rounded-lg overflow-hidden border border-[var(--border)]">
                      <img
                        src="/aster-finance/aster-wallet-mainnet-api.png"
                        alt="Authorize API wallet on Aster mainnet with permissions selected"
                        className="w-full"
                      />
                      <p className="text-xs text-center text-[var(--text-muted)] py-1.5 bg-[var(--bg-deep)]">
                        Step 1: Enter your agent address and select Read, Perps
                        trading, and Spot trading
                      </p>
                    </div>
                    <div className="rounded-lg overflow-hidden border border-[var(--border)]">
                      <img
                        src="/aster-finance/aster-wallet-mainnet-api-2.png"
                        alt="Authorized API wallet listed on Aster mainnet"
                        className="w-full"
                      />
                      <p className="text-xs text-center text-[var(--text-muted)] py-1.5 bg-[var(--bg-deep)]">
                        Step 2: Confirm your wallet appears with Read, Perp
                        Trade, and Spot Trade permissions
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <a
                    href="https://www.asterdex.com/en/api-wallet"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 text-center border border-[var(--border)] rounded-lg text-sm hover:border-[var(--accent)] transition-colors"
                  >
                    Open Aster API Wallet ↗
                  </a>
                  <button
                    onClick={async () => {
                      onSetIsSavingAsterConfig(true);
                      onErrorMessage("");
                      try {
                        const res = await fetch(
                          "/api/lazy-trading/save-aster-credentials",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              userWallet: walletAddress,
                              enabled: true,
                            }),
                          }
                        );
                        const data = await res.json();
                        if (data.success) {
                          onSetAsterEnabled(true);
                        } else {
                          onErrorMessage(
                            data.error || "Failed to enable Aster"
                          );
                        }
                      } catch {
                        onErrorMessage("Failed to enable Aster");
                      } finally {
                        onSetIsSavingAsterConfig(false);
                      }
                    }}
                    disabled={isSavingAsterConfig}
                    className="flex-1 py-2.5 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSavingAsterConfig ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Enabling...
                      </>
                    ) : (
                      "Enable Aster"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Avantis DEX (Base — Optional) */}
      <div
        className={`border rounded-lg p-5 transition-all ${avantisEnabled || avantisSetupComplete
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)]"
          }`}
      >
        <div className="flex items-start gap-4">
          <div className="text-3xl">⬡</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-baseline gap-2">
                <h3 className="font-bold">Avantis DEX (Base)</h3>
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Optional
                </span>
              </div>
              {avantisSetupComplete && (
                <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                  Ready
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Enable 1-click trading on Avantis (Base chain) via delegation and USDC approval.
            </p>

            {avantisSetupComplete || avantisSkillSubStep === "complete" ? (
              <div className="space-y-3">
                <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                  <p className="text-sm text-green-400 mb-1">
                    <strong>Avantis Trading Ready ✓</strong>
                  </p>
                  {avantisAgentAddress && (
                    <div className="space-y-1">
                      <p className="text-xs text-[var(--text-muted)]">
                        Agent Address
                      </p>
                      <code className="text-xs bg-[var(--bg-card)] px-2 py-1 rounded font-mono break-all">
                        {avantisAgentAddress}
                      </code>
                    </div>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Your agent is authorized to trade on Avantis (Base).
                  </p>
                </div>
                <button
                  onClick={() => {
                    onSetAvantisEnabled(false);
                    onSetAvantisSetupComplete(false);
                    onSetAvantisSkillSubStep("idle");
                    onSetAvantisAgentAddress(null);
                    onSetAvantisDelegationComplete(false);
                    onSetAvantisAllowanceComplete(false);
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Reset Avantis
                </button>
              </div>
            ) : avantisSkillSubStep === "idle" ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  We&apos;ll set up on-chain permissions for Avantis on Base.
                </p>
                <button
                  onClick={() => {
                    onSetAvantisEnabled(true);
                    onSetupAvantisAgent();
                  }}
                  disabled={avantisSkillSubStep !== "idle"}
                  className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Zap className="w-4 h-4" /> Setup Avantis Agent
                </button>
              </div>
            ) : avantisSkillSubStep === "creating-agent" ? (
              <div className="flex items-center justify-center gap-2 py-4 text-[var(--text-secondary)]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating Avantis agent...</span>
              </div>
            ) : avantisSkillSubStep === "agent-created" ? (
              <div className="space-y-4">
                <div className="border border-[var(--border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--text-muted)] mb-1">
                    Your Avantis Agent Address (Base)
                  </p>
                  <code className="text-sm font-mono break-all text-[var(--accent)]">
                    {avantisAgentAddress}
                  </code>
                </div>

                <div className="space-y-3">
                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border ${avantisDelegationComplete
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-[var(--border)]"
                      }`}
                  >
                    {avantisDelegationComplete ? (
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-[var(--text-muted)] flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-bold">
                        {avantisDelegationComplete
                          ? "Delegation Complete"
                          : "Delegate Trading"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Allow your agent to trade on Avantis (Base) on your behalf
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border ${avantisAllowanceComplete
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-[var(--border)]"
                      }`}
                  >
                    {avantisAllowanceComplete ? (
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-[var(--text-muted)] flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-bold">
                        {avantisAllowanceComplete ? "USDC Approved" : "Approve USDC"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Allow Avantis to use your USDC on Base for trading
                      </p>
                    </div>
                  </div>
                </div>

                {avantisSkillTxHash && (
                  <div className="text-center text-xs text-[var(--text-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                    Confirming transaction on Base...
                  </div>
                )}

                {!avantisDelegationComplete || !avantisAllowanceComplete ? (
                  <button
                    onClick={onEnableAvantisTrading}
                    disabled={enablingAvantisTrading}
                    className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {enablingAvantisTrading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />{" "}
                        {avantisSkillCurrentAction || "Processing..."}
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" /> Enable 1-Click Trading (Base)
                      </>
                    )}
                  </button>
                ) : (
                  <div className="border border-green-500/40 bg-green-500/10 rounded-lg p-3 text-xs text-green-300">
                    Avantis setup complete — all approvals granted on Base
                  </div>
                )}

                <button
                  onClick={() => {
                    onSetAvantisEnabled(false);
                    onSetAvantisSkillSubStep("idle");
                    onSetAvantisAgentAddress(null);
                    onSetAvantisDelegationComplete(false);
                    onSetAvantisAllowanceComplete(false);
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </div>
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
          onClick={() => {
            if (shouldCreateDeployment) {
              onCreateTradingDeployment(selectedVenues);
              return;
            }
            if (selectedVenues.length === 0) {
              onErrorMessage("Enable at least one trading venue before continuing.");
              return;
            }
            if (!isOstiumReady) {
              onErrorMessage(
                "Complete Ostium trading setup before continuing."
              );
              return;
            }
            if (!isAvantisReady) {
              onErrorMessage(
                "Complete Avantis trading setup before continuing."
              );
              return;
            }
            markComplete("trading");
            onContinue();
          }}
          className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          {shouldCreateDeployment
            ? "Create Deployment"
            : canProceed
              ? "Continue"
              : "Complete setup to continue"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {errorMessage && (
        <p className="text-red-500 text-sm text-center">{errorMessage}</p>
      )}
    </div>
  );
}
