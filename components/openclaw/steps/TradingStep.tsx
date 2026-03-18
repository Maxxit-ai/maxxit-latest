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
  onEnableLazyTradingSkill: () => void;
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
  isCheckingOstiumSetup: boolean;
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
  ostiumUseTestnet: boolean;
  ostiumPromoCode: string;
  onOstiumPromoCodeChange: (value: string) => void;
  isEnablingOstiumTestnet: boolean;
  ostiumTestnetMessage: string | null;
  onSetOstiumUseTestnet: (value: boolean) => void;
  onEnableOstiumTestnet: () => void;
  agentFundingNetwork: "arbitrum-mainnet" | "arbitrum-sepolia" | "base-mainnet";
  onAgentFundingNetworkChange: (
    value: "arbitrum-mainnet" | "arbitrum-sepolia" | "base-mainnet",
  ) => void;
  agentEthAmount: string;
  onAgentEthAmountChange: (value: string) => void;
  sendingAgentEth: boolean;
  agentEthTxHash: string | null;
  agentEthError: string | null;
  onSendAgentEth: () => void;
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
  onSetAvantisSkillSubStep: (
    s: "idle" | "creating-agent" | "agent-created" | "complete",
  ) => void;
  enablingAvantisTrading: boolean;
  avantisSkillCurrentAction: string;
  avantisSkillTxHash: string | null;
  // Zerodha (Indian Stocks)
  zerodhaStatus: "idle" | "connected" | "expired" | "error";
  zerodhaUserName: string | null;
  zerodhaIsAuthenticating: boolean;
  zerodhaIsSavingCreds: boolean;
  zerodhaCredsSaved: boolean;
  kiteApiKey: string;
  kiteApiSecret: string;
  onKiteApiKeyChange: (v: string) => void;
  onKiteApiSecretChange: (v: string) => void;
  onSaveZerodhaCreds: () => void;
  onAuthenticateZerodha: () => void;
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
  onEnableLazyTradingSkill,
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
  isCheckingOstiumSetup,
  onSetDelegationComplete,
  allowanceComplete,
  onSetAllowanceComplete,
  skillTxHash,
  onSetSkillTxHash,
  skillCurrentAction,
  onSetSkillCurrentAction,
  agentSetupSource,
  onSetAgentSetupSource,
  enablingTrading,
  hasDeployment,
  deploymentEnabledVenues,
  onSetHasDeployment,
  onSetDeploymentEnabledVenues,
  ostiumUseTestnet,
  ostiumPromoCode,
  onOstiumPromoCodeChange,
  isEnablingOstiumTestnet,
  ostiumTestnetMessage,
  onSetOstiumUseTestnet,
  onEnableOstiumTestnet,
  agentFundingNetwork,
  onAgentFundingNetworkChange,
  agentEthAmount,
  onAgentEthAmountChange,
  sendingAgentEth,
  agentEthTxHash,
  agentEthError,
  onSendAgentEth,
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
  zerodhaStatus,
  zerodhaUserName,
  zerodhaIsAuthenticating,
  zerodhaIsSavingCreds,
  zerodhaCredsSaved,
  kiteApiKey,
  kiteApiSecret,
  onKiteApiKeyChange,
  onKiteApiSecretChange,
  onSaveZerodhaCreds,
  onAuthenticateZerodha,
  onBack,
  onContinue,
  onCreateTradingDeployment,
  onSetupTradingAgent,
  onEnableTrading,
  onSetupAvantisAgent,
  onEnableAvantisTrading,
  markComplete,
}: Props) {
  const zerodhaCallbackUrl =
    "https://maxxit.ai/api/lazy-trading/programmatic/zerodha/callback";

  const normalizedDeploymentVenues = (deploymentEnabledVenues || []).map((v) =>
    String(v || "")
      .trim()
      .toUpperCase(),
  );
  const hasOstiumDeployment = normalizedDeploymentVenues.includes("OSTIUM");

  const ostiumSelected =
    delegationComplete || allowanceComplete || hasOstiumDeployment;
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

  const isOstiumReady =
    !ostiumSelected || hasOstiumDeployment || ostiumPrereqsReady;
  const isAvantisReady =
    !avantisSelected || avantisSetupComplete || avantisPrereqsReady;

  const hasRequiredDeploymentVenues = selectedVenues.every((venue) =>
    normalizedDeploymentVenues.includes(venue),
  );
  const hasAnyDexSelection = selectedVenues.length > 0 || asterEnabled;
  const canProceed = !hasAnyDexSelection || (isOstiumReady && isAvantisReady);
  const shouldCreateDeployment =
    hasAnyDexSelection &&
    isOstiumReady &&
    isAvantisReady &&
    (!hasDeployment || !hasRequiredDeploymentVenues);
  const showDexOptions =
    !!ostiumAgentAddress || lazyTradingSetupComplete || hasDeployment;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-2xl mb-2">Trading Skills</h1>
        <p className="text-[var(--text-secondary)]">
          Set up your trading agents for Ostium, Aster, and Avantis via your
          OpenClaw bot.
        </p>
      </div>

      {/* Maxxit Lazy Trading */}
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
              Execute trades by sending message to your OpenClaw bot.
            </p>

            {!lazyTradingEnabled ? (
              <button
                onClick={onEnableLazyTradingSkill}
                className="text-sm px-4 py-2 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] transition-colors"
              >
                Enable Skill
              </button>
            ) : (
              <div className="space-y-4">
                {ostiumAgentAddress ? (
                  <div className="border border-[var(--border)] rounded-lg p-4 space-y-4">
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        Your Trading Agent Address (for all DEXs)
                      </p>
                      <code className="text-sm font-mono break-all text-[var(--accent)]">
                        {ostiumAgentAddress}
                      </code>
                      <p className="text-xs text-[var(--text-muted)] mt-2">
                        This address is used for Ostium, Aster, and Avantis.
                      </p>
                    </div>

                    <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--bg-card)]/30">
                      <p className="text-sm font-bold">Fund agent with ETH</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Send ETH to the agent wallet so it can pay gas when
                        trading on your behalf.
                      </p>
                      <div className="mt-3">
                        <label className="mb-1 block text-xs text-[var(--text-muted)]">
                          Network
                        </label>
                        <select
                          value={agentFundingNetwork}
                          onChange={(e) =>
                            onAgentFundingNetworkChange(
                              e.target.value as
                              | "arbitrum-mainnet"
                              | "arbitrum-sepolia"
                              | "base-mainnet",
                            )
                          }
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        >
                          <option value="arbitrum-mainnet">Arbitrum One</option>
                          <option value="arbitrum-sepolia">
                            Arbitrum Sepolia
                          </option>
                          <option value="base-mainnet">Base Mainnet</option>
                        </select>
                      </div>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                        <input
                          value={agentEthAmount}
                          onChange={(e) =>
                            onAgentEthAmountChange(e.target.value)
                          }
                          placeholder="0.005"
                          className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          onClick={onSendAgentEth}
                          disabled={sendingAgentEth || !agentEthAmount.trim()}
                          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--bg-deep)] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {sendingAgentEth ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Sending...
                            </span>
                          ) : (
                            "Send ETH"
                          )}
                        </button>
                      </div>
                      {agentEthTxHash && (
                        <p className="mt-2 text-xs text-green-400 break-all">
                          ETH sent successfully: {agentEthTxHash}
                        </p>
                      )}
                      {agentEthError && (
                        <p className="mt-2 text-xs text-red-400 break-all">
                          {agentEthError}
                        </p>
                      )}
                      {!agentEthError && !agentEthTxHash && (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          The app will switch your wallet to the selected
                          network before sending.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-[var(--text-secondary)]">
                      We&apos;ll create one shared trading agent wallet for all
                      supported DEXs.
                    </p>
                    <button
                      onClick={() => {
                        onSetAgentSetupSource("ostium");
                        onSetupTradingAgent();
                      }}
                      disabled={skillSubStep === "creating-agent"}
                      className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {skillSubStep === "creating-agent" ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {agentSetupSource === "ostium"
                            ? "Creating Agent..."
                            : "Checking Existing Agent..."}
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" /> Setup Trading Agent
                        </>
                      )}
                    </button>
                  </div>
                )}

                {hasDeployment || lazyTradingSetupComplete ? (
                  <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                    <p className="text-sm text-green-400 mb-1">
                      <strong>Skill Ready ✓</strong>
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Deployment is active. You can continue, or manage optional
                      DEX setup below.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">
                    Set up a trading agent only if you want to enable one or
                    more DEX venues below. Zerodha setup does not require a
                    trading agent.
                  </p>
                )}

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
                    onSetOstiumUseTestnet(false);
                    onSetAvantisEnabled(false);
                    onSetAvantisSetupComplete(false);
                    onSetAvantisSkillSubStep("idle");
                    onSetAvantisAgentAddress(null);
                    onSetAvantisDelegationComplete(false);
                    onSetAvantisAllowanceComplete(false);
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Reset Lazy Trading
                </button>

                {/* Zerodha (Indian Stocks) */}
                <div
                  className={`border rounded-lg p-5 transition-all ${zerodhaStatus === "connected"
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border)]"
                    }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">🇮🇳</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-baseline gap-2">
                          <h3 className="font-bold">Zerodha (Indian Stocks)</h3>
                          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                            Optional
                          </span>
                        </div>
                        {zerodhaStatus === "connected" && (
                          <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mb-4">
                        Connect your Zerodha account to trade Indian equities
                        (NSE, BSE) via your OpenClaw bot. This does not require
                        creating a Maxxit trading agent.
                      </p>

                      {zerodhaStatus === "connected" && zerodhaUserName ? (
                        <div className="space-y-3">
                          <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                            <p className="text-sm text-green-400 mb-1">
                              <strong>Connected as {zerodhaUserName}</strong>
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              Zerodha session is active. Your EC2 instance has
                              access to trade Indian stocks.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {zerodhaStatus === "expired" && (
                            <div className="border border-amber-500/50 bg-amber-500/10 rounded-lg p-4">
                              <p className="text-sm text-amber-300 mb-1">
                                <strong>Your previous Zerodha session has expired.</strong>
                              </p>
                              <p className="text-xs text-[var(--text-muted)]">
                                Re-authenticate to restore Indian equities trading for this OpenClaw bot.
                              </p>
                            </div>
                          )}
                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              Setup Instructions:
                            </p>
                            <ol className="text-sm text-[var(--text-secondary)] list-decimal list-inside space-y-1">
                              <li>
                                Go to{" "}
                                <a
                                  href="https://developers.kite.trade"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--accent)] hover:underline"
                                >
                                  developers.kite.trade
                                </a>
                              </li>
                              <li>
                                Set your app&apos;s redirect URL to{" "}
                                <span className="inline-flex items-center gap-2 align-middle">
                                  <code className="text-xs bg-[var(--bg-deep)] px-1.5 py-0.5 rounded break-all">
                                    {zerodhaCallbackUrl}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (typeof window !== "undefined") {
                                        window.navigator.clipboard
                                          .writeText(zerodhaCallbackUrl)
                                          .catch(() => {});
                                      }
                                    }}
                                    className="text-xs text-[var(--accent)] hover:underline"
                                  >
                                    Copy
                                  </button>
                                </span>
                              </li>
                              <li>
                                Copy your API Key and API Secret below
                              </li>
                            </ol>
                            <a
                              href="/user-manual#openclaw-zerodha"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex text-xs text-[var(--accent)] hover:underline"
                            >
                              View the full Zerodha API setup guide
                            </a>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="mb-1 block text-xs text-[var(--text-muted)]">
                                KITE_API_KEY
                              </label>
                              <input
                                value={kiteApiKey}
                                onChange={(e) =>
                                  onKiteApiKeyChange(e.target.value)
                                }
                                placeholder="Your Kite API Key"
                                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-[var(--text-muted)]">
                                KITE_API_SECRET
                              </label>
                              <input
                                value={kiteApiSecret}
                                onChange={(e) =>
                                  onKiteApiSecretChange(e.target.value)
                                }
                                placeholder="Your Kite API Secret"
                                type="password"
                                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                              />
                            </div>

                            <button
                              onClick={onSaveZerodhaCreds}
                              disabled={
                                zerodhaIsSavingCreds ||
                                !kiteApiKey.trim() ||
                                !kiteApiSecret.trim()
                              }
                              className="w-full py-2.5 border border-[var(--accent)] text-[var(--accent)] text-sm font-semibold rounded-lg transition-all hover:bg-[var(--accent)] hover:text-[var(--bg-deep)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {zerodhaIsSavingCreds ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Saving Credentials...
                                </>
                              ) : zerodhaCredsSaved ? (
                                "Credentials Saved"
                              ) : (
                                "Save Credentials"
                              )}
                            </button>

                            <button
                              onClick={onAuthenticateZerodha}
                              disabled={zerodhaIsAuthenticating}
                              className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {zerodhaIsAuthenticating ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Opening Zerodha Login...
                                </>
                              ) : (
                                <>
                                  <Shield className="w-4 h-4" />
                                  {zerodhaStatus === "expired"
                                    ? "Re-authenticate with Zerodha"
                                    : "Authenticate with Zerodha"}
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDexOptions && (
        <>
          {/* Ostium DEX */}
          <div
            className={`border rounded-lg p-5 transition-all ${delegationComplete && allowanceComplete
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : "border-[var(--border)]"
              }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl">📊</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold">Ostium DEX</h3>
                  {delegationComplete && allowanceComplete && (
                    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                      Ready
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Enable 1-click trading on Ostium via delegation and USDC
                  approval.
                </p>

                <div className="mb-4 border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-card)]/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">Ostium Testnet</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {ostiumUseTestnet
                          ? "Currently using Arbitrum Sepolia testnet."
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (ostiumUseTestnet) {
                          onSetOstiumUseTestnet(false);
                          onOstiumPromoCodeChange("");
                          onErrorMessage("");
                          onSetDelegationComplete(false);
                          onSetAllowanceComplete(false);
                          onSetSkillSubStep("idle");
                          onSetSkillTxHash(null);
                          onSetSkillCurrentAction("");

                          const nextVenues = normalizedDeploymentVenues.filter(
                            (venue) => venue !== "OSTIUM",
                          );
                          onSetDeploymentEnabledVenues(nextVenues);
                          onSetHasDeployment(nextVenues.length > 0);
                        }
                      }}
                      disabled={isEnablingOstiumTestnet}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full overflow-hidden transition-colors ${ostiumUseTestnet
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--border)]"
                        }`}
                      aria-pressed={ostiumUseTestnet}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${ostiumUseTestnet
                            ? "translate-x-[22px]"
                            : "translate-x-[2px]"
                          }`}
                      />
                    </button>
                  </div>

                  {!ostiumUseTestnet && (
                    <div className="mt-4 space-y-3">
                      <input
                        value={ostiumPromoCode}
                        onChange={(e) =>
                          onOstiumPromoCodeChange(e.target.value)
                        }
                        placeholder="Enter promo code to enable testnet"
                        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                      <button
                        onClick={onEnableOstiumTestnet}
                        disabled={
                          isEnablingOstiumTestnet || !ostiumPromoCode.trim()
                        }
                        className="w-full py-2.5 rounded-lg border border-[var(--accent)] text-[var(--accent)] text-sm font-semibold transition-all hover:bg-[var(--accent)] hover:text-[var(--bg-deep)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isEnablingOstiumTestnet ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Activating Testnet...
                          </>
                        ) : (
                          "Activate Testnet"
                        )}
                      </button>
                    </div>
                  )}

                  {ostiumUseTestnet && (
                    <div className="mt-3 rounded-lg border border-green-500/40 bg-green-500/10 p-3">
                      <p className="text-sm text-green-400">
                        ✓ Testnet enabled — delegation and approval will use
                        Arbitrum Sepolia.
                      </p>
                      {ostiumTestnetMessage && (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {ostiumTestnetMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {!ostiumAgentAddress ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Set up your trading agent first.
                  </p>
                ) : hasOstiumDeployment ? (
                  <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                    <p className="text-sm text-green-400 mb-1">
                      <strong>Ostium Trading Ready ✓</strong>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
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
                            {allowanceComplete
                              ? "USDC Approved"
                              : "Approve USDC"}
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

                    {isCheckingOstiumSetup ? (
                      <div className="border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--text-muted)] text-center">
                        <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                        Checking existing Ostium setup...
                      </div>
                    ) : !delegationComplete || !allowanceComplete ? (
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
                            <Shield className="w-4 h-4" /> Enable 1-Click
                            Trading
                            {ostiumUseTestnet ? " on Testnet" : ""}
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="border border-green-500/40 bg-green-500/10 rounded-lg p-3 text-xs text-green-300">
                        Ready to create deployment
                      </div>
                    )}
                  </div>
                )}
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
                    <p className="text-xs text-[var(--text-muted)]">
                      Set up your trading agent in the Maxxit Lazy Trading
                      section first.
                    </p>
                  </div>
                ) : asterEnabled ? (
                  <div className="space-y-3">
                    <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                      <p className="text-sm text-green-400 mb-1">
                        <strong>Aster DEX Enabled ✓</strong>
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Your shared agent wallet is authorized for Aster
                        trading.
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
                            },
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
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        To enable Aster trading:
                      </p>
                      <ol className="text-sm text-[var(--text-secondary)] list-decimal list-inside space-y-1">
                        <li>Go to Aster&apos;s API Wallet page</li>
                        <li>Click &quot;Authorize new API wallet&quot;</li>
                        <li>
                          Paste the agent address from the Maxxit card as the
                          &quot;API wallet address&quot;
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
                            Step 1: Enter shared agent address and select Read,
                            Perps trading, and Spot trading
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
                              },
                            );
                            const data = await res.json();
                            if (data.success) {
                              onSetAsterEnabled(true);
                            } else {
                              onErrorMessage(
                                data.error || "Failed to enable Aster",
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
                            <Loader2 className="w-4 h-4 animate-spin" />{" "}
                            Enabling...
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
                  Enable 1-click trading on Avantis (Base chain) via delegation
                  and USDC approval.
                </p>

                {avantisSetupComplete || avantisSkillSubStep === "complete" ? (
                  <div className="space-y-3">
                    <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                      <p className="text-sm text-green-400 mb-1">
                        <strong>Avantis Trading Ready ✓</strong>
                      </p>
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
                ) : !ostiumAgentAddress ? (
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--text-muted)]">
                      Set up your trading agent in the Maxxit Lazy Trading
                      section first.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
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
                            Allow your agent to trade on Avantis (Base) on your
                            behalf
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
                            {avantisAllowanceComplete
                              ? "USDC Approved"
                              : "Approve USDC"}
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
                        onClick={() => {
                          onSetAvantisEnabled(true);
                          onEnableAvantisTrading();
                        }}
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
                            <Shield className="w-4 h-4" /> Enable 1-Click
                            Trading (Base)
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
                        onSetAvantisDelegationComplete(false);
                        onSetAvantisAllowanceComplete(false);
                      }}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </>
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
            if (shouldCreateDeployment) {
              onCreateTradingDeployment(selectedVenues);
              return;
            }
            if (hasAnyDexSelection && !isOstiumReady) {
              onErrorMessage(
                "Complete Ostium trading setup before continuing.",
              );
              return;
            }
            if (hasAnyDexSelection && !isAvantisReady) {
              onErrorMessage(
                "Complete Avantis trading setup before continuing.",
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
            : "Continue"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {errorMessage && (
        <p className="text-red-500 text-sm text-center">{errorMessage}</p>
      )}
    </div>
  );
}
