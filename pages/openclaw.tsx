import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import { Header } from "@components/Header";
import FooterSection from "@components/home/FooterSection";
import { PaymentSelectorModal } from "@components/PaymentSelectorModal";
import { Web3CheckoutModal } from "@components/Web3CheckoutModal";
import { Loader2, Orbit, Zap } from "lucide-react";
import welcomeImage from "../public/openclaw_welcome.png";
import { ethers } from "ethers";
import { getOstiumConfig } from "../lib/ostium-config";
import { getAvantisConfig } from "../lib/avantis-config";

import {
  EigenVerificationRecord,
  InstanceData,
  PlanId,
  PLAN_OPTIONS,
  STEPS,
  StepKey,
  WebSearchProvider,
  postJson,
  AVANTIS_TRADING_CONTRACT,
  AVANTIS_TRADING_ABI,
  AVANTIS_STORAGE,
  AVANTIS_USDC_TOKEN,
  BASE_CHAIN_ID,
  BASE_CHAIN_NAME,
} from "../components/openclaw/types";
import { StepIndicator } from "../components/openclaw/StepIndicator";
import { OpenClawLanding } from "../components/openclaw/OpenClawLanding";
import { PlanStep } from "../components/openclaw/steps/PlanStep";
import { TelegramStep } from "../components/openclaw/steps/TelegramStep";
import { TradingStep } from "../components/openclaw/steps/TradingStep";
import { ActivateStep } from "../components/openclaw/steps/ActivateStep";
import { EigenAIModal } from "../components/openclaw/EigenAIModal";
import { OSTIUM_TRADING_ABI, USDC_ABI } from "../components/openclaw/types";

type AgentFundingNetwork =
  | "arbitrum-mainnet"
  | "arbitrum-sepolia"
  | "base-mainnet";

const AGENT_FUNDING_NETWORKS: Record<
  AgentFundingNetwork,
  {
    label: string;
    chainId: number;
    chainName: string;
    currencySymbol: string;
    rpcUrl: string;
    blockExplorerUrl: string;
  }
> = {
  "arbitrum-mainnet": {
    label: "Arbitrum One",
    chainId: getOstiumConfig(false).chainId,
    chainName: getOstiumConfig(false).chainName,
    currencySymbol: getOstiumConfig(false).currencySymbol,
    rpcUrl: getOstiumConfig(false).rpcUrl,
    blockExplorerUrl: getOstiumConfig(false).blockExplorerUrl,
  },
  "arbitrum-sepolia": {
    label: "Arbitrum Sepolia",
    chainId: getOstiumConfig(true).chainId,
    chainName: getOstiumConfig(true).chainName,
    currencySymbol: getOstiumConfig(true).currencySymbol,
    rpcUrl: getOstiumConfig(true).rpcUrl,
    blockExplorerUrl: getOstiumConfig(true).blockExplorerUrl,
  },
  "base-mainnet": {
    label: "Base Mainnet",
    chainId: getAvantisConfig().chainId,
    chainName: getAvantisConfig().chainName,
    currencySymbol: getAvantisConfig().currencySymbol,
    rpcUrl: getAvantisConfig().rpcUrl,
    blockExplorerUrl: getAvantisConfig().blockExplorerUrl,
  },
};

export default function OpenClawSetupPage() {
  const router = useRouter();
  const { authenticated, user, login } = usePrivy();
  const walletAddress = user?.wallet?.address;

  const [showLanding, setShowLanding] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [completedSteps, setCompletedSteps] = useState<Set<StepKey>>(new Set());
  const [instanceData, setInstanceData] = useState<InstanceData | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<PlanId>("starter");
  const [selectedModel, setSelectedModel] = useState("gpt-5.1-codex-mini");
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramVerified, setTelegramVerified] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState<string | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isWeb3ModalOpen, setIsWeb3ModalOpen] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isValidatingBot, setIsValidatingBot] = useState(false);

  const [lazyTradingEnabled, setLazyTradingEnabled] = useState(false);
  const [lazyTradingSetupComplete, setLazyTradingSetupComplete] =
    useState(false);
  const [isCheckingLazyTradingSetup, setIsCheckingLazyTradingSetup] =
    useState(false);
  const [maxxitApiKey, setMaxxitApiKey] = useState<string | null>(null);
  const [maxxitApiKeyPrefix, setMaxxitApiKeyPrefix] = useState<string | null>(
    null,
  );
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);

  const [skillSubStep, setSkillSubStep] = useState<
    | "idle"
    | "creating-agent"
    | "agent-created"
    | "delegating"
    | "approving"
    | "creating-deployment"
    | "complete"
  >("idle");
  const [tradingAgentId, setTradingAgentId] = useState<string | null>(null);
  const [ostiumAgentAddress, setOstiumAgentAddress] = useState<string | null>(
    null,
  );
  const [delegationComplete, setDelegationComplete] = useState(false);
  const [allowanceComplete, setAllowanceComplete] = useState(false);
  const [isCheckingOstiumSetup, setIsCheckingOstiumSetup] = useState(false);
  const [skillTxHash, setSkillTxHash] = useState<string | null>(null);
  const [skillCurrentAction, setSkillCurrentAction] = useState("");
  const [agentSetupSource, setAgentSetupSource] = useState<
    "ostium" | "aster" | null
  >(null);
  const [enablingTrading, setEnablingTrading] = useState(false);
  const [hasDeployment, setHasDeployment] = useState(false);
  const [deploymentEnabledVenues, setDeploymentEnabledVenues] = useState<
    string[]
  >([]);
  const [ostiumUseTestnet, setOstiumUseTestnet] = useState(false);
  const [ostiumPromoCode, setOstiumPromoCode] = useState("");
  const [isEnablingOstiumTestnet, setIsEnablingOstiumTestnet] = useState(false);
  const [ostiumTestnetMessage, setOstiumTestnetMessage] = useState<
    string | null
  >(null);
  const [agentFundingNetwork, setAgentFundingNetwork] =
    useState<AgentFundingNetwork>("arbitrum-mainnet");
  const [agentEthAmount, setAgentEthAmount] = useState("0.005");
  const [sendingAgentEth, setSendingAgentEth] = useState(false);
  const [agentEthTxHash, setAgentEthTxHash] = useState<string | null>(null);
  const [agentEthError, setAgentEthError] = useState<string | null>(null);

  // Aster DEX state
  const [asterEnabled, setAsterEnabled] = useState(false);
  const [isSavingAsterConfig, setIsSavingAsterConfig] = useState(false);
  const [asterShowGuide, setAsterShowGuide] = useState(false);

  // Avantis DEX state (Base chain)
  const [avantisEnabled, setAvantisEnabled] = useState(false);
  const [avantisAgentAddress, setAvantisAgentAddress] = useState<string | null>(
    null,
  );
  const [avantisDelegationComplete, setAvantisDelegationComplete] =
    useState(false);
  const [avantisAllowanceComplete, setAvantisAllowanceComplete] =
    useState(false);
  const [avantisSetupComplete, setAvantisSetupComplete] = useState(false);
  const [avantisSkillSubStep, setAvantisSkillSubStep] = useState<
    "idle" | "creating-agent" | "agent-created" | "complete"
  >("idle");
  const [enablingAvantisTrading, setEnablingAvantisTrading] = useState(false);
  const [avantisSkillCurrentAction, setAvantisSkillCurrentAction] =
    useState("");
  const [avantisSkillTxHash, setAvantisSkillTxHash] = useState<string | null>(
    null,
  );

  const [openaiKeyStatus, setOpenaiKeyStatus] = useState<
    "not_created" | "creating" | "created"
  >("not_created");
  const [openaiKeyPrefix, setOpenaiKeyPrefix] = useState<string | null>(null);
  const [openaiKeyCreatedAt, setOpenaiKeyCreatedAt] = useState<string | null>(
    null,
  );
  const [isCreatingOpenAIKey, setIsCreatingOpenAIKey] = useState(false);

  const [instanceStatusPhase, setInstanceStatusPhase] = useState<
    | "launching"
    | "starting"
    | "checking"
    | "configuring"
    | "ready"
    | "error"
    | null
  >(null);
  const [instanceStatusMessage, setInstanceStatusMessage] = useState<
    string | null
  >(null);

  const [llmBalance, setLlmBalance] = useState<{
    balanceCents: number;
    totalPurchased: number;
    totalUsed: number;
    limitReached: boolean;
  } | null>(null);
  const [isLoadingLlmBalance, setIsLoadingLlmBalance] = useState(false);
  const [llmBalanceError, setLlmBalanceError] = useState<string | null>(null);
  const [selectedTopUpAmount, setSelectedTopUpAmount] = useState<number>(1000);
  const [llmTopUpSuccess, setLlmTopUpSuccess] = useState(false);
  const [llmBalanceRefreshKey, setLlmBalanceRefreshKey] = useState(0);

  // Environment Variables state
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([]);
  const [isLoadingEnvVars, setIsLoadingEnvVars] = useState(false);
  const [isAddingEnvVar, setIsAddingEnvVar] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [envVarMessage, setEnvVarMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showEnvVarsSection, setShowEnvVarsSection] = useState(false);
  const [revealedEnvVars, setRevealedEnvVars] = useState<Set<string>>(
    new Set(),
  );
  const [deletingEnvKey, setDeletingEnvKey] = useState<string | null>(null);

  // Web search state
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [selectedWebSearchProvider, setSelectedWebSearchProvider] =
    useState<WebSearchProvider>("brave");
  const [isUpdatingWebSearch, setIsUpdatingWebSearch] = useState(false);
  const [showWebSearchSection, setShowWebSearchSection] = useState(false);

  // Version update state
  const [openclawVersion, setOpenclawVersion] = useState<{
    installed: string | null;
    latest: string | null;
    updateAvailable: boolean;
  } | null>(null);
  const [skillVersion, setSkillVersion] = useState<{
    installed: string | null;
    latest: string | null;
    updateAvailable: boolean;
  } | null>(null);
  const [isCheckingVersions, setIsCheckingVersions] = useState(false);
  const [isUpdatingOpenclaw, setIsUpdatingOpenclaw] = useState(false);
  const [isUpdatingSkill, setIsUpdatingSkill] = useState(false);
  const [showVersionsSection, setShowVersionsSection] = useState(false);
  const [versionUpdateMessage, setVersionUpdateMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Zerodha (Indian Stocks) state
  const [zerodhaStatus, setZerodhaStatus] = useState<
    "idle" | "connected" | "expired" | "error"
  >("idle");
  const [zerodhaUserName, setZerodhaUserName] = useState<string | null>(null);
  const [zerodhaIsAuthenticating, setZerodhaIsAuthenticating] = useState(false);
  const [zerodhaIsSavingCreds, setZerodhaIsSavingCreds] = useState(false);
  const [kiteApiKey, setKiteApiKey] = useState("");
  const [kiteApiSecret, setKiteApiSecret] = useState("");

  // EigenAI Signature Verification state
  const [eigenRecords, setEigenRecords] = useState<EigenVerificationRecord[]>(
    [],
  );
  const [eigenRecordsLoading, setEigenRecordsLoading] = useState(false);
  const [eigenRecordsError, setEigenRecordsError] = useState<string | null>(
    null,
  );
  const [eigenSelectedRecord, setEigenSelectedRecord] =
    useState<EigenVerificationRecord | null>(null);
  const [eigenModalOpen, setEigenModalOpen] = useState(false);
  const [eigenVerifying, setEigenVerifying] = useState(false);
  const [eigenVerifyResult, setEigenVerifyResult] = useState<{
    isValid: boolean;
    recoveredAddress: string;
    expectedAddress: string;
    message: string;
    details?: { chainId: number; model: string; messageLength: number };
  } | null>(null);
  const [eigenVerifyError, setEigenVerifyError] = useState<string | null>(null);
  const [showEigenSection, setShowEigenSection] = useState(false);
  const modelSyncTargetRef = useRef<string | null>(null);

  const currentStepKey = STEPS[currentStepIndex]?.key;
  const ostiumConfig = getOstiumConfig(ostiumUseTestnet);
  const canContinueFromPlanStep =
    openaiKeyStatus === "created" && (!!maxxitApiKey || !!maxxitApiKeyPrefix);

  useEffect(() => {
    if (!ostiumUseTestnet) return;

    const preferredModel = "gpt-5-mini";

    if (selectedModel !== preferredModel) {
      setSelectedModel(preferredModel);
    }

    if (
      !walletAddress ||
      !instanceData ||
      instanceData.model === preferredModel ||
      modelSyncTargetRef.current === preferredModel
    ) {
      return;
    }

    let cancelled = false;
    modelSyncTargetRef.current = preferredModel;

    (async () => {
      try {
        const response = await postJson<{
          success: boolean;
          instance: {
            model: string;
          };
        }>("/api/openclaw/update-model", {
          userWallet: walletAddress,
          model: preferredModel,
        });

        if (cancelled) return;

        setSelectedModel(response.instance.model);
        setInstanceData((prev) =>
          prev ? { ...prev, model: response.instance.model } : prev,
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync model for Ostium testnet:", error);
        }
      } finally {
        if (!cancelled) {
          modelSyncTargetRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (modelSyncTargetRef.current === preferredModel) {
        modelSyncTargetRef.current = null;
      }
    };
  }, [instanceData, ostiumUseTestnet, selectedModel, walletAddress]);

  // Lock body scroll when EigenAI modal is open
  useEffect(() => {
    if (eigenModalOpen) {
      const prevHtml = document.documentElement.style.overflow;
      const prevBody = document.body.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prevHtml;
        document.body.style.overflow = prevBody;
      };
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }, [eigenModalOpen]);

  const markComplete = useCallback((key: StepKey) => {
    setCompletedSteps((prev) => new Set(prev).add(key));
  }, []);

  const goNext = useCallback(() => {
    setErrorMessage("");
    setCurrentStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setErrorMessage("");
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleEnableLazyTradingSkill = useCallback(async () => {
    if (!walletAddress) return;
    setLazyTradingEnabled(true);
    setErrorMessage("");
    setSkillSubStep("creating-agent");
    setAgentSetupSource(null);

    try {
      const res = await fetch("/api/openclaw/create-trading-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: walletAddress,
          enabledVenues: ["OSTIUM"],
          checkOnly: true,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setSkillSubStep("idle");
        return;
      }

      if (data.alreadyExists && data.agent?.id) {
        setTradingAgentId(data.agent.id);
        setOstiumAgentAddress(data.ostiumAgentAddress || null);
        setAvantisAgentAddress(
          data.avantisAgentAddress || data.ostiumAgentAddress || null,
        );
        setOstiumUseTestnet(data.deployment?.is_testnet === true);
        if (Array.isArray(data.deployment?.enabled_venues)) {
          setDeploymentEnabledVenues(data.deployment.enabled_venues);
        } else {
          setDeploymentEnabledVenues([]);
        }
        const hasAnyDeployment = Boolean(
          data.hasDeployment || data.deployment?.id,
        );
        if (hasAnyDeployment) {
          setHasDeployment(true);
          setLazyTradingSetupComplete(true);
          setSkillSubStep("complete");
          return;
        }

        setHasDeployment(false);
        setLazyTradingSetupComplete(false);
        setSkillSubStep("agent-created");

        try {
          const [delegRes, approvalRes] = await Promise.all([
            fetch(
              `/api/ostium/check-delegation-status?userWallet=${walletAddress}&agentAddress=${data.ostiumAgentAddress}&isTestnet=${data.deployment?.is_testnet === true}`,
            ),
            fetch(
              `/api/ostium/check-approval-status?userWallet=${walletAddress}&isTestnet=${data.deployment?.is_testnet === true}`,
            ),
          ]);
          if (delegRes.ok) {
            const d = await delegRes.json();
            setDelegationComplete(d.isDelegatedToAgent === true);
          } else {
            setDelegationComplete(false);
          }
          if (approvalRes.ok) {
            const a = await approvalRes.json();
            setAllowanceComplete(a.hasApproval === true);
          } else {
            setAllowanceComplete(false);
          }
        } catch {
          setDelegationComplete(false);
          setAllowanceComplete(false);
        }
        return;
      }

      setTradingAgentId(null);
      setOstiumAgentAddress(null);
      setAvantisAgentAddress(null);
      setHasDeployment(false);
      setDeploymentEnabledVenues([]);
      setOstiumUseTestnet(false);
      setOstiumPromoCode("");
      setOstiumTestnetMessage(null);
      setLazyTradingSetupComplete(false);
      setDelegationComplete(false);
      setAllowanceComplete(false);
      setSkillSubStep("idle");
    } catch {
      setSkillSubStep("idle");
    }
  }, [walletAddress]);

  const handleSetupTradingAgent = useCallback(async () => {
    setSkillSubStep("creating-agent");
    setErrorMessage("");
    try {
      const statusRes = await fetch(
        `/api/lazy-trading/get-setup-status?userWallet=${walletAddress}`,
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (
          statusData.success &&
          statusData.hasSetup &&
          statusData.step === "complete"
        ) {
          setLazyTradingSetupComplete(true);
          setSkillSubStep("complete");
          return;
        }
      }

      const res = await fetch("/api/openclaw/create-trading-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: walletAddress,
          venue: "OSTIUM",
          enabledVenues: ["OSTIUM"],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTradingAgentId(data.agent.id);
        setOstiumAgentAddress(data.ostiumAgentAddress);
        setAvantisAgentAddress(
          data.avantisAgentAddress || data.ostiumAgentAddress || null,
        );
        setOstiumUseTestnet(
          data.deployment?.is_testnet === true || ostiumUseTestnet,
        );
        const hasAnyDeployment = Boolean(
          data.hasDeployment || data.deployment?.id,
        );
        if (hasAnyDeployment) {
          setHasDeployment(true);
          setDeploymentEnabledVenues(
            Array.isArray(data.deployment?.enabled_venues)
              ? data.deployment.enabled_venues
              : [],
          );
          setLazyTradingSetupComplete(true);
          setSkillSubStep("complete");
          return;
        }
        setSkillSubStep("agent-created");
        try {
          const [delegRes, approvalRes] = await Promise.all([
            fetch(
              `/api/ostium/check-delegation-status?userWallet=${walletAddress}&agentAddress=${data.ostiumAgentAddress}&isTestnet=${ostiumUseTestnet}`,
            ),
            fetch(
              `/api/ostium/check-approval-status?userWallet=${walletAddress}&isTestnet=${ostiumUseTestnet}`,
            ),
          ]);
          if (delegRes.ok) {
            const d = await delegRes.json();
            if (d.isDelegatedToAgent) setDelegationComplete(true);
          }
          if (approvalRes.ok) {
            const a = await approvalRes.json();
            if (a.hasApproval) setAllowanceComplete(true);
          }
        } catch {}
      } else {
        setErrorMessage(data.error || "Failed to create trading agent");
        setSkillSubStep("idle");
      }
    } catch {
      setErrorMessage("Failed to create trading agent");
      setSkillSubStep("idle");
    }
  }, [walletAddress, ostiumUseTestnet]);

  const loadExistingProgress = useCallback(async () => {
    if (!walletAddress) return;
    setInitialLoading(true);

    try {
      const res = await fetch(
        `/api/openclaw/status?userWallet=${walletAddress}`,
      );
      if (res.status === 404) {
        setInitialLoading(false);
        return;
      }
      if (!res.ok) {
        setInitialLoading(false);
        return;
      }

      const data = (await res.json()) as {
        instance: {
          id: string;
          plan: string;
          model: string;
          status: string;
          containerStatus: string;
          telegram: {
            linked: boolean;
            userId: string | null;
            username: string | null;
            botUsername: string | null;
          };
          openai?: {
            projectId: string | null;
            serviceAccountId: string | null;
            keyCreatedAt: string | null;
          };
          webSearchProvider?: WebSearchProvider | null;
        };
      };

      const inst = data.instance;
      setInstanceData({
        id: inst.id,
        plan: inst.plan,
        model: inst.model,
        status: inst.status,
        telegramLinked: !!inst.telegram.botUsername,
        telegramVerified: inst.telegram.linked,
        telegramUsername: inst.telegram.username,
        openaiProjectId: inst.openai?.projectId ?? null,
        openaiServiceAccountId: inst.openai?.serviceAccountId ?? null,
        openaiApiKeyCreatedAt: inst.openai?.keyCreatedAt ?? null,
        webSearchProvider: inst.webSearchProvider ?? null,
      });

      setSelectedPlan(inst.plan as PlanId);
      setSelectedModel(inst.model);
      markComplete("plan");

      if (inst.telegram.botUsername) {
        setTelegramLinked(true);
        setTelegramUsername(inst.telegram.username);
        setBotUsername(inst.telegram.botUsername);
      }

      if (inst.telegram.linked && inst.telegram.userId) {
        setTelegramVerified(true);
        markComplete("telegram");
      }

      if (inst.status === "active") {
        markComplete("trading");
        markComplete("telegram");
        markComplete("activate");
        setActivated(true);
        setTelegramVerified(true);
        setInstanceStatusPhase("checking");
        setInstanceStatusMessage("Checking instance status...");
      }

      if (inst.openai?.projectId) {
        setOpenaiKeyStatus("created");
        setOpenaiKeyPrefix(
          inst.openai.serviceAccountId
            ? `sk-svcacct-${inst.openai.serviceAccountId.substring(0, 8)}...`
            : null,
        );
        setOpenaiKeyCreatedAt(inst.openai.keyCreatedAt || null);
      }

      if (inst.webSearchProvider) {
        setWebSearchEnabled(true);
        setSelectedWebSearchProvider(inst.webSearchProvider);
      }

      if (inst.status === "active") {
        setCurrentStepIndex(3);
      } else if (inst.telegram.linked && inst.telegram.userId) {
        setCurrentStepIndex(2);
      } else if (inst.telegram.username || inst.model) {
        setCurrentStepIndex(1);
      } else {
        setCurrentStepIndex(0);
      }

      setShowLanding(false);
    } catch {
    } finally {
      setInitialLoading(false);
    }
  }, [walletAddress, markComplete]);

  useEffect(() => {
    if (authenticated && walletAddress) {
      loadExistingProgress();
    }
  }, [authenticated, walletAddress, loadExistingProgress]);

  const [pendingPaymentPlan, setPendingPaymentPlan] = useState<PlanId | null>(
    null,
  );
  const [pendingPaymentWebSearch, setPendingPaymentWebSearch] =
    useState<WebSearchProvider | null>(null);

  useEffect(() => {
    const { payment, tier, wsProvider } = router.query;
    if (payment === "success" && tier && walletAddress && authenticated) {
      const planId = (tier as string).toLowerCase() as PlanId;
      if (PLAN_OPTIONS.some((p) => p.id === planId)) {
        setSelectedPlan(planId);
        setShowLanding(false);
        setPendingPaymentPlan(planId);
        // Restore web search provider from Stripe redirect URL
        if (wsProvider && typeof wsProvider === "string") {
          const validProviders: WebSearchProvider[] = [
            "brave",
            "perplexity",
            "openrouter",
          ];
          if (validProviders.includes(wsProvider as WebSearchProvider)) {
            setPendingPaymentWebSearch(wsProvider as WebSearchProvider);
            setWebSearchEnabled(true);
            setSelectedWebSearchProvider(wsProvider as WebSearchProvider);
          }
        }
        router.replace("/openclaw", undefined, { shallow: true });
      }
    } else if (payment === "cancelled") {
      router.replace("/openclaw", undefined, { shallow: true });
    }
  }, [router.query, walletAddress, authenticated]);

  // Handle Zerodha callback redirect (?zerodha=success or ?zerodha=error)
  useEffect(() => {
    const { zerodha, message } = router.query;
    if (zerodha === "success") {
      setZerodhaStatus("connected");
      router.replace("/openclaw", undefined, { shallow: true });
    } else if (zerodha === "error") {
      setZerodhaStatus("error");
      if (typeof message === "string") {
        setErrorMessage(decodeURIComponent(message));
      }
      router.replace("/openclaw", undefined, { shallow: true });
    }
  }, [router.query, router]);

  // Handle LLM top-up success redirect from Stripe
  useEffect(() => {
    const { payment, llm_topup } = router.query;
    if (
      payment === "success" &&
      llm_topup === "true" &&
      walletAddress &&
      authenticated
    ) {
      router.replace("/openclaw", undefined, { shallow: true });

      (async () => {
        try {
          console.log(
            "[OpenClaw] Calling verify-topup API for wallet:",
            walletAddress,
          );
          const verifyRes = await fetch(
            "/api/openclaw/llm-credits/verify-topup",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userWallet: walletAddress }),
            },
          );

          const data = await verifyRes.json();
          console.log("[OpenClaw] verify-topup response:", data);

          if (verifyRes.ok && data.success) {
            setLlmBalance({
              balanceCents: data.balance || 0,
              totalPurchased: data.totalPurchased || 0,
              totalUsed: data.totalUsed || 0,
              limitReached: data.limitReached || false,
            });
            setLlmTopUpSuccess(true);
            setTimeout(() => setLlmTopUpSuccess(false), 5000);
          } else {
            console.error("[OpenClaw] verify-topup failed:", data.error);
            setLlmBalanceRefreshKey((prev) => prev + 1);
            setLlmTopUpSuccess(true);
            setTimeout(() => setLlmTopUpSuccess(false), 5000);
          }
        } catch (error) {
          console.error("[OpenClaw] Error calling verify-topup:", error);
          setLlmBalanceRefreshKey((prev) => prev + 1);
          setLlmTopUpSuccess(true);
          setTimeout(() => setLlmTopUpSuccess(false), 5000);
        }
      })();
    }
  }, [router.query, walletAddress, authenticated, router]);

  useEffect(() => {
    if (pendingPaymentPlan && walletAddress && !isLoading) {
      setPendingPaymentPlan(null);
      (async () => {
        setIsLoading(true);
        try {
          // Use the web search provider from the redirect URL if available
          const wsProvider =
            pendingPaymentWebSearch ??
            (webSearchEnabled ? selectedWebSearchProvider : null);
          setPendingPaymentWebSearch(null);
          const response = await fetch("/api/openclaw/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userWallet: walletAddress,
              plan: pendingPaymentPlan,
              webSearchProvider: wsProvider,
            }),
          });
          const data = await response.json();
          if (response.ok) {
            setInstanceData({
              id: data.instance.id,
              plan: data.instance.plan,
              model: data.instance.model,
              status: data.instance.status,
              telegramLinked: data.instance.telegramLinked ?? false,
              telegramVerified: false,
              telegramUsername: data.instance.telegramUsername ?? null,
              webSearchProvider: data.instance.webSearchProvider ?? null,
            });

            await handleCreateOpenAIKey();
            if (!maxxitApiKey) {
              await generateMaxxitApiKey();
            }

            markComplete("plan");
          } else {
            setErrorMessage(data.error || "Failed to create instance");
          }
        } catch (error) {
          setErrorMessage((error as Error).message);
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [
    pendingPaymentPlan,
    walletAddress,
    isLoading,
    markComplete,
    maxxitApiKey,
  ]);

  // Check if Aster is configured
  useEffect(() => {
    if (!walletAddress || !authenticated) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/lazy-trading/check-aster-config?userWallet=${walletAddress}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.asterEnabled) {
            setAsterEnabled(true);
          }
        }
      } catch (err) {
        console.error("[OpenClaw] Failed to check Aster config:", err);
      }
    })();
  }, [walletAddress, authenticated]);

  useEffect(() => {
    if (
      !walletAddress ||
      currentStepKey !== "telegram" ||
      !telegramLinked ||
      telegramVerified
    ) {
      return;
    }

    const checkVerification = async () => {
      try {
        const res = await fetch(
          `/api/openclaw/status?userWallet=${walletAddress}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.instance?.telegram?.linked) {
            setTelegramVerified(true);
            markComplete("telegram");
          }
        }
      } catch {}
    };

    const interval = setInterval(checkVerification, 3000);
    return () => clearInterval(interval);
  }, [
    walletAddress,
    currentStepKey,
    telegramLinked,
    telegramVerified,
    markComplete,
  ]);

  useEffect(() => {
    if (
      !walletAddress ||
      !activated ||
      instanceStatusPhase === "ready" ||
      instanceStatusPhase === null
    ) {
      return;
    }

    const checkInstanceStatus = async () => {
      try {
        const res = await fetch(
          `/api/openclaw/instance-status?userWallet=${walletAddress}`,
        );
        if (res.ok) {
          const data = await res.json();
          const { instance } = data;

          if (instance?.statusPhase) {
            setInstanceStatusPhase(instance.statusPhase);
          }
          if (instance?.statusMessage) {
            setInstanceStatusMessage(instance.statusMessage);
          }
        }
      } catch {}
    };

    checkInstanceStatus();
    const interval = setInterval(checkInstanceStatus, 5000);
    return () => clearInterval(interval);
  }, [walletAddress, activated, instanceStatusPhase]);

  useEffect(() => {
    if (!walletAddress || !authenticated) {
      return;
    }

    const fetchLlmBalance = async () => {
      setIsLoadingLlmBalance(true);
      setLlmBalanceError(null);
      try {
        const res = await fetch(
          `/api/openclaw/llm-credits/balance?userWallet=${walletAddress}`,
        );
        if (res.ok) {
          const data = await res.json();
          setLlmBalance({
            balanceCents: data.balanceCents || 0,
            totalPurchased: data.totalPurchased || 0,
            totalUsed: data.totalUsed || 0,
            limitReached: data.limitReached || false,
          });
        } else {
          console.error("Failed to fetch LLM balance");
        }
      } catch (error) {
        console.error("Error fetching LLM balance:", error);
        setLlmBalanceError("Failed to load credit balance");
      } finally {
        setIsLoadingLlmBalance(false);
      }
    };

    fetchLlmBalance();
  }, [walletAddress, authenticated, llmBalanceRefreshKey]);

  useEffect(() => {
    if (!walletAddress || !authenticated) return;

    const fetchEnvVars = async () => {
      setIsLoadingEnvVars(true);
      try {
        const res = await fetch(
          `/api/openclaw/env-vars?userWallet=${walletAddress}`,
        );
        if (res.ok) {
          const data = await res.json();
          setEnvVars(data.envVars || []);
        }
      } catch (error) {
        console.error("Error fetching env vars:", error);
      } finally {
        setIsLoadingEnvVars(false);
      }
    };

    fetchEnvVars();
  }, [walletAddress, authenticated]);

  useEffect(() => {
    if (!walletAddress || !authenticated) return;

    const envVarMap = new Map(envVars.map((envVar) => [envVar.key, envVar.value]));

    const savedApiKey = envVarMap.get("KITE_API_KEY") || "";
    const savedApiSecret = envVarMap.get("KITE_API_SECRET") || "";

    if (!kiteApiKey && savedApiKey) {
      setKiteApiKey(savedApiKey);
    }

    if (!kiteApiSecret && savedApiSecret) {
      setKiteApiSecret(savedApiSecret);
    }

    const hasKiteConfig = Boolean(savedApiKey || savedApiSecret);
    if (!hasKiteConfig) {
      setZerodhaUserName(null);
      setZerodhaStatus("idle");
      return;
    }

    let cancelled = false;

    const fetchZerodhaSession = async () => {
      try {
        const res = await fetch(
          `/api/lazy-trading/programmatic/zerodha/session?userWallet=${walletAddress}`,
        );
        const data = await res.json();

        if (cancelled) return;

        if (res.ok && data.authenticated) {
          setZerodhaStatus("connected");
          setZerodhaUserName(
            data.profile?.user_name || data.profile?.user_shortname || null,
          );
          return;
        }

        if (data.expired) {
          setZerodhaUserName(
            data.profile?.user_name ||
              data.profile?.user_shortname ||
              envVarMap.get("KITE_USER_NAME") ||
              null,
          );
          setZerodhaStatus("expired");
          return;
        }

        setZerodhaUserName(envVarMap.get("KITE_USER_NAME") || null);
        setZerodhaStatus("idle");
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to fetch Zerodha session:", error);
        setZerodhaUserName(envVarMap.get("KITE_USER_NAME") || null);
        setZerodhaStatus("error");
      }
    };

    fetchZerodhaSession();

    return () => {
      cancelled = true;
    };
  }, [authenticated, envVars, kiteApiKey, kiteApiSecret, walletAddress]);

  const zerodhaCredsSaved = envVars.some(
    (envVar) =>
      envVar.key === "KITE_API_KEY" && Boolean(envVar.value),
  ) &&
    envVars.some(
      (envVar) =>
        envVar.key === "KITE_API_SECRET" && Boolean(envVar.value),
    );

  useEffect(() => {
    if (!walletAddress || !activated || instanceStatusPhase !== "ready") return;

    const fetchVersions = async () => {
      setIsCheckingVersions(true);
      setVersionUpdateMessage(null);
      try {
        const res = await fetch(
          `/api/openclaw/versions?userWallet=${walletAddress}`,
        );
        const data = await res.json();
        if (res.ok && data.success) {
          setOpenclawVersion(data.openclaw || null);
          setSkillVersion(data.skill || null);
        } else {
          console.error("[OpenClaw] Failed to fetch versions:", data.error);
          setVersionUpdateMessage({
            type: "error",
            text: data.error || "Failed to fetch version information",
          });
        }
      } catch (err) {
        console.error("[OpenClaw] Error fetching versions:", err);
        setVersionUpdateMessage({
          type: "error",
          text: "Failed to fetch version information",
        });
      } finally {
        setIsCheckingVersions(false);
      }
    };

    fetchVersions();
  }, [walletAddress, activated, instanceStatusPhase]);

  useEffect(() => {
    if (!walletAddress || !authenticated) return;
    setEigenRecordsLoading(true);
    setEigenRecordsError(null);
    fetch(`/api/eigenai/verifications?userAddress=${walletAddress}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEigenRecords(data.verifications || []);
        } else {
          setEigenRecordsError(data.error || "Failed to load records");
        }
      })
      .catch(() => setEigenRecordsError("Failed to load verification records"))
      .finally(() => setEigenRecordsLoading(false));
  }, [walletAddress, authenticated]);

  const handleEigenVerifySignature = async (
    record: EigenVerificationRecord,
  ) => {
    if (
      !record.llm_signature ||
      !record.llm_raw_output ||
      !record.llm_full_prompt
    ) {
      return;
    }
    setEigenSelectedRecord(record);
    setEigenModalOpen(true);
    setEigenVerifyResult(null);
    setEigenVerifyError(null);
    setEigenVerifying(true);
    try {
      const payload = {
        llm_signature: record.llm_signature,
        llm_raw_output: record.llm_raw_output,
        llm_model_used: record.llm_model_used || "gpt-oss-120b-f16",
        llm_chain_id: Number(record.llm_chain_id) || 1,
        llm_full_prompt: record.llm_full_prompt,
        _source: "openclaw",
      };
      const res = await fetch("/api/eigenai/verify-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success !== false) {
        setEigenVerifyResult(data);
      } else {
        setEigenVerifyError(
          data.error || data.message || "Verification failed",
        );
      }
    } catch (err: any) {
      setEigenVerifyError(err.message || "Request failed");
    } finally {
      setEigenVerifying(false);
    }
  };

  const handleGetStarted = () => {
    setErrorMessage("");
    if (!authenticated) {
      login();
      return;
    }
    if (!walletAddress) {
      setErrorMessage("Wallet address not available yet.");
      return;
    }
    setShowLanding(false);
  };

  const getCurrentPlanTier = () => {
    const plan = PLAN_OPTIONS.find((p) => p.id === selectedPlan);
    if (!plan) return null;
    return {
      name: plan.name,
      price: plan.priceLabel.replace("/mo", ""),
      credits: plan.budgetLabel,
    };
  };

  const handlePaymentSelection = async (method: "stripe" | "web3") => {
    if (method === "stripe") {
      setIsRedirecting(true);
      try {
        const tier = getCurrentPlanTier();
        const response = await fetch("/api/payments/stripe/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tierName: tier?.name.toUpperCase(),
            userWallet: walletAddress,
            returnUrl: `${window.location.origin}/openclaw`,
            source: "openclaw",
            wsProvider: webSearchEnabled
              ? selectedWebSearchProvider
              : undefined,
          }),
        });

        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error("Failed to create checkout session:", data.error);
          setErrorMessage("Failed to start Stripe checkout. Please try again.");
        }
      } catch (error) {
        console.error("Stripe error:", error);
        setErrorMessage("An error occurred. Please try again.");
      } finally {
        setIsRedirecting(false);
        setIsPaymentModalOpen(false);
      }
    } else {
      setIsPaymentModalOpen(false);
      setIsWeb3ModalOpen(true);
    }
  };

  const handlePlanContinue = () => {
    setIsPaymentModalOpen(true);
  };

  const handleSelectPlan = async () => {
    setErrorMessage("");
    if (!walletAddress) return;
    setIsLoading(true);

    try {
      const response = await postJson<{
        success: boolean;
        alreadyExists?: boolean;
        instance: {
          id: string;
          plan: string;
          model: string;
          status: string;
          telegramLinked?: boolean;
          telegramUsername?: string | null;
          webSearchProvider?: WebSearchProvider | null;
        };
      }>("/api/openclaw/create", {
        userWallet: walletAddress,
        plan: selectedPlan,
        webSearchProvider: webSearchEnabled ? selectedWebSearchProvider : null,
        ostiumUseTestnet,
      });

      setInstanceData({
        id: response.instance.id,
        plan: response.instance.plan,
        model: response.instance.model,
        status: response.instance.status,
        telegramLinked: response.instance.telegramLinked ?? false,
        telegramVerified: false,
        telegramUsername: response.instance.telegramUsername ?? null,
        webSearchProvider: response.instance.webSearchProvider ?? null,
      });

      if (response.alreadyExists) {
        setSelectedPlan(response.instance.plan as PlanId);
        setSelectedModel(response.instance.model);
        if (response.instance.telegramLinked) {
          setTelegramLinked(true);
          setTelegramUsername(response.instance.telegramUsername ?? null);
          markComplete("telegram");
        }
      }

      await handleCreateOpenAIKey();
      if (!maxxitApiKey) {
        await generateMaxxitApiKey();
      }

      markComplete("plan");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateWebSearch = async (
    enabled: boolean,
    provider: WebSearchProvider,
  ) => {
    if (!walletAddress) return;
    setIsUpdatingWebSearch(true);
    try {
      await postJson<{ success: boolean }>("/api/openclaw/update-web-search", {
        userWallet: walletAddress,
        webSearchProvider: enabled ? provider : null,
      });
      setWebSearchEnabled(enabled);
      setSelectedWebSearchProvider(provider);
      if (instanceData) {
        setInstanceData({
          ...instanceData,
          webSearchProvider: enabled ? provider : null,
        });
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsUpdatingWebSearch(false);
    }
  };

  const handleSubmitBotToken = async () => {
    if (!walletAddress || !botToken.trim()) return;
    setIsValidatingBot(true);
    setErrorMessage("");

    try {
      const response = await postJson<{
        success: boolean;
        bot?: { username: string; firstName: string };
      }>("/api/openclaw/connect-telegram", {
        userWallet: walletAddress,
        botToken: botToken.trim(),
      });

      if (response.bot?.username) {
        setBotUsername(response.bot.username);
      }
      setTelegramLinked(true);
      markComplete("telegram");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsValidatingBot(false);
    }
  };

  const handleActivate = async () => {
    setErrorMessage("");
    if (!walletAddress) return;
    setIsLoading(true);

    try {
      await postJson<{ success: boolean }>("/api/openclaw/activate", {
        userWallet: walletAddress,
        ...(maxxitApiKey && { maxxitApiKey }),
      });
      markComplete("activate");
      setActivated(true);
      setInstanceStatusPhase("launching");
      setInstanceStatusMessage("Launching instance...");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOpenAIKey = async () => {
    setErrorMessage("");
    if (!walletAddress) return;
    setIsCreatingOpenAIKey(true);
    setOpenaiKeyStatus("creating");

    try {
      const response = await postJson<{
        success: boolean;
        projectId?: string;
        keyPrefix?: string;
        createdAt?: string;
      }>("/api/openclaw/create-openai-key", {
        userWallet: walletAddress,
      });

      if (response.success) {
        setOpenaiKeyStatus("created");
        setOpenaiKeyPrefix(response.keyPrefix || null);
        setOpenaiKeyCreatedAt(response.createdAt || null);

        if (instanceData) {
          setInstanceData({
            ...instanceData,
            openaiProjectId: response.projectId || null,
            openaiServiceAccountId:
              response.keyPrefix?.replace("sk-svcacct-", "") || null,
            openaiApiKeyCreatedAt: response.createdAt || null,
          });
        }
      }
    } catch (error: any) {
      if (
        error.message.includes("already exists") ||
        error.message.includes("409")
      ) {
        setOpenaiKeyStatus("created");
      } else {
        setOpenaiKeyStatus("not_created");
        setErrorMessage((error as Error).message);
      }
    } finally {
      setIsCreatingOpenAIKey(false);
    }
  };

  const generateMaxxitApiKey = async () => {
    if (!walletAddress || maxxitApiKey) return;
    setIsGeneratingApiKey(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/lazy-trading/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: walletAddress }),
      });
      const data = await res.json();
      if (data.success && data.apiKey?.value) {
        setMaxxitApiKey(data.apiKey.value);
        setMaxxitApiKeyPrefix(data.apiKey.prefix || null);
        await fetch("/api/openclaw/store-skill-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userWallet: walletAddress,
            apiKey: data.apiKey.value,
          }),
        });
      } else {
        setErrorMessage(data.message || "Failed to generate API key");
      }
    } catch {
      setErrorMessage("Failed to generate API key");
    } finally {
      setIsGeneratingApiKey(false);
    }
  };

  const handleTopUpLlmCredits = async () => {
    if (!walletAddress) return;
    setIsRedirecting(true);
    try {
      const response = await fetch("/api/openclaw/llm-credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: walletAddress,
          amountCents: selectedTopUpAmount,
          returnUrl: `${window.location.origin}/openclaw`,
        }),
      });

      const data = await response.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        console.error("Failed to create checkout session:", data.error);
        setErrorMessage("Failed to start checkout. Please try again.");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setErrorMessage("An error occurred. Please try again.");
    } finally {
      setIsRedirecting(false);
    }
  };

  const handleCreateTradingDeployment = useCallback(
    async (enabledVenues?: string[]) => {
      if (!tradingAgentId || !walletAddress) return;
      setSkillSubStep("creating-deployment");
      setErrorMessage("");
      try {
        const res = await fetch("/api/openclaw/create-trading-deployment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: tradingAgentId,
            userWallet: walletAddress,
            enabledVenues,
            isTestnet: ostiumUseTestnet,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const syncedVenues = Array.isArray(data.deployment?.enabledVenues)
            ? data.deployment.enabledVenues
            : Array.isArray(data.deployment?.enabled_venues)
              ? data.deployment.enabled_venues
              : Array.isArray(enabledVenues)
                ? enabledVenues
                : [];
          setDeploymentEnabledVenues(syncedVenues);
          setHasDeployment(true);
          setOstiumUseTestnet(data.deployment?.isTestnet === true);
          setSkillSubStep("complete");
        } else {
          setErrorMessage(data.error || "Failed to create deployment");
          setSkillSubStep("agent-created");
        }
      } catch {
        setErrorMessage("Failed to create deployment");
        setSkillSubStep("agent-created");
      }
    },
    [tradingAgentId, walletAddress, ostiumUseTestnet],
  );

  useEffect(() => {
    if (!walletAddress || !lazyTradingEnabled || !ostiumAgentAddress) return;

    let cancelled = false;

    (async () => {
      setIsCheckingOstiumSetup(true);
      try {
        const [delegRes, approvalRes] = await Promise.all([
          fetch(
            `/api/ostium/check-delegation-status?userWallet=${walletAddress}&agentAddress=${ostiumAgentAddress}&isTestnet=${ostiumUseTestnet}`,
          ),
          fetch(
            `/api/ostium/check-approval-status?userWallet=${walletAddress}&isTestnet=${ostiumUseTestnet}`,
          ),
        ]);

        if (cancelled) return;

        const isDelegated = delegRes.ok
          ? (await delegRes.json()).isDelegatedToAgent === true
          : false;
        const hasApproval = approvalRes.ok
          ? (await approvalRes.json()).hasApproval === true
          : false;

        setDelegationComplete(isDelegated);
        setAllowanceComplete(hasApproval);

        if (isDelegated && hasApproval) {
          setSkillSubStep((prev) =>
            prev === "idle" ? "agent-created" : prev,
          );
          setErrorMessage("");
        }
      } catch {
        if (!cancelled) {
          setDelegationComplete(false);
          setAllowanceComplete(false);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingOstiumSetup(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, lazyTradingEnabled, ostiumAgentAddress, ostiumUseTestnet]);

  useEffect(() => {
    if (!lazyTradingEnabled || !walletAddress) return;
    if (lazyTradingSetupComplete || maxxitApiKey) return;

    (async () => {
      setIsCheckingLazyTradingSetup(true);
      try {
        const res = await fetch(
          `/api/lazy-trading/get-setup-status?userWallet=${walletAddress}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.hasSetup && data.step === "complete") {
            setLazyTradingSetupComplete(true);
          }
        }
      } catch (err) {
        console.error("Error checking lazy trading setup:", err);
      } finally {
        setIsCheckingLazyTradingSetup(false);
      }
    })();
  }, [
    lazyTradingEnabled,
    walletAddress,
    lazyTradingSetupComplete,
    maxxitApiKey,
  ]);

  // Fetch existing Maxxit API key prefix
  useEffect(() => {
    if (!walletAddress || !authenticated) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/lazy-trading/api-key?userWallet=${walletAddress}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.apiKey?.prefix) {
          setMaxxitApiKeyPrefix(data.apiKey.prefix);
        }
      } catch {
        // Ignore fetch errors here
      }
    })();
  }, [walletAddress, authenticated]);

  // ── Extracted handler functions ──────────────────────────────────────────

  const handleEnableOstiumTestnet = async () => {
    if (!walletAddress) return;
    setIsEnablingOstiumTestnet(true);
    setErrorMessage("");
    setOstiumTestnetMessage(null);

    try {
      const res = await fetch("/api/openclaw/enable-ostium-testnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: walletAddress,
          promoCode: ostiumPromoCode,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to enable Ostium testnet");
      }

      setOstiumUseTestnet(true);
      setOstiumPromoCode("");
      setOstiumTestnetMessage(
        data.message ||
        "Promo code accepted. Testnet USDC has been requested for your wallet.",
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsEnablingOstiumTestnet(false);
    }
  };

  const ensureWalletOnChain = useCallback(
    async (provider: any, networkKey: AgentFundingNetwork) => {
      const networkConfig = AGENT_FUNDING_NETWORKS[networkKey];
      const requiredChainHex = `0x${networkConfig.chainId.toString(16)}`;
      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const currentNetwork = await ethersProvider.getNetwork();

      if (currentNetwork.chainId === networkConfig.chainId) {
        return;
      }

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: requiredChainHex }],
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (switchError: any) {
        if (switchError.code !== 4902) {
          throw new Error(`Please switch to ${networkConfig.label}`);
        }

        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: requiredChainHex,
              chainName: networkConfig.chainName,
              nativeCurrency: {
                name: "Ether",
                symbol: networkConfig.currencySymbol,
                decimals: 18,
              },
              rpcUrls: [networkConfig.rpcUrl],
              blockExplorerUrls: [networkConfig.blockExplorerUrl],
            },
          ],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: requiredChainHex }],
        });
      }
    },
    [],
  );

  const handleSendAgentEth = async () => {
    if (
      !walletAddress ||
      !ostiumAgentAddress ||
      !agentEthAmount ||
      parseFloat(agentEthAmount) <= 0
    ) {
      setAgentEthError("Please enter a valid ETH amount");
      return;
    }

    setSendingAgentEth(true);
    setAgentEthError(null);
    setAgentEthTxHash(null);

    try {
      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error("No wallet provider found.");
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      await ethersProvider.send("eth_requestAccounts", []);
      await ensureWalletOnChain(provider, agentFundingNetwork);

      const freshEthersProvider = new ethers.providers.Web3Provider(provider);

      const amountInWei = ethers.utils.parseEther(agentEthAmount);

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: walletAddress,
            to: ostiumAgentAddress,
            value: amountInWei.toHexString(),
            gas: `0x${(21000).toString(16)}`,
          },
        ],
      });

      setAgentEthTxHash(txHash);
      try {
        await freshEthersProvider.waitForTransaction(txHash);
      } catch (waitErr: any) {
        if (
          waitErr?.code === "NETWORK_ERROR" ||
          waitErr?.message?.includes("underlying network changed")
        ) {
          //txHash is already set, treat as success
        } else {
          throw waitErr;
        }
      }
    } catch (error: any) {
      if (error.code === 4001 || error.message?.includes("rejected")) {
        setAgentEthError("Transaction rejected");
      } else {
        setAgentEthError(error.message || "Failed to send ETH");
      }
    } finally {
      setSendingAgentEth(false);
    }
  };

  const handleEnableTrading = async () => {
    if (!walletAddress || !ostiumAgentAddress) return;
    setEnablingTrading(true);
    setErrorMessage("");
    try {
      const requiredChainId = ostiumConfig.chainId;
      const requiredChainHex = `0x${requiredChainId.toString(16)}`;

      // Delegation
      if (!delegationComplete) {
        setSkillCurrentAction("Setting delegation...");
        const provider = (window as any).ethereum;
        if (!provider)
          throw new Error("No wallet provider found. Please install MetaMask.");
        await provider.request({ method: "eth_requestAccounts" });
        const ethersProvider = new ethers.providers.Web3Provider(provider);
        const network = await ethersProvider.getNetwork();
        if (network.chainId !== requiredChainId) {
          try {
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: requiredChainHex }],
            });
            await new Promise((r) => setTimeout(r, 500));
          } catch (switchErr: any) {
            if (switchErr.code === 4902) {
              await provider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: requiredChainHex,
                    chainName: ostiumConfig.chainName,
                    nativeCurrency: {
                      name: "Ether",
                      symbol: ostiumConfig.currencySymbol,
                      decimals: 18,
                    },
                    rpcUrls: [ostiumConfig.rpcUrl],
                    blockExplorerUrls: [ostiumConfig.blockExplorerUrl],
                  },
                ],
              });
              await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: requiredChainHex }],
              });
            } else {
              throw new Error(`Please switch to ${ostiumConfig.chainName}`);
            }
          }
        }
        const freshProvider = new ethers.providers.Web3Provider(
          (window as any).ethereum,
        );
        const signer = freshProvider.getSigner();
        const contract = new ethers.Contract(
          ostiumConfig.tradingContract,
          OSTIUM_TRADING_ABI,
          signer,
        );
        const gasEstimate =
          await contract.estimateGas.setDelegate(ostiumAgentAddress);
        const tx = await contract.setDelegate(ostiumAgentAddress, {
          gasLimit: gasEstimate.mul(150).div(100),
        });
        setSkillTxHash(tx.hash);
        await tx.wait();
        setDelegationComplete(true);
        setSkillTxHash(null);
        await new Promise((r) => setTimeout(r, 500));
      }

      // USDC Approval
      if (!allowanceComplete) {
        setSkillCurrentAction("Approving USDC allowance...");
        const provider = (window as any).ethereum;
        if (!provider) throw new Error("No wallet provider found.");
        const ethersProvider = new ethers.providers.Web3Provider(provider);
        await ethersProvider.send("eth_requestAccounts", []);
        const signer = ethersProvider.getSigner();
        const usdcContract = new ethers.Contract(
          ostiumConfig.usdcContract,
          USDC_ABI,
          signer,
        );
        const allowanceAmount = ethers.utils.parseUnits("1000000", 6);
        const approveData = usdcContract.interface.encodeFunctionData(
          "approve",
          [ostiumConfig.storageContract, allowanceAmount],
        );
        const gasEstimate = await ethersProvider.estimateGas({
          to: ostiumConfig.usdcContract,
          from: walletAddress,
          data: approveData,
        });
        const txHash = await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: walletAddress,
              to: ostiumConfig.usdcContract,
              data: approveData,
              gas: gasEstimate.mul(150).div(100).toHexString(),
            },
          ],
        });
        setSkillTxHash(txHash);
        await ethersProvider.waitForTransaction(txHash);
        setAllowanceComplete(true);
        setSkillTxHash(null);
      }
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes("rejected")) {
        setErrorMessage("Transaction rejected");
      } else {
        setErrorMessage(err.message || "Failed to enable trading");
      }
    } finally {
      setEnablingTrading(false);
      setSkillCurrentAction("");
    }
  };

  const checkAvantisOnchainSetupStatus = useCallback(
    async (userWalletAddress: string, agentAddress?: string | null) => {
      const provider = new ethers.providers.JsonRpcProvider(
        "https://mainnet.base.org",
      );
      const checksummedUser = ethers.utils.getAddress(userWalletAddress);
      const checksummedAgent = agentAddress
        ? ethers.utils.getAddress(agentAddress)
        : null;

      const tradingContract = new ethers.Contract(
        AVANTIS_TRADING_CONTRACT,
        ["function delegations(address delegator) view returns (address)"],
        provider,
      );
      const usdcContract = new ethers.Contract(
        AVANTIS_USDC_TOKEN,
        [
          "function allowance(address owner, address spender) view returns (uint256)",
        ],
        provider,
      );

      const [delegatedAddress, allowanceRaw] = await Promise.all([
        tradingContract.delegations(checksummedUser),
        usdcContract.allowance(checksummedUser, AVANTIS_STORAGE),
      ]);

      const isDelegatedToAgent = checksummedAgent
        ? String(delegatedAddress).toLowerCase() ===
        checksummedAgent.toLowerCase()
        : String(delegatedAddress) !== ethers.constants.AddressZero;
      const allowanceUsdc = parseFloat(
        ethers.utils.formatUnits(allowanceRaw, 6),
      );
      const hasApproval = allowanceUsdc >= 5;

      return {
        isDelegatedToAgent,
        hasApproval,
      };
    },
    [],
  );

  // Auto-sync Avantis setup state (same UX intent as Ostium checks)
  useEffect(() => {
    if (!walletAddress || !lazyTradingEnabled) return;

    const sharedAgentAddress = avantisAgentAddress || ostiumAgentAddress;
    if (!sharedAgentAddress) return;

    let cancelled = false;

    (async () => {
      try {
        const status = await checkAvantisOnchainSetupStatus(
          walletAddress,
          sharedAgentAddress,
        );
        if (cancelled) return;

        setAvantisAgentAddress(sharedAgentAddress);
        setAvantisDelegationComplete(status.isDelegatedToAgent);
        setAvantisAllowanceComplete(status.hasApproval);

        const ready = status.isDelegatedToAgent && status.hasApproval;
        setAvantisSetupComplete(ready);

        if (ready) {
          setAvantisEnabled(true);
          setAvantisSkillSubStep("complete");
        }
      } catch {
        // Keep current UI state if sync fails
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    walletAddress,
    lazyTradingEnabled,
    ostiumAgentAddress,
    avantisAgentAddress,
    checkAvantisOnchainSetupStatus,
  ]);

  const handleSetupAvantisAgent = useCallback(async () => {
    setAvantisSkillSubStep("creating-agent");
    setErrorMessage("");
    try {
      const res = await fetch("/api/openclaw/create-trading-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: walletAddress,
          venue: "AVANTIS",
          enabledVenues: ["AVANTIS"],
        }),
      });
      const data = await res.json();
      if (data.success) {
        const addr = data.avantisAgentAddress || data.ostiumAgentAddress;
        setAvantisAgentAddress(addr);
        if (data.deployment?.is_testnet === true) {
          setOstiumUseTestnet(true);
        }
        if (Array.isArray(data.deployment?.enabled_venues)) {
          setDeploymentEnabledVenues(data.deployment.enabled_venues);
        }
        // Also set the ostium agent address if it exists for shared wallet
        if (!ostiumAgentAddress && data.ostiumAgentAddress) {
          setOstiumAgentAddress(data.ostiumAgentAddress);
        }

        let delegated = false;
        let approved = false;

        // Check existing on-chain delegation + approval first
        try {
          const status = await checkAvantisOnchainSetupStatus(
            String(walletAddress),
            addr,
          );
          delegated = status.isDelegatedToAgent;
          approved = status.hasApproval;
        } catch {
          // Best-effort fallback to existing API routes if available
          try {
            const [delegRes, approvalRes] = await Promise.all([
              fetch(
                `/api/avantis/check-delegation-status?userWallet=${walletAddress}&agentAddress=${addr}`,
              ),
              fetch(
                `/api/avantis/check-approval-status?userWallet=${walletAddress}`,
              ),
            ]);
            if (delegRes.ok) {
              const d = await delegRes.json();
              delegated = d.isDelegatedToAgent === true;
            }
            if (approvalRes.ok) {
              const a = await approvalRes.json();
              approved = a.hasApproval === true;
            }
          } catch {}
        }

        setAvantisDelegationComplete(delegated);
        setAvantisAllowanceComplete(approved);

        if (delegated && approved) {
          setAvantisSetupComplete(true);
          setAvantisSkillSubStep("complete");
        } else {
          setAvantisSetupComplete(false);
          setAvantisSkillSubStep("agent-created");
        }
      } else {
        setErrorMessage(data.error || "Failed to setup Avantis agent");
        setAvantisSkillSubStep("idle");
      }
    } catch {
      setErrorMessage("Failed to setup Avantis agent");
      setAvantisSkillSubStep("idle");
    }
  }, [walletAddress, ostiumAgentAddress, checkAvantisOnchainSetupStatus]);

  const handleEnableAvantisTrading = async () => {
    if (!walletAddress || !avantisAgentAddress) return;
    setEnablingAvantisTrading(true);
    setErrorMessage("");
    try {
      let delegationDone = avantisDelegationComplete;
      let allowanceDone = avantisAllowanceComplete;

      // Sync state from chain in case user already approved outside this UI
      try {
        const status = await checkAvantisOnchainSetupStatus(
          walletAddress,
          avantisAgentAddress,
        );
        setAvantisDelegationComplete(status.isDelegatedToAgent);
        setAvantisAllowanceComplete(status.hasApproval);
        delegationDone = status.isDelegatedToAgent;
        allowanceDone = status.hasApproval;
        if (status.isDelegatedToAgent && status.hasApproval) {
          setAvantisSetupComplete(true);
          setAvantisSkillSubStep("complete");
          return;
        }
      } catch {
        // Continue with tx flow if status check fails
      }

      // Delegation on Base chain
      if (!delegationDone) {
        setAvantisSkillCurrentAction("Setting delegation on Base...");
        const provider = (window as any).ethereum;
        if (!provider)
          throw new Error("No wallet provider found. Please install MetaMask.");
        await provider.request({ method: "eth_requestAccounts" });
        const ethersProvider = new ethers.providers.Web3Provider(provider);
        const network = await ethersProvider.getNetwork();
        if (network.chainId !== BASE_CHAIN_ID) {
          try {
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
            });
            await new Promise((r) => setTimeout(r, 500));
          } catch (switchErr: any) {
            throw new Error(
              switchErr.code === 4902
                ? `Please add ${BASE_CHAIN_NAME} to your wallet`
                : `Please switch to ${BASE_CHAIN_NAME} network`,
            );
          }
        }
        const freshProvider = new ethers.providers.Web3Provider(
          (window as any).ethereum,
        );
        const signer = freshProvider.getSigner();
        const contract = new ethers.Contract(
          AVANTIS_TRADING_CONTRACT,
          AVANTIS_TRADING_ABI,
          signer,
        );
        const gasEstimate =
          await contract.estimateGas.setDelegate(avantisAgentAddress);
        const tx = await contract.setDelegate(avantisAgentAddress, {
          gasLimit: gasEstimate.mul(150).div(100),
        });
        setAvantisSkillTxHash(tx.hash);
        await tx.wait();
        setAvantisDelegationComplete(true);
        delegationDone = true;
        setAvantisSkillTxHash(null);
        await new Promise((r) => setTimeout(r, 500));
      }

      // USDC Approval on Base chain
      if (!allowanceDone) {
        setAvantisSkillCurrentAction("Approving USDC allowance on Base...");
        const provider = (window as any).ethereum;
        if (!provider) throw new Error("No wallet provider found.");
        const ethersProvider = new ethers.providers.Web3Provider(provider);
        await ethersProvider.send("eth_requestAccounts", []);
        const signer = ethersProvider.getSigner();
        const usdcContract = new ethers.Contract(
          AVANTIS_USDC_TOKEN,
          USDC_ABI,
          signer,
        );
        const allowanceAmount = ethers.utils.parseUnits("1000000", 6);
        const approveData = usdcContract.interface.encodeFunctionData(
          "approve",
          [AVANTIS_STORAGE, allowanceAmount],
        );
        const gasEstimate = await ethersProvider.estimateGas({
          to: AVANTIS_USDC_TOKEN,
          from: walletAddress,
          data: approveData,
        });
        const txHash = await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: walletAddress,
              to: AVANTIS_USDC_TOKEN,
              data: approveData,
              gas: gasEstimate.mul(150).div(100).toHexString(),
            },
          ],
        });
        setAvantisSkillTxHash(txHash);
        await ethersProvider.waitForTransaction(txHash);
        setAvantisAllowanceComplete(true);
        allowanceDone = true;
        setAvantisSkillTxHash(null);
      }

      setAvantisSetupComplete(true);
      setAvantisSkillSubStep("complete");
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes("rejected")) {
        setErrorMessage("Transaction rejected");
      } else {
        setErrorMessage(err.message || "Failed to enable Avantis trading");
      }
    } finally {
      setEnablingAvantisTrading(false);
      setAvantisSkillCurrentAction("");
    }
  };

  const handleUpdateOpenclaw = async () => {
    if (!walletAddress) return;
    setIsUpdatingOpenclaw(true);
    setVersionUpdateMessage(null);
    try {
      const res = await fetch("/api/openclaw/update-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: walletAddress, type: "openclaw" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setVersionUpdateMessage({
          type: "success",
          text: "OpenClaw updated successfully. It may take a moment to restart.",
        });
        setTimeout(async () => {
          try {
            setIsCheckingVersions(true);
            const vRes = await fetch(
              `/api/openclaw/versions?userWallet=${walletAddress}`,
            );
            const vData = await vRes.json();
            if (vRes.ok && vData.success) {
              setOpenclawVersion(vData.openclaw || null);
              setSkillVersion(vData.skill || null);
            }
          } finally {
            setIsCheckingVersions(false);
          }
        }, 5000);
      } else {
        setVersionUpdateMessage({
          type: "error",
          text: data.error || "Failed to update OpenClaw",
        });
      }
    } catch {
      setVersionUpdateMessage({
        type: "error",
        text: "Failed to update OpenClaw",
      });
    } finally {
      setIsUpdatingOpenclaw(false);
    }
  };

  const handleUpdateSkill = async () => {
    if (!walletAddress) return;
    setIsUpdatingSkill(true);
    setVersionUpdateMessage(null);
    try {
      const res = await fetch("/api/openclaw/update-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: walletAddress, type: "skill" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setVersionUpdateMessage({
          type: "success",
          text: "Lazy Trading skill updated successfully. It may take a moment to restart.",
        });
        setTimeout(async () => {
          try {
            setIsCheckingVersions(true);
            const vRes = await fetch(
              `/api/openclaw/versions?userWallet=${walletAddress}`,
            );
            const vData = await vRes.json();
            if (vRes.ok && vData.success) {
              setOpenclawVersion(vData.openclaw || null);
              setSkillVersion(vData.skill || null);
            }
          } finally {
            setIsCheckingVersions(false);
          }
        }, 5000);
      } else {
        setVersionUpdateMessage({
          type: "error",
          text: data.error || "Failed to update skill",
        });
      }
    } catch {
      setVersionUpdateMessage({
        type: "error",
        text: "Failed to update skill",
      });
    } finally {
      setIsUpdatingSkill(false);
    }
  };

  const handleAddEnvVar = async () => {
    if (!newEnvKey.trim() || !newEnvValue.trim()) return;
    setIsAddingEnvVar(true);
    setEnvVarMessage(null);
    try {
      const res = await fetch("/api/openclaw/env-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: walletAddress,
          key: newEnvKey.trim(),
          value: newEnvValue.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEnvVars((prev) => {
          const existing = prev.findIndex((v) => v.key === newEnvKey.trim());
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = {
              key: newEnvKey.trim(),
              value: newEnvValue.trim(),
            };
            return updated;
          }
          return [
            ...prev,
            { key: newEnvKey.trim(), value: newEnvValue.trim() },
          ];
        });
        setNewEnvKey("");
        setNewEnvValue("");
        setEnvVarMessage({ type: "success", text: data.message });
      } else {
        setEnvVarMessage({
          type: "error",
          text: data.error || "Failed to add variable",
        });
      }
    } catch {
      setEnvVarMessage({
        type: "error",
        text: "Failed to add environment variable",
      });
    } finally {
      setIsAddingEnvVar(false);
    }
  };

  const handleDeleteEnvVar = async (key: string) => {
    setDeletingEnvKey(key);
    setEnvVarMessage(null);
    try {
      const res = await fetch("/api/openclaw/env-vars", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: walletAddress, key }),
      });
      const data = await res.json();
      if (data.success) {
        setEnvVars((prev) => prev.filter((v) => v.key !== key));
        setRevealedEnvVars((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setEnvVarMessage({ type: "success", text: data.message });
      } else {
        setEnvVarMessage({
          type: "error",
          text: data.error || "Failed to delete",
        });
      }
    } catch {
      setEnvVarMessage({
        type: "error",
        text: "Failed to delete environment variable",
      });
    } finally {
      setDeletingEnvKey(null);
    }
  };

  const handleSaveZerodhaCreds = async () => {
    if (!walletAddress || !kiteApiKey.trim() || !kiteApiSecret.trim()) return;
    setZerodhaIsSavingCreds(true);
    setErrorMessage("");
    setEnvVarMessage({
      type: "success",
      text: "Saving Zerodha credentials...",
    });
    try {
      const saveRes = await fetch("/api/openclaw/env-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: walletAddress,
          vars: [
            { key: "KITE_API_KEY", value: kiteApiKey.trim() },
            { key: "KITE_API_SECRET", value: kiteApiSecret.trim() },
          ],
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.success) {
        throw new Error(
          saveData.error || "Failed to save Zerodha environment variables",
        );
      }

      setEnvVars((prev) => {
        const next = prev.filter(
          (envVar) =>
            envVar.key !== "KITE_API_KEY" && envVar.key !== "KITE_API_SECRET",
        );
        next.push({ key: "KITE_API_KEY", value: kiteApiKey.trim() });
        next.push({ key: "KITE_API_SECRET", value: kiteApiSecret.trim() });
        return next;
      });
      setEnvVarMessage({
        type: "success",
        text: saveData.message || "Zerodha credentials saved successfully",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save Zerodha credentials",
      );
    } finally {
      setZerodhaIsSavingCreds(false);
    }
  };

  const handleAuthenticateZerodha = async () => {
    if (!walletAddress) return;
    setZerodhaIsAuthenticating(true);
    setErrorMessage("");
    try {
      window.open(
        `/api/lazy-trading/programmatic/zerodha/login?userWallet=${encodeURIComponent(walletAddress)}&redirect=1`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      setErrorMessage("Failed to authenticate with Zerodha");
    } finally {
      setZerodhaIsAuthenticating(false);
    }
  };

  const handleRefreshEigen = () => {
    if (!walletAddress) return;
    setEigenRecordsLoading(true);
    setEigenRecordsError(null);
    fetch(`/api/eigenai/verifications?userAddress=${walletAddress}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setEigenRecords(d.verifications || []);
        else setEigenRecordsError(d.error || "Failed to reload");
      })
      .catch(() => setEigenRecordsError("Failed to reload"))
      .finally(() => setEigenRecordsLoading(false));
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)]">
        <Header />
        <div className="flex items-center justify-center py-40">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
      <Header />

      <div className="container mx-auto px-4 py-12 max-w-2xl flex-1">
        {showLanding ? (
          <OpenClawLanding onGetStarted={handleGetStarted} />
        ) : (
          <>
            <StepIndicator
              steps={STEPS}
              currentIndex={currentStepIndex}
              completedSteps={completedSteps}
            />

            {currentStepKey === "plan" && (
              <PlanStep
                completedSteps={completedSteps}
                instanceData={instanceData}
                selectedPlan={selectedPlan}
                onSelectPlan={setSelectedPlan}
                openaiKeyStatus={openaiKeyStatus}
                isCreatingOpenAIKey={isCreatingOpenAIKey}
                openaiKeyPrefix={openaiKeyPrefix}
                openaiKeyCreatedAt={openaiKeyCreatedAt}
                maxxitApiKey={maxxitApiKey}
                maxxitApiKeyPrefix={maxxitApiKeyPrefix}
                isGeneratingApiKey={isGeneratingApiKey}
                canContinueFromPlanStep={canContinueFromPlanStep}
                isLoading={isLoading}
                errorMessage={errorMessage}
                webSearchEnabled={webSearchEnabled}
                selectedWebSearchProvider={selectedWebSearchProvider}
                onWebSearchEnabledChange={setWebSearchEnabled}
                onSelectWebSearchProvider={setSelectedWebSearchProvider}
                isUpdatingWebSearch={isUpdatingWebSearch}
                onUpdateWebSearch={handleUpdateWebSearch}
                isActive={instanceData?.status === "active"}
                onContinue={goNext}
                onPlanContinue={handlePlanContinue}
              />
            )}

            {currentStepKey === "telegram" && (
              <TelegramStep
                telegramLinked={telegramLinked}
                telegramVerified={telegramVerified}
                botUsername={botUsername}
                botToken={botToken}
                onBotTokenChange={setBotToken}
                isValidatingBot={isValidatingBot}
                errorMessage={errorMessage}
                onSubmitBotToken={handleSubmitBotToken}
                onBack={goBack}
                onContinue={goNext}
                markComplete={markComplete}
              />
            )}

            {currentStepKey === "trading" && (
              <TradingStep
                walletAddress={walletAddress}
                errorMessage={errorMessage}
                onErrorMessage={setErrorMessage}
                lazyTradingEnabled={lazyTradingEnabled}
                onSetLazyTradingEnabled={setLazyTradingEnabled}
                onEnableLazyTradingSkill={handleEnableLazyTradingSkill}
                lazyTradingSetupComplete={lazyTradingSetupComplete}
                onSetLazyTradingSetupComplete={setLazyTradingSetupComplete}
                maxxitApiKey={maxxitApiKey}
                skillSubStep={skillSubStep}
                onSetSkillSubStep={setSkillSubStep}
                tradingAgentId={tradingAgentId}
                onSetTradingAgentId={setTradingAgentId}
                ostiumAgentAddress={ostiumAgentAddress}
                onSetOstiumAgentAddress={setOstiumAgentAddress}
                delegationComplete={delegationComplete}
                isCheckingOstiumSetup={isCheckingOstiumSetup}
                onSetDelegationComplete={setDelegationComplete}
                allowanceComplete={allowanceComplete}
                onSetAllowanceComplete={setAllowanceComplete}
                skillTxHash={skillTxHash}
                onSetSkillTxHash={setSkillTxHash}
                skillCurrentAction={skillCurrentAction}
                onSetSkillCurrentAction={setSkillCurrentAction}
                agentSetupSource={agentSetupSource}
                onSetAgentSetupSource={setAgentSetupSource}
                enablingTrading={enablingTrading}
                onSetEnablingTrading={setEnablingTrading}
                hasDeployment={hasDeployment}
                deploymentEnabledVenues={deploymentEnabledVenues}
                onSetHasDeployment={setHasDeployment}
                onSetDeploymentEnabledVenues={setDeploymentEnabledVenues}
                ostiumUseTestnet={ostiumUseTestnet}
                ostiumPromoCode={ostiumPromoCode}
                onOstiumPromoCodeChange={setOstiumPromoCode}
                isEnablingOstiumTestnet={isEnablingOstiumTestnet}
                ostiumTestnetMessage={ostiumTestnetMessage}
                onSetOstiumUseTestnet={setOstiumUseTestnet}
                onEnableOstiumTestnet={handleEnableOstiumTestnet}
                agentFundingNetwork={agentFundingNetwork}
                onAgentFundingNetworkChange={setAgentFundingNetwork}
                agentEthAmount={agentEthAmount}
                onAgentEthAmountChange={setAgentEthAmount}
                sendingAgentEth={sendingAgentEth}
                agentEthTxHash={agentEthTxHash}
                agentEthError={agentEthError}
                onSendAgentEth={handleSendAgentEth}
                asterEnabled={asterEnabled}
                onSetAsterEnabled={setAsterEnabled}
                isSavingAsterConfig={isSavingAsterConfig}
                onSetIsSavingAsterConfig={setIsSavingAsterConfig}
                asterShowGuide={asterShowGuide}
                onSetAsterShowGuide={setAsterShowGuide}
                avantisEnabled={avantisEnabled}
                onSetAvantisEnabled={setAvantisEnabled}
                avantisAgentAddress={avantisAgentAddress}
                onSetAvantisAgentAddress={setAvantisAgentAddress}
                avantisDelegationComplete={avantisDelegationComplete}
                onSetAvantisDelegationComplete={setAvantisDelegationComplete}
                avantisAllowanceComplete={avantisAllowanceComplete}
                onSetAvantisAllowanceComplete={setAvantisAllowanceComplete}
                avantisSetupComplete={avantisSetupComplete}
                onSetAvantisSetupComplete={setAvantisSetupComplete}
                avantisSkillSubStep={avantisSkillSubStep}
                onSetAvantisSkillSubStep={setAvantisSkillSubStep}
                enablingAvantisTrading={enablingAvantisTrading}
                avantisSkillCurrentAction={avantisSkillCurrentAction}
                avantisSkillTxHash={avantisSkillTxHash}
                zerodhaStatus={zerodhaStatus}
                zerodhaUserName={zerodhaUserName}
                zerodhaIsAuthenticating={zerodhaIsAuthenticating}
                zerodhaIsSavingCreds={zerodhaIsSavingCreds}
                zerodhaCredsSaved={zerodhaCredsSaved}
                kiteApiKey={kiteApiKey}
                kiteApiSecret={kiteApiSecret}
                onKiteApiKeyChange={setKiteApiKey}
                onKiteApiSecretChange={setKiteApiSecret}
                onSaveZerodhaCreds={handleSaveZerodhaCreds}
                onAuthenticateZerodha={handleAuthenticateZerodha}
                onBack={goBack}
                onContinue={goNext}
                onCreateTradingDeployment={handleCreateTradingDeployment}
                onSetupTradingAgent={handleSetupTradingAgent}
                onEnableTrading={handleEnableTrading}
                onSetupAvantisAgent={handleSetupAvantisAgent}
                onEnableAvantisTrading={handleEnableAvantisTrading}
                markComplete={markComplete}
              />
            )}

            {currentStepKey === "activate" && (
              <ActivateStep
                activated={activated}
                instanceStatusPhase={instanceStatusPhase}
                instanceStatusMessage={instanceStatusMessage ?? ""}
                selectedPlan={selectedPlan}
                selectedModel={selectedModel}
                telegramUsername={telegramUsername}
                openaiKeyStatus={openaiKeyStatus}
                openaiKeyPrefix={openaiKeyPrefix}
                maxxitApiKey={maxxitApiKey}
                maxxitApiKeyPrefix={maxxitApiKeyPrefix}
                isLoading={isLoading}
                errorMessage={errorMessage}
                onBack={goBack}
                onActivate={handleActivate}
                botUsername={botUsername}
                welcomeImage={welcomeImage}
                walletAddress={walletAddress}
                llmBalance={llmBalance}
                isLoadingLlmBalance={isLoadingLlmBalance}
                llmBalanceError={llmBalanceError}
                llmTopUpSuccess={llmTopUpSuccess}
                selectedTopUpAmount={selectedTopUpAmount}
                onSelectTopUpAmount={setSelectedTopUpAmount}
                isRedirecting={isRedirecting}
                onTopUp={handleTopUpLlmCredits}
                openclawVersion={openclawVersion}
                skillVersion={skillVersion}
                isCheckingVersions={isCheckingVersions}
                isUpdatingOpenclaw={isUpdatingOpenclaw}
                isUpdatingSkill={isUpdatingSkill}
                versionUpdateMessage={versionUpdateMessage}
                showVersionsSection={showVersionsSection}
                onToggleVersions={() => setShowVersionsSection((v) => !v)}
                onUpdateOpenclaw={handleUpdateOpenclaw}
                onUpdateSkill={handleUpdateSkill}
                zerodhaStatus={zerodhaStatus}
                zerodhaUserName={zerodhaUserName}
                zerodhaIsAuthenticating={zerodhaIsAuthenticating}
                zerodhaIsSavingCreds={zerodhaIsSavingCreds}
                zerodhaCredsSaved={zerodhaCredsSaved}
                kiteApiKey={kiteApiKey}
                kiteApiSecret={kiteApiSecret}
                onKiteApiKeyChange={setKiteApiKey}
                onKiteApiSecretChange={setKiteApiSecret}
                onSaveZerodhaCreds={handleSaveZerodhaCreds}
                onAuthenticateZerodha={handleAuthenticateZerodha}
                envVars={envVars}
                isLoadingEnvVars={isLoadingEnvVars}
                isAddingEnvVar={isAddingEnvVar}
                newEnvKey={newEnvKey}
                newEnvValue={newEnvValue}
                onNewEnvKeyChange={(v) =>
                  setNewEnvKey(v.toUpperCase().replace(/[^A-Z0-9_]/g, ""))
                }
                onNewEnvValueChange={setNewEnvValue}
                envVarMessage={envVarMessage}
                showEnvVarsSection={showEnvVarsSection}
                onToggleEnvVars={() => setShowEnvVarsSection((v) => !v)}
                revealedEnvVars={revealedEnvVars}
                onToggleRevealEnvVar={(key) => {
                  setRevealedEnvVars((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
                deletingEnvKey={deletingEnvKey}
                onAddEnvVar={handleAddEnvVar}
                onDeleteEnvVar={handleDeleteEnvVar}
                eigenRecords={eigenRecords}
                eigenRecordsLoading={eigenRecordsLoading}
                eigenRecordsError={eigenRecordsError}
                showEigenSection={showEigenSection}
                onToggleEigen={() => setShowEigenSection((v) => !v)}
                onRefreshEigen={handleRefreshEigen}
                onVerifyEigen={handleEigenVerifySignature}
                webSearchEnabled={webSearchEnabled}
                selectedWebSearchProvider={selectedWebSearchProvider}
                isUpdatingWebSearch={isUpdatingWebSearch}
                showWebSearchSection={showWebSearchSection}
                onToggleWebSearch={() => setShowWebSearchSection((v) => !v)}
                onUpdateWebSearch={handleUpdateWebSearch}
              />
            )}
          </>
        )}
      </div>

      {isRedirecting && (
        <div className="fixed inset-0 z-[110] bg-[var(--bg-deep)]/90 backdrop-blur-xl flex items-center justify-center flex-col gap-6 animate-in fade-in duration-500 px-4">
          <div className="relative">
            <Orbit
              className="h-16 w-16 text-[var(--accent)] animate-spin"
              style={{ animation: "spin 3s linear infinite" }}
            />
            <Zap className="h-6 w-6 text-[var(--accent)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-display uppercase tracking-widest text-[var(--accent)] mb-2">
              INITIALIZING SECURE GATEWAY
            </h2>
            <p className="text-[var(--text-muted)] text-xs tracking-[0.2em] font-bold">
              PREPARING ENCRYPTED SESSION · STACK: STRIPE
            </p>
          </div>
        </div>
      )}

      <PaymentSelectorModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        tier={getCurrentPlanTier()}
        onSelectPayment={handlePaymentSelection}
      />

      <Web3CheckoutModal
        isOpen={isWeb3ModalOpen}
        onClose={() => setIsWeb3ModalOpen(false)}
        tier={getCurrentPlanTier()}
        userWallet={walletAddress}
        onSuccess={(txHash) => {
          console.log("Web3 Payment Success:", txHash);
          setIsWeb3ModalOpen(false);
          handleSelectPlan();
        }}
      />

      <EigenAIModal
        isOpen={eigenModalOpen}
        onClose={() => {
          setEigenModalOpen(false);
          setEigenVerifyResult(null);
          setEigenVerifyError(null);
        }}
        record={eigenSelectedRecord}
        isVerifying={eigenVerifying}
        verifyResult={eigenVerifyResult}
        verifyError={eigenVerifyError}
        onRetry={() =>
          eigenSelectedRecord && handleEigenVerifySignature(eigenSelectedRecord)
        }
      />

      <FooterSection />
    </div>
  );
}
