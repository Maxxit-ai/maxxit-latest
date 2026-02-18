import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import { Header } from "@components/Header";
import FooterSection from "@components/home/FooterSection";
import { PaymentSelectorModal } from "@components/PaymentSelectorModal";
import { Web3CheckoutModal } from "@components/Web3CheckoutModal";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquare,
  Orbit,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import welcomeImage from "../public/openclaw_welcome.png";
import { ethers } from "ethers";
import { getOstiumConfig } from "../lib/ostium-config";
import { useWalletProvider } from "../hooks/useWalletProvider";

// Ostium contract configuration
const {
  tradingContract: OSTIUM_TRADING_CONTRACT,
  usdcContract: USDC_TOKEN,
  storageContract: OSTIUM_STORAGE,
  chainId: OSTIUM_CHAIN_ID,
  chainName: OSTIUM_CHAIN_NAME,
  rpcUrl: OSTIUM_RPC_URL,
  blockExplorerUrl: OSTIUM_BLOCK_EXPLORER_URL,
} = getOstiumConfig();
const OSTIUM_TRADING_ABI = ["function setDelegate(address delegate) external"];
const USDC_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

type SkillSubStep = 'idle' | 'creating-agent' | 'agent-created' | 'delegating' | 'approving' | 'creating-deployment' | 'complete';

type PlanId = "starter" | "pro";

type PlanOption = {
  id: PlanId;
  name: string;
  priceLabel: string;
  budgetLabel: string;
  modelsLabel: string;
};

type ModelOption = {
  id: string;
  name: string;
  minPlan: PlanId;
  costLabel: string;
  speedLabel: string;
};

type InstanceData = {
  id: string;
  plan: string;
  model: string;
  status: string;
  telegramLinked: boolean;
  telegramVerified: boolean;
  telegramUsername?: string | null;
  openaiProjectId?: string | null;
  openaiServiceAccountId?: string | null;
  openaiApiKeyCreatedAt?: string | null;
};

const STEPS = [
  { key: "plan", label: "Plan" },
  { key: "model", label: "Model" },
  { key: "telegram", label: "Telegram" },
  { key: "openai", label: "OpenAI" },
  { key: "ostium", label: "Ostium" },
  { key: "aster", label: "Aster" },
  { key: "apikey", label: "API Key" },
  { key: "activate", label: "Launch" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const PLAN_OPTIONS: PlanOption[] = [
  {
    id: "starter",
    name: "Starter",
    priceLabel: "$29/mo",
    budgetLabel: "$2 LLM usage",
    modelsLabel: "All models",
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$49/mo",
    budgetLabel: "$20 LLM usage",
    modelsLabel: "All models + custom skills",
  },
];

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    minPlan: "starter",
    costLabel: "$0.15 in / $0.60 out per 1M tokens",
    speedLabel: "Fast & efficient",
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    minPlan: "starter",
    costLabel: "$0.05 in / $0.40 out per 1M tokens",
    speedLabel: "Ultra-fast",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    minPlan: "starter",
    costLabel: "~$2.50/1M tokens",
    speedLabel: "Balanced",
  },
];

const PLAN_RANKS: Record<PlanId, number> = { starter: 0, pro: 1 };

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as T;
  if (!response.ok) {
    const error = (data as { error?: string })?.error;
    throw new Error(error || "Request failed");
  }
  return data;
}

function StepIndicator({
  steps,
  currentIndex,
  completedSteps,
}: {
  steps: typeof STEPS;
  currentIndex: number;
  completedSteps: Set<StepKey>;
}) {
  return (
    <div className="flex items-center justify-center gap-1 mb-10">
      {steps.map((s, i) => {
        const isCompleted = completedSteps.has(s.key);
        const isCurrent = i === currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${isCompleted
                  ? "bg-[var(--accent)] text-[var(--bg-deep)]"
                  : isCurrent
                    ? "border-2 border-[var(--accent)] text-[var(--accent)]"
                    : "border border-[var(--border)] text-[var(--text-muted)]"
                  }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider ${isCurrent
                  ? "text-[var(--accent)]"
                  : isCompleted
                    ? "text-[var(--text-secondary)]"
                    : "text-[var(--text-muted)]"
                  } whitespace-nowrap leading-none`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-10 h-px mb-5 ${isCompleted
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--border)]"
                  }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OpenClawSetupPage() {
  const router = useRouter();
  const { authenticated, user, login } = usePrivy();
  const { getEip1193Provider } = useWalletProvider();
  const walletAddress = user?.wallet?.address;

  const [showLanding, setShowLanding] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [completedSteps, setCompletedSteps] = useState<Set<StepKey>>(
    new Set()
  );
  const [instanceData, setInstanceData] = useState<InstanceData | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<PlanId>("starter");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
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
  const [lazyTradingSetupComplete, setLazyTradingSetupComplete] = useState(false);
  const [isCheckingLazyTradingSetup, setIsCheckingLazyTradingSetup] = useState(false);
  const [maxxitApiKey, setMaxxitApiKey] = useState<string | null>(null);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);

  const [skillSubStep, setSkillSubStep] = useState<SkillSubStep>('idle');
  const [tradingAgentId, setTradingAgentId] = useState<string | null>(null);
  const [ostiumAgentAddress, setOstiumAgentAddress] = useState<string | null>(null);
  const [delegationComplete, setDelegationComplete] = useState(false);
  const [allowanceComplete, setAllowanceComplete] = useState(false);
  const [agentFundingComplete, setAgentFundingComplete] = useState(false);
  const [agentFundingAmountEth, setAgentFundingAmountEth] = useState("0.005");
  const [skillTxHash, setSkillTxHash] = useState<string | null>(null);
  const [skillCurrentAction, setSkillCurrentAction] = useState("");
  const [enablingTrading, setEnablingTrading] = useState(false);
  const [hasDeployment, setHasDeployment] = useState(false);

  // Aster DEX state
  const [asterEnabled, setAsterEnabled] = useState(false);
  const [asterAgentAddress, setAsterAgentAddress] = useState<string | null>(null);
  const [asterConfigured, setAsterConfigured] = useState(false);
  const [isSavingAsterConfig, setIsSavingAsterConfig] = useState(false);
  const [asterShowGuide, setAsterShowGuide] = useState(false);

  const [openaiKeyStatus, setOpenaiKeyStatus] = useState<'not_created' | 'creating' | 'created'>('not_created');
  const [openaiKeyPrefix, setOpenaiKeyPrefix] = useState<string | null>(null);
  const [openaiKeyCreatedAt, setOpenaiKeyCreatedAt] = useState<string | null>(null);
  const [isCreatingOpenAIKey, setIsCreatingOpenAIKey] = useState(false);

  const [instanceStatusPhase, setInstanceStatusPhase] = useState<
    "launching" | "starting" | "checking" | "ready" | "error" | null
  >(null);
  const [instanceStatusMessage, setInstanceStatusMessage] = useState<string | null>(null);


  const [llmBalance, setLlmBalance] = useState<{ balanceCents: number; totalPurchased: number; totalUsed: number; limitReached: boolean } | null>(null);
  const [isLoadingLlmBalance, setIsLoadingLlmBalance] = useState(false);
  const [llmBalanceError, setLlmBalanceError] = useState<string | null>(null);
  const [selectedTopUpAmount, setSelectedTopUpAmount] = useState<number>(1000); // Default to $10.00 in cents
  const [llmTopUpSuccess, setLlmTopUpSuccess] = useState(false);
  const [llmBalanceRefreshKey, setLlmBalanceRefreshKey] = useState(0); // Used to trigger balance re-fetch
  const currentStepKey = STEPS[currentStepIndex]?.key;
  const requiresApiKeyGeneration = lazyTradingSetupComplete || skillSubStep === "complete" || asterEnabled;
  const canContinueFromApiKeyStep = !!maxxitApiKey || !requiresApiKeyGeneration;

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

  const checkAgentFundingStatus = useCallback(async (agentAddress: string): Promise<boolean> => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(OSTIUM_RPC_URL);
      const agentBalance = await provider.getBalance(agentAddress);
      const isFunded = agentBalance.gt(0);
      setAgentFundingComplete(isFunded);
      return isFunded;
    } catch (error) {
      console.error("[OpenClaw] Failed to check agent funding status:", error);
      setAgentFundingComplete(false);
      return false;
    }
  }, []);

  const loadExistingProgress = useCallback(async () => {
    if (!walletAddress) return;
    setInitialLoading(true);

    try {
      const res = await fetch(
        `/api/openclaw/status?userWallet=${walletAddress}`
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
        telegramUsername: inst.telegram.botUsername,
        openaiProjectId: inst.openai?.projectId ?? null,
        openaiServiceAccountId: inst.openai?.serviceAccountId ?? null,
        openaiApiKeyCreatedAt: inst.openai?.keyCreatedAt ?? null,
      });

      setSelectedPlan(inst.plan as PlanId);
      setSelectedModel(inst.model);
      markComplete("plan");

      if (inst.model) {
        markComplete("model");
      }

      if (inst.telegram.botUsername) {
        setTelegramLinked(true);
        setTelegramUsername(inst.telegram.botUsername);
        setBotUsername(inst.telegram.botUsername);
      }

      if (inst.telegram.linked && inst.telegram.userId) {
        setTelegramVerified(true);
        markComplete("telegram");
      }

      if (inst.status === "active") {
        markComplete("ostium");
        markComplete("aster");
        markComplete("apikey");
        markComplete("openai");
        markComplete("telegram");
        markComplete("activate");
        setActivated(true);
        setTelegramVerified(true);
        setInstanceStatusPhase("checking");
        setInstanceStatusMessage("Checking instance status...");
      }

      if (inst.openai?.projectId) {
        markComplete("openai");
        setOpenaiKeyStatus("created");
        setOpenaiKeyPrefix(inst.openai.serviceAccountId ? `sk-svcacct-${inst.openai.serviceAccountId.substring(0, 8)}...` : null);
        setOpenaiKeyCreatedAt(inst.openai.keyCreatedAt || null);
      }

      if (inst.status === "active") {
        setCurrentStepIndex(7);
      } else if (inst.telegram.linked && inst.telegram.userId && inst.openai?.projectId) {
        setCurrentStepIndex(4);
      } else if (inst.telegram.linked && inst.telegram.userId) {
        setCurrentStepIndex(3);
      } else if (inst.telegram.username) {
        setCurrentStepIndex(2);
      } else if (inst.model) {
        setCurrentStepIndex(2);
      } else {
        setCurrentStepIndex(1);
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
  const [pendingPaymentPlan, setPendingPaymentPlan] = useState<PlanId | null>(null);

  useEffect(() => {
    const { payment, tier } = router.query;
    if (payment === 'success' && tier && walletAddress && authenticated) {
      const planId = (tier as string).toLowerCase() as PlanId;
      if (PLAN_OPTIONS.some(p => p.id === planId)) {
        setSelectedPlan(planId);
        setShowLanding(false);
        setPendingPaymentPlan(planId);
        router.replace('/openclaw', undefined, { shallow: true });
      }
    } else if (payment === 'cancelled') {
      router.replace('/openclaw', undefined, { shallow: true });
    }
  }, [router.query, walletAddress, authenticated]);

  // Handle LLM top-up success redirect from Stripe
  useEffect(() => {
    const { payment, llm_topup } = router.query;
    if (payment === 'success' && llm_topup === 'true' && walletAddress && authenticated) {
      router.replace('/openclaw', undefined, { shallow: true });

      (async () => {
        try {
          console.log('[OpenClaw] Calling verify-topup API for wallet:', walletAddress);
          const verifyRes = await fetch('/api/openclaw/llm-credits/verify-topup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userWallet: walletAddress }),
          });

          const data = await verifyRes.json();
          console.log('[OpenClaw] verify-topup response:', data);

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
            console.error('[OpenClaw] verify-topup failed:', data.error);
            setLlmBalanceRefreshKey((prev) => prev + 1);
            setLlmTopUpSuccess(true);
            setTimeout(() => setLlmTopUpSuccess(false), 5000);
          }
        } catch (error) {
          console.error('[OpenClaw] Error calling verify-topup:', error);
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
          const response = await fetch('/api/openclaw/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userWallet: walletAddress,
              plan: pendingPaymentPlan,
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
            });
            markComplete('plan');
            setCurrentStepIndex(1);
          } else {
            setErrorMessage(data.error || 'Failed to create instance');
          }
        } catch (error) {
          setErrorMessage((error as Error).message);
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [pendingPaymentPlan, walletAddress, isLoading, markComplete]);

  // Check if Aster is configured (agent wallet exists + aster_enabled)
  useEffect(() => {
    if (!walletAddress || !authenticated) return;

    (async () => {
      try {
        const res = await fetch(`/api/lazy-trading/check-aster-config?userWallet=${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          if (data.configured) {
            setAsterConfigured(true);
            setAsterAgentAddress(data.agentAddress || null);
          }
          if (data.asterEnabled) {
            setAsterEnabled(true);
          }
        }
      } catch (err) {
        console.error('[OpenClaw] Failed to check Aster config:', err);
      }
    })();
  }, [walletAddress, authenticated]);

  useEffect(() => {
    if (!walletAddress || currentStepKey !== "telegram" || !telegramLinked || telegramVerified) {
      return;
    }

    const checkVerification = async () => {
      try {
        const res = await fetch(`/api/openclaw/status?userWallet=${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          if (data.instance?.telegram?.linked) {
            setTelegramVerified(true);
            markComplete("telegram");
          }
        }
      } catch {
      }
    };

    const interval = setInterval(checkVerification, 3000);
    return () => clearInterval(interval);
  }, [walletAddress, currentStepKey, telegramLinked, telegramVerified, markComplete]);

  useEffect(() => {
    if (!walletAddress || !activated || instanceStatusPhase === "ready" || instanceStatusPhase === null) {
      return;
    }

    const checkInstanceStatus = async () => {
      try {
        const res = await fetch(`/api/openclaw/instance-status?userWallet=${walletAddress}`);
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
      } catch {
      }
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
        const res = await fetch(`/api/openclaw/llm-credits/balance?userWallet=${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          setLlmBalance({
            balanceCents: data.balanceCents || 0,
            totalPurchased: data.totalPurchased || 0,
            totalUsed: data.totalUsed || 0,
            limitReached: data.limitReached || false,
          });
        } else {
          console.error('Failed to fetch LLM balance');
        }
      } catch (error) {
        console.error('Error fetching LLM balance:', error);
        setLlmBalanceError('Failed to load credit balance');
      } finally {
        setIsLoadingLlmBalance(false);
      }
    };

    fetchLlmBalance();
  }, [walletAddress, authenticated, llmBalanceRefreshKey]);

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

  const handlePaymentSelection = async (method: 'stripe' | 'web3') => {
    if (method === 'stripe') {
      setIsRedirecting(true);
      try {
        const tier = getCurrentPlanTier();
        const response = await fetch('/api/payments/stripe/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tierName: tier?.name.toUpperCase(),
            userWallet: walletAddress,
            returnUrl: `${window.location.origin}/openclaw`,
            source: 'openclaw',
          }),
        });

        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error('Failed to create checkout session:', data.error);
          setErrorMessage('Failed to start Stripe checkout. Please try again.');
        }
      } catch (error) {
        console.error('Stripe error:', error);
        setErrorMessage('An error occurred. Please try again.');
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
        };
      }>("/api/openclaw/create", {
        userWallet: walletAddress,
        plan: selectedPlan,
      });

      setInstanceData({
        id: response.instance.id,
        plan: response.instance.plan,
        model: response.instance.model,
        status: response.instance.status,
        telegramLinked: response.instance.telegramLinked ?? false,
        telegramVerified: false,
        telegramUsername: response.instance.telegramUsername ?? null,
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

      markComplete("plan");
      goNext();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectModel = async () => {
    setErrorMessage("");
    if (!walletAddress) return;
    setIsLoading(true);

    try {
      await postJson<{ success: boolean }>("/api/openclaw/update-model", {
        userWallet: walletAddress,
        model: selectedModel,
      });
      markComplete("model");
      goNext();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
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
        setTelegramUsername(response.bot.username);
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
        markComplete("openai");

        if (instanceData) {
          setInstanceData({
            ...instanceData,
            openaiProjectId: response.projectId || null,
            openaiServiceAccountId: response.keyPrefix?.replace('sk-svcacct-', '') || null,
            openaiApiKeyCreatedAt: response.createdAt || null,
          });
        }
      }
    } catch (error: any) {
      if (error.message.includes('already exists') || error.message.includes('409')) {
        setOpenaiKeyStatus("created");
        markComplete("openai");
      } else {
        setOpenaiKeyStatus("not_created");
        setErrorMessage((error as Error).message);
      }
    } finally {
      setIsCreatingOpenAIKey(false);
    }
  };


  const handleTopUpLlmCredits = async () => {
    if (!walletAddress) return;
    setIsRedirecting(true);
    try {
      const response = await fetch('/api/openclaw/llm-credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        console.error('Failed to create checkout session:', data.error);
        setErrorMessage('Failed to start checkout. Please try again.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setErrorMessage('An error occurred. Please try again.');
    } finally {
      setIsRedirecting(false);
    }
  };

  const handleCreateTradingDeployment = useCallback(async () => {
    if (!tradingAgentId || !walletAddress) return;
    setSkillSubStep('creating-deployment');
    setErrorMessage("");
    try {
      const res = await fetch("/api/openclaw/create-trading-deployment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: tradingAgentId, userWallet: walletAddress }),
      });
      const data = await res.json();
      if (data.success) {
        setHasDeployment(true);
        setSkillSubStep('complete');
      } else {
        setErrorMessage(data.error || "Failed to create deployment");
        setSkillSubStep('agent-created');
      }
    } catch {
      setErrorMessage("Failed to create deployment");
      setSkillSubStep('agent-created');
    }
  }, [tradingAgentId, walletAddress]);

  useEffect(() => {
    if (!ostiumAgentAddress || skillSubStep !== "agent-created") return;
    checkAgentFundingStatus(ostiumAgentAddress);
  }, [ostiumAgentAddress, skillSubStep, checkAgentFundingStatus]);

  useEffect(() => {
    if (!lazyTradingEnabled || !walletAddress) return;
    if (maxxitApiKey) return;

    (async () => {
      setIsCheckingLazyTradingSetup(true);
      try {
        const res = await fetch(`/api/lazy-trading/get-setup-status?userWallet=${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.hasSetup) {
            const existingAgentAddress = data.ostiumAgentAddress || null;
            const hasExistingDeployment = !!data.deployment?.id;
            if (existingAgentAddress) {
              setOstiumAgentAddress(existingAgentAddress);
              setTradingAgentId(data.agent?.id || null);
              setDelegationComplete(data.isDelegatedToAgent === true);
              setAllowanceComplete(data.hasUsdcApproval === true);
              setHasDeployment(hasExistingDeployment);
              const isAgentFunded = await checkAgentFundingStatus(existingAgentAddress);
              const isFullyComplete =
                hasExistingDeployment &&
                data.isDelegatedToAgent === true &&
                data.hasUsdcApproval === true &&
                isAgentFunded;
              setLazyTradingSetupComplete(isFullyComplete);
              setSkillSubStep(isFullyComplete ? "complete" : "agent-created");
            } else {
              setLazyTradingSetupComplete(false);
            }
          }
        }
      } catch (err) {
        console.error("Error checking lazy trading setup:", err);
      } finally {
        setIsCheckingLazyTradingSetup(false);
      }
    })();
  }, [lazyTradingEnabled, walletAddress, maxxitApiKey, checkAgentFundingStatus]);

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
          <div className="text-center space-y-8">
            <div className="w-20 h-20 mx-auto bg-[var(--accent)] rounded-2xl flex items-center justify-center">
              <Bot className="w-10 h-10 text-[var(--bg-deep)]" />
            </div>
            <div>
              <h1 className="font-display text-4xl mb-4">
                OpenClaw on Maxxit
              </h1>
              <p className="text-lg text-[var(--text-secondary)] max-w-md mx-auto">
                Your personal AI assistant. Choose a plan, pick a model, link
                Telegram, and you're live.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              <div className="border border-[var(--border)] p-4 rounded-lg">
                <Shield className="w-6 h-6 text-[var(--accent)] mb-2" />
                <p className="font-semibold">Dedicated instance</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Isolated runtime with your own config.
                </p>
              </div>
              <div className="border border-[var(--border)] p-4 rounded-lg">
                <MessageSquare className="w-6 h-6 text-[var(--accent)] mb-2" />
                <p className="font-semibold">Telegram ready</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Connect once and chat from your phone.
                </p>
              </div>
              <div className="border border-[var(--border)] p-4 rounded-lg">
                <Sparkles className="w-6 h-6 text-[var(--accent)] mb-2" />
                <p className="font-semibold">LLM budget included</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Simple monthly limits per plan.
                </p>
              </div>
            </div>
            <button
              onClick={handleGetStarted}
              className="px-10 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-lg rounded-lg flex items-center justify-center gap-2 mx-auto hover:opacity-90 transition-opacity"
            >
              <Zap className="w-5 h-5" />
              GET STARTED
            </button>
          </div>
        ) : (
          <>
            <StepIndicator
              steps={STEPS}
              currentIndex={currentStepIndex}
              completedSteps={completedSteps}
            />

            {/* Step 1: Plan */}
            {currentStepKey === "plan" && (
              <div className="space-y-6">
                {completedSteps.has("plan") && instanceData ? (
                  <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-6 text-center space-y-3">
                    <Check className="w-10 h-10 mx-auto text-[var(--accent)]" />
                    <p className="font-bold text-lg">
                      Plan selected:{" "}
                      <span className="text-[var(--accent)]">
                        {PLAN_OPTIONS.find((p) => p.id === selectedPlan)?.name}
                      </span>
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Instance already created.
                    </p>
                    <button
                      onClick={goNext}
                      className="mt-4 px-8 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center gap-2 mx-auto hover:opacity-90 transition-opacity"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-center">
                      <h1 className="font-display text-2xl mb-2">
                        Choose your plan
                      </h1>
                      <p className="text-[var(--text-secondary)]">
                        Each plan includes hosting, usage tracking, and Telegram
                        integration.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {PLAN_OPTIONS.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => setSelectedPlan(plan.id)}
                          className={`w-full p-5 border text-left rounded-lg transition-all ${selectedPlan === plan.id
                            ? "border-[var(--accent)] bg-[var(--accent)]/10"
                            : "border-[var(--border)] hover:border-[var(--accent)]/50"
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-lg">{plan.name}</p>
                              <p className="text-sm text-[var(--text-secondary)]">
                                {plan.budgetLabel} · {plan.modelsLabel}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-display text-xl">
                                {plan.priceLabel}
                              </span>
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedPlan === plan.id
                                  ? "border-[var(--accent)] bg-[var(--accent)]"
                                  : "border-[var(--border)]"
                                  }`}
                              >
                                {selectedPlan === plan.id && (
                                  <Check className="w-3 h-3 text-[var(--bg-deep)]" />
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handlePlanContinue}
                      disabled={isLoading}
                      className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          Subscribe & Continue
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </>
                )}
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Step 2: Model */}
            {currentStepKey === "model" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="font-display text-2xl mb-2">
                    Choose your model
                  </h1>
                  <p className="text-[var(--text-secondary)]">
                    Model access depends on your plan tier.
                  </p>
                </div>
                <div className="space-y-3">
                  {MODEL_OPTIONS.map((model) => {
                    const allowed =
                      PLAN_RANKS[selectedPlan] >= PLAN_RANKS[model.minPlan];
                    return (
                      <button
                        key={model.id}
                        onClick={() => allowed && setSelectedModel(model.id)}
                        disabled={!allowed}
                        className={`w-full p-4 border text-left rounded-lg transition-all ${!allowed
                          ? "opacity-40 cursor-not-allowed border-[var(--border)]"
                          : selectedModel === model.id
                            ? "border-[var(--accent)] bg-[var(--accent)]/10"
                            : "border-[var(--border)] hover:border-[var(--accent)]/50"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold">{model.name}</p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {model.speedLabel}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm text-[var(--text-secondary)]">
                                {model.costLabel}
                              </p>
                              {!allowed && (
                                <p className="text-xs text-[var(--accent)]">
                                  Requires {model.minPlan}
                                </p>
                              )}
                            </div>
                            {allowed && (
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedModel === model.id
                                  ? "border-[var(--accent)] bg-[var(--accent)]"
                                  : "border-[var(--border)]"
                                  }`}
                              >
                                {selectedModel === model.id && (
                                  <Check className="w-3 h-3 text-[var(--bg-deep)]" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={goBack}
                    className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleSelectModel}
                    disabled={isLoading}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Continue
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Telegram */}
            {currentStepKey === "telegram" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="font-display text-2xl mb-2">
                    Create Your Telegram Bot
                  </h1>
                  <p className="text-[var(--text-secondary)]">
                    Your own private bot — messages go directly to your instance.
                  </p>
                </div>

                {telegramLinked ? (
                  <div className="space-y-4">
                    {/* Bot Connected Status */}
                    <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-6 text-center space-y-2">
                      <Check className="w-10 h-10 mx-auto text-[var(--accent)]" />
                      <p className="font-bold text-lg">
                        Bot connected
                        {botUsername ? ` — @${botUsername}` : ""}
                      </p>
                    </div>

                    {!telegramVerified && (
                      <div className="border border-yellow-500/50 bg-yellow-500/10 rounded-lg p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 text-yellow-500" />
                          <p className="font-bold text-yellow-500">Verification Required</p>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Send any message to your bot <strong>@{botUsername}</strong> to verify your account.
                          This links your Telegram ID for secure access.
                        </p>
                        <a
                          href={`tg://resolve?domain=${botUsername}`}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open @{botUsername} in Telegram
                        </a>
                      </div>
                    )}

                    {telegramVerified && (
                      <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4 flex items-center gap-3">
                        <Shield className="w-5 h-5 text-green-500" />
                        <p className="text-sm text-green-400">
                          <strong>Verified!</strong> Your Telegram account is linked and ready.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="border border-[var(--border)] rounded-lg p-5 space-y-3">
                      <p className="font-bold text-sm uppercase tracking-wider text-[var(--text-muted)]">
                        Setup Guide
                      </p>
                      <ol className="space-y-2 text-sm text-[var(--text-secondary)]">
                        <li className="flex gap-2">
                          <span className="font-bold text-[var(--accent)] shrink-0">1.</span>
                          <span>
                            Open{" "}
                            <a
                              href="tg://resolve?domain=BotFather"
                              className="text-[#0088cc] underline"
                            >
                              @BotFather
                            </a>{" "}
                            in Telegram
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-bold text-[var(--accent)] shrink-0">2.</span>
                          <span>Send <code className="px-1.5 py-0.5 bg-[var(--bg-card)] rounded text-xs font-mono">/newbot</code> and follow the prompts</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-bold text-[var(--accent)] shrink-0">3.</span>
                          <span>Copy the bot token BotFather gives you</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-bold text-[var(--accent)] shrink-0">4.</span>
                          <span>Paste it below</span>
                        </li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[var(--text-secondary)]">
                        Bot Token
                      </label>
                      <input
                        type="password"
                        value={botToken}
                        onChange={(e) => setBotToken(e.target.value)}
                        placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        className="w-full px-4 py-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm font-mono focus:border-[var(--accent)] focus:outline-none transition-colors"
                      />
                    </div>

                    <button
                      onClick={handleSubmitBotToken}
                      disabled={isValidatingBot || !botToken.trim()}
                      className="w-full py-4 bg-[#0088cc] text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isValidatingBot ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <MessageSquare className="w-5 h-5" />
                          Verify & Connect Bot
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={goBack}
                    className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => {
                      markComplete("telegram");
                      goNext();
                    }}
                    disabled={!telegramVerified}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Step 4: OpenAI Key */}
            {currentStepKey === "openai" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="font-display text-2xl mb-2">
                    Create OpenAI API Key
                  </h1>
                  <p className="text-[var(--text-secondary)]">
                    Generate a personal OpenAI API key for usage tracking and budget management.
                  </p>
                </div>

                {openaiKeyStatus === "created" && openaiKeyPrefix ? (
                  <div className="space-y-4">
                    {/* Success State */}
                    <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-6 text-center space-y-3">
                      <Check className="w-10 h-10 mx-auto text-[var(--accent)]" />
                      <p className="font-bold text-lg">
                        OpenAI API Key Created
                      </p>
                      <div className="bg-[var(--bg-card)] rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-[var(--text-muted)]">Key Prefix</span>
                          <span className="font-mono font-semibold">{openaiKeyPrefix}</span>
                        </div>
                        {openaiKeyCreatedAt && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-muted)]">Created</span>
                            <span className="font-semibold">
                              {new Date(openaiKeyCreatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border border-[var(--border)] rounded-lg p-4 space-y-2">
                      <p className="text-sm text-[var(--text-secondary)]">
                        <strong>What's next?</strong>
                      </p>
                      <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                        <li className="flex items-start gap-2">
                          <span className="text-[var(--accent)]">•</span>
                          <span>Your personal API key enables usage tracking</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-[var(--accent)]">•</span>
                          <span>LLM costs are deducted from your plan's monthly budget</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-[var(--accent)]">•</span>
                          <span>You can top up credits anytime if you need more</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                ) : openaiKeyStatus === "creating" || isCreatingOpenAIKey ? (
                  <div className="space-y-4">
                    {/* Creating State */}
                    <div className="border border-[var(--accent)] bg-[var(--accent)]/5 rounded-lg p-6 text-center space-y-3">
                      <Loader2 className="w-10 h-10 mx-auto text-[var(--accent)] animate-spin" />
                      <p className="font-bold text-lg">
                        Creating OpenAI Project
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Setting up your personal project and generating API key...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Not Created State */}
                    <div className="border border-[var(--border)] rounded-lg p-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-[var(--accent)] mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold mb-1">Personal OpenAI Key</p>
                          <p className="text-sm text-[var(--text-secondary)]">
                            We'll create a dedicated OpenAI project and service account for your instance.
                            This allows us to track usage and enforce plan-based limits.
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-[var(--border)] pt-4">
                        <p className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Benefits</p>
                        <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                            <span>Accurate usage tracking per model</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                            <span>Monthly LLM budget included in your plan</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                            <span>Easy top-up options when you need more</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                            <span>Isolated from other users (fair usage)</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <button
                      onClick={handleCreateOpenAIKey}
                      disabled={isCreatingOpenAIKey}
                      className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isCreatingOpenAIKey ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Creating Key...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          Create OpenAI API Key
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={goBack}
                    className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => {
                      markComplete("openai");
                      goNext();
                    }}
                    disabled={openaiKeyStatus !== "created"}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Step 5: Ostium */}
            {currentStepKey === "ostium" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="font-display text-2xl mb-2">
                    Ostium 1-Click Trading
                  </h1>
                  <p className="text-[var(--text-secondary)]">
                    Set up your trading agent to execute trades on Ostium via your OpenClaw bot.
                  </p>
                </div>

                <div className={`border rounded-lg p-5 transition-all ${lazyTradingEnabled
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)]"
                  }`}>
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
                          onClick={() => setLazyTradingEnabled(true)}
                          className="text-sm px-4 py-2 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] transition-colors"
                        >
                          Enable Skill
                        </button>
                      ) : maxxitApiKey ? (
                        /* Final state — API key generated, skill ready */
                        <div className="space-y-3">
                          <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                            <p className="text-sm text-green-400 mb-2">
                              <strong>API Key Generated!</strong>
                            </p>
                            <code className="text-xs bg-[var(--bg-card)] px-2 py-1 rounded font-mono break-all">
                              {maxxitApiKey}
                            </code>
                            <p className="text-xs text-[var(--text-muted)] mt-2">
                              This key will be securely configured in your OpenClaw instance.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setLazyTradingEnabled(false);
                              setMaxxitApiKey(null);
                              setSkillSubStep('idle');
                              setTradingAgentId(null);
                              setOstiumAgentAddress(null);
                              setDelegationComplete(false);
                              setAllowanceComplete(false);
                              setAgentFundingComplete(false);
                              setAgentFundingAmountEth("0.005");
                              setHasDeployment(false);
                            }}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          >
                            Remove Skill
                          </button>
                        </div>
                      ) : skillSubStep === 'idle' || skillSubStep === 'creating-agent' ? (
                        /* Sub-step 1: Create trading agent */
                        <div className="space-y-4">
                          <p className="text-sm text-[var(--text-secondary)]">
                            We&apos;ll create a dedicated trading agent and set up on-chain permissions.
                          </p>
                          <button
                            onClick={async () => {
                              setSkillSubStep('creating-agent');
                              setErrorMessage("");
                              try {
                                // First check if setup already exists
                                const statusRes = await fetch(`/api/lazy-trading/get-setup-status?userWallet=${walletAddress}`);
                                if (statusRes.ok) {
                                  const statusData = await statusRes.json();
                                  if (statusData.success && statusData.hasSetup) {
                                    const existingAgentAddress = statusData.ostiumAgentAddress || null;
                                    const hasExistingDeployment = !!statusData.deployment?.id;
                                    if (existingAgentAddress) {
                                      setOstiumAgentAddress(existingAgentAddress);
                                      setTradingAgentId(statusData.agent?.id || null);
                                      setDelegationComplete(statusData.isDelegatedToAgent === true);
                                      setAllowanceComplete(statusData.hasUsdcApproval === true);
                                      setHasDeployment(hasExistingDeployment);
                                      const isAgentFunded = await checkAgentFundingStatus(existingAgentAddress);
                                      const isFullyComplete =
                                        hasExistingDeployment &&
                                        statusData.isDelegatedToAgent === true &&
                                        statusData.hasUsdcApproval === true &&
                                        isAgentFunded;
                                      setLazyTradingSetupComplete(isFullyComplete);
                                      setSkillSubStep(isFullyComplete ? 'complete' : 'agent-created');
                                      return;
                                    }
                                  }
                                }

                                const res = await fetch("/api/openclaw/create-trading-agent", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ userWallet: walletAddress }),
                                });
                                const data = await res.json();
                                if (data.success) {
                                  setTradingAgentId(data.agent.id);
                                  setOstiumAgentAddress(data.ostiumAgentAddress);
                                  setAgentFundingComplete(false);
                                  if (data.hasDeployment) {
                                    setHasDeployment(true);
                                    const isAgentFunded = await checkAgentFundingStatus(data.ostiumAgentAddress);
                                    setLazyTradingSetupComplete(isAgentFunded);
                                    setSkillSubStep(isAgentFunded ? 'complete' : 'agent-created');
                                    return;
                                  }
                                  setSkillSubStep('agent-created');
                                  // Check existing delegation/approval status
                                  try {
                                    const [delegRes, approvalRes] = await Promise.all([
                                      fetch(`/api/ostium/check-delegation-status?userWallet=${walletAddress}&agentAddress=${data.ostiumAgentAddress}`),
                                      fetch(`/api/ostium/check-approval-status?userWallet=${walletAddress}`),
                                    ]);
                                    if (delegRes.ok) {
                                      const d = await delegRes.json();
                                      if (d.isDelegatedToAgent) setDelegationComplete(true);
                                    }
                                    if (approvalRes.ok) {
                                      const a = await approvalRes.json();
                                      if (a.hasApproval) setAllowanceComplete(true);
                                    }
                                    await checkAgentFundingStatus(data.ostiumAgentAddress);
                                  } catch { }
                                } else {
                                  setErrorMessage(data.error || "Failed to create trading agent");
                                  setSkillSubStep('idle');
                                }
                              } catch {
                                setErrorMessage("Failed to create trading agent");
                                setSkillSubStep('idle');
                              }
                            }}
                            disabled={skillSubStep === 'creating-agent'}
                            className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {skillSubStep === 'creating-agent' ? (
                              <><Loader2 className="w-5 h-5 animate-spin" /> Creating Agent...</>
                            ) : (
                              <><Zap className="w-4 h-4" /> Set Up Trading Agent</>
                            )}
                          </button>
                          <button
                            onClick={() => setLazyTradingEnabled(false)}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : skillSubStep === 'agent-created' ? (
                        /* Sub-step 2: Show agent address + delegation + approval */
                        <div className="space-y-4">
                          {/* Agent address display */}
                          <div className="border border-[var(--border)] rounded-lg p-4">
                            <p className="text-xs text-[var(--text-muted)] mb-1">Your Trading Agent Address</p>
                            <code className="text-sm font-mono break-all text-[var(--accent)]">
                              {ostiumAgentAddress}
                            </code>
                          </div>

                          {/* Progress indicators */}
                          <div className="space-y-3">
                            <div className={`flex items-center gap-3 p-3 rounded-lg border ${delegationComplete
                              ? "border-green-500/50 bg-green-500/5"
                              : "border-[var(--border)]"
                              }`}>
                              {delegationComplete ? (
                                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-[var(--text-muted)] flex-shrink-0" />
                              )}
                              <div>
                                <p className="text-sm font-bold">
                                  {delegationComplete ? "Delegation Complete" : "Delegate Trading"}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  Allow your agent to trade on Ostium on your behalf
                                </p>
                              </div>
                            </div>

                            <div className={`flex items-center gap-3 p-3 rounded-lg border ${allowanceComplete
                              ? "border-green-500/50 bg-green-500/5"
                              : "border-[var(--border)]"
                              }`}>
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

                            <div className={`flex items-center gap-3 p-3 rounded-lg border ${agentFundingComplete
                              ? "border-green-500/50 bg-green-500/5"
                              : "border-[var(--border)]"
                              }`}>
                              {agentFundingComplete ? (
                                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-[var(--text-muted)] flex-shrink-0" />
                              )}
                              <div>
                                <p className="text-sm font-bold">
                                  {agentFundingComplete ? "Agent Funded" : "Fund Your Agent"}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  Send ETH to your agent wallet for transaction gas
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Transaction status */}
                          {skillTxHash && (
                            <div className="text-center text-xs text-[var(--text-muted)]">
                              <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                              Confirming transaction...
                            </div>
                          )}

                          {/* Action button */}
                          {!delegationComplete || !allowanceComplete ? (
                            <button
                              onClick={async () => {
                                if (!walletAddress || !ostiumAgentAddress) return;
                                setEnablingTrading(true);
                                setErrorMessage("");
                                try {
                                  // Delegation
                                  if (!delegationComplete) {
                                    setSkillCurrentAction("Setting delegation...");
                                    const provider = await getEip1193Provider();
                                    await provider.request({ method: "eth_requestAccounts" });
                                    const ethersProvider = new ethers.providers.Web3Provider(provider, "any");
                                    const network = await ethersProvider.getNetwork();
                                    if (network.chainId !== OSTIUM_CHAIN_ID) {
                                      try {
                                        await provider.request({
                                          method: "wallet_switchEthereumChain",
                                          params: [{ chainId: `0x${OSTIUM_CHAIN_ID.toString(16)}` }],
                                        });
                                        await new Promise((r) => setTimeout(r, 500));
                                      } catch (switchErr: any) {
                                        throw new Error(
                                          switchErr.code === 4902
                                            ? `Please add ${OSTIUM_CHAIN_NAME} to your wallet`
                                            : `Please switch to ${OSTIUM_CHAIN_NAME} network`
                                        );
                                      }
                                    }
                                    const freshProvider = new ethers.providers.Web3Provider(provider);
                                    const signer = freshProvider.getSigner();
                                    const contract = new ethers.Contract(OSTIUM_TRADING_CONTRACT, OSTIUM_TRADING_ABI, signer);
                                    const gasEstimate = await contract.estimateGas.setDelegate(ostiumAgentAddress);
                                    const tx = await contract.setDelegate(ostiumAgentAddress, { gasLimit: gasEstimate.mul(150).div(100) });
                                    setSkillTxHash(tx.hash);
                                    await tx.wait();
                                    setDelegationComplete(true);
                                    setSkillTxHash(null);
                                    await new Promise((r) => setTimeout(r, 500));
                                  }

                                  // USDC Approval
                                  if (!allowanceComplete) {
                                    setSkillCurrentAction("Approving USDC allowance...");
                                    const provider = await getEip1193Provider();
                                    const ethersProvider = new ethers.providers.Web3Provider(provider, "any");
                                    await ethersProvider.send("eth_requestAccounts", []);
                                    const signer = ethersProvider.getSigner();
                                    const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);
                                    const allowanceAmount = ethers.utils.parseUnits("1000000", 6);
                                    const approveData = usdcContract.interface.encodeFunctionData("approve", [OSTIUM_STORAGE, allowanceAmount]);
                                    const gasEstimate = await ethersProvider.estimateGas({ to: USDC_TOKEN, from: walletAddress, data: approveData });
                                    const txHash = await provider.request({
                                      method: "eth_sendTransaction",
                                      params: [{ from: walletAddress, to: USDC_TOKEN, data: approveData, gas: gasEstimate.mul(150).div(100).toHexString() }],
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
                              }}
                              disabled={enablingTrading}
                              className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {enablingTrading ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> {skillCurrentAction || "Processing..."}</>
                              ) : (
                                <><Shield className="w-4 h-4" /> Enable 1-Click Trading</>
                              )}
                            </button>
                          ) : !agentFundingComplete ? (
                            <div className="space-y-3 border border-[var(--border)] rounded-lg p-4">
                              <p className="text-sm text-[var(--text-secondary)]">
                                Add ETH to your agent wallet so it can submit on-chain actions.
                              </p>
                              <div className="flex gap-2 items-center">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={agentFundingAmountEth}
                                  onChange={(e) => setAgentFundingAmountEth(e.target.value)}
                                  className="flex-1 bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                                  placeholder="0.005"
                                />
                                <span className="text-sm text-[var(--text-muted)]">ETH</span>
                              </div>
                              <button
                                onClick={async () => {
                                  if (!walletAddress || !ostiumAgentAddress) return;
                                  setEnablingTrading(true);
                                  setErrorMessage("");
                                  try {
                                    const amount = Number(agentFundingAmountEth);
                                    if (!Number.isFinite(amount) || amount <= 0) {
                                      throw new Error("Enter a valid ETH amount greater than 0.");
                                    }

                                    setSkillCurrentAction("Funding agent wallet...");
                                    const provider = await getEip1193Provider();
                                    await provider.request({ method: "eth_requestAccounts" });
                                    const ethersProvider = new ethers.providers.Web3Provider(provider);
                                    const network = await ethersProvider.getNetwork();
                                    if (network.chainId !== OSTIUM_CHAIN_ID) {
                                      await provider.request({
                                        method: "wallet_switchEthereumChain",
                                        params: [{ chainId: `0x${OSTIUM_CHAIN_ID.toString(16)}` }],
                                      });
                                    }

                                    const txHash = await provider.request({
                                      method: "eth_sendTransaction",
                                      params: [
                                        {
                                          from: walletAddress,
                                          to: ostiumAgentAddress,
                                          value: ethers.utils.parseEther(agentFundingAmountEth).toHexString(),
                                        },
                                      ],
                                    });
                                    setSkillTxHash(txHash);
                                    await ethersProvider.waitForTransaction(txHash);
                                    setSkillTxHash(null);
                                    setAgentFundingComplete(true);
                                  } catch (err: any) {
                                    if (err.code === 4001 || err.message?.includes("rejected")) {
                                      setErrorMessage("Transaction rejected");
                                    } else {
                                      setErrorMessage(err.message || "Failed to fund agent wallet");
                                    }
                                  } finally {
                                    setEnablingTrading(false);
                                    setSkillCurrentAction("");
                                  }
                                }}
                                disabled={enablingTrading}
                                className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                              >
                                {enablingTrading ? (
                                  <><Loader2 className="w-5 h-5 animate-spin" /> {skillCurrentAction || "Processing..."}</>
                                ) : (
                                  "Fund Agent Wallet"
                                )}
                              </button>
                              {ostiumAgentAddress && (
                                <p className="text-xs text-[var(--text-muted)] break-all">
                                  Agent wallet: <code>{ostiumAgentAddress}</code>
                                </p>
                              )}
                            </div>
                          ) : (
                            /* Both complete — deployment is triggered from footer CTA */
                            <div className="border border-green-500/40 bg-green-500/10 rounded-lg p-3 text-xs text-green-300">
                              Ready to create deployment
                            </div>
                          )}

                          <button
                            onClick={() => {
                              setLazyTradingEnabled(false);
                              setSkillSubStep('idle');
                              setTradingAgentId(null);
                              setOstiumAgentAddress(null);
                              setDelegationComplete(false);
                              setAllowanceComplete(false);
                              setAgentFundingComplete(false);
                              setAgentFundingAmountEth("0.005");
                            }}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : skillSubStep === 'creating-deployment' ? (
                        /* Sub-step 3: Creating deployment */
                        <div className="flex items-center justify-center gap-2 py-4 text-[var(--text-secondary)]">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Creating deployment...</span>
                        </div>
                      ) : (skillSubStep === 'complete' || lazyTradingSetupComplete || hasDeployment) && agentFundingComplete ? (
                        /* Sub-step 4: Complete */
                        <div className="space-y-3">
                          <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4 text-center">
                            <Check className="w-6 h-6 text-green-400 mx-auto mb-1" />
                            <p className="font-bold text-green-400">Trading Setup Complete</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">Your Ostium 1-click trading agent is ready. Continue to the next step.</p>
                          </div>
                          <button
                            onClick={() => {
                              setLazyTradingEnabled(false);
                              setSkillSubStep('idle');
                              setLazyTradingSetupComplete(false);
                              setTradingAgentId(null);
                              setOstiumAgentAddress(null);
                              setDelegationComplete(false);
                              setAllowanceComplete(false);
                              setAgentFundingComplete(false);
                              setAgentFundingAmountEth("0.005");
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

                <div className="flex gap-3">
                  <button
                    onClick={goBack}
                    className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => {
                      const isOstiumSetupDone =
                        (skillSubStep === 'complete' || lazyTradingSetupComplete || hasDeployment) && agentFundingComplete;
                      const shouldCreateDeployment =
                        lazyTradingEnabled &&
                        skillSubStep === 'agent-created' &&
                        delegationComplete &&
                        allowanceComplete &&
                        agentFundingComplete &&
                        !hasDeployment;

                      if (shouldCreateDeployment) {
                        handleCreateTradingDeployment();
                        return;
                      }
                      if (lazyTradingEnabled && !isOstiumSetupDone) {
                        setErrorMessage("Complete Ostium setup and create deployment before continuing.");
                        return;
                      }
                      markComplete("ostium");
                      goNext();
                    }}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    {(((skillSubStep === 'complete' || lazyTradingSetupComplete || hasDeployment) && agentFundingComplete) || maxxitApiKey)
                      ? "Continue"
                      : lazyTradingEnabled
                        ? "Create Deployment & Continue"
                        : "Skip & Continue"}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center">
                    {errorMessage}
                  </p>
                )}
                {skillTxHash && OSTIUM_BLOCK_EXPLORER_URL && (
                  <p className="text-xs text-center">
                    <a
                      href={`${OSTIUM_BLOCK_EXPLORER_URL}/tx/${skillTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      View transaction on explorer
                    </a>
                  </p>
                )}
              </div>
            )}

            {/* Step 6: Aster DEX */}
            {currentStepKey === "aster" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="font-display text-2xl mb-2">
                    Aster DEX (Optional)
                  </h1>
                  <p className="text-[var(--text-secondary)]">
                    Authorize your agent wallet to also trade on Aster DEX (BNB Chain).
                  </p>
                </div>

                <div className={`border rounded-lg p-5 transition-all ${asterEnabled
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)]"
                  }`}>
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">🌟</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold">Aster DEX (BNB Chain)</h3>
                        {asterEnabled && (
                          <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                            Enabled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mb-4">
                        Trade perpetual futures on BNB Chain using your agent wallet.
                      </p>

                      {!ostiumAgentAddress ? (
                        <p className="text-xs text-[var(--text-muted)] italic">
                          Go back and complete the Ostium setup first to create an agent wallet.
                        </p>
                      ) : asterEnabled ? (
                        <div className="space-y-3">
                          <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                            <p className="text-sm text-green-400 mb-1">
                              <strong>Aster DEX Enabled ✓</strong>
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              Your agent wallet <code className="bg-[var(--bg-deep)] px-1.5 py-0.5 rounded text-xs">{ostiumAgentAddress}</code> is authorized for Aster trading.
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              setIsSavingAsterConfig(true);
                              try {
                                const res = await fetch("/api/lazy-trading/save-aster-credentials", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ userWallet: walletAddress, enabled: false }),
                                });
                                const data = await res.json();
                                if (data.success) setAsterEnabled(false);
                              } catch { } finally {
                                setIsSavingAsterConfig(false);
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
                            <p className="text-xs text-[var(--text-muted)] mb-1">Your Agent Address</p>
                            <p className="text-sm font-mono break-all">{ostiumAgentAddress}</p>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-medium">To enable Aster trading:</p>
                            <ol className="text-sm text-[var(--text-secondary)] list-decimal list-inside space-y-1">
                              <li>Go to Aster&apos;s API Wallet page</li>
                              <li>Click &quot;Authorize new API wallet&quot;</li>
                              <li>Paste your above given agent address as the &quot;API wallet address&quot;</li>
                              <li>Click &quot;Authorize&quot; to grant it trading permission</li>
                              <li>Come back here and click &quot;Enable Aster&quot;</li>
                            </ol>
                          </div>

                          <button
                            onClick={() => setAsterShowGuide(!asterShowGuide)}
                            className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                          >
                            {asterShowGuide ? "Hide" : "Show"} visual guide ▾
                          </button>

                          {asterShowGuide && (
                            <div className="space-y-3">
                              <div className="rounded-lg overflow-hidden border border-[var(--border)]">
                                <img src="/aster-finance/aster-wallet-api.png" alt="Authorize API wallet on Aster" className="w-full" />
                                <p className="text-xs text-center text-[var(--text-muted)] py-1.5 bg-[var(--bg-deep)]">Step 1: Enter your agent address and click Authorize</p>
                              </div>
                              <div className="rounded-lg overflow-hidden border border-[var(--border)]">
                                <img src="/aster-finance/aster-wallet-api-2.png" alt="Authorized agent wallet on Aster" className="w-full" />
                                <p className="text-xs text-center text-[var(--text-muted)] py-1.5 bg-[var(--bg-deep)]">Step 2: Your agent wallet should appear in the list</p>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-3">
                            <a
                              href="https://www.asterdextestnet.com/en/api-wallet"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-2.5 text-center border border-[var(--border)] rounded-lg text-sm hover:border-[var(--accent)] transition-colors"
                            >
                              Open Aster API Wallet ↗
                            </a>
                            <button
                              onClick={async () => {
                                setIsSavingAsterConfig(true);
                                setErrorMessage("");
                                try {
                                  const res = await fetch("/api/lazy-trading/save-aster-credentials", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ userWallet: walletAddress, enabled: true }),
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    setAsterEnabled(true);
                                  } else {
                                    setErrorMessage(data.error || "Failed to enable Aster");
                                  }
                                } catch {
                                  setErrorMessage("Failed to enable Aster");
                                } finally {
                                  setIsSavingAsterConfig(false);
                                }
                              }}
                              disabled={isSavingAsterConfig}
                              className="flex-1 py-2.5 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {isSavingAsterConfig ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Enabling...</>
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

                <div className="flex gap-3">
                  <button
                    onClick={goBack}
                    className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => {
                      markComplete("aster");
                      goNext();
                    }}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    {asterEnabled ? "Continue" : "Skip & Continue"}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Step 7: API Key */}
            {currentStepKey === "apikey" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="font-display text-2xl mb-2">
                    Generate API Key
                  </h1>
                  <p className="text-[var(--text-secondary)]">
                    Create an API key to connect the Lazy Trading skill to your OpenClaw instance.
                  </p>
                </div>

                <div className={`border rounded-lg p-5 transition-all ${maxxitApiKey
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)]"
                  }`}>
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">🔑</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold">Maxxit API Key</h3>
                        {maxxitApiKey && (
                          <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                            Generated
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mb-4">
                        This key allows your OpenClaw instance to execute trades on your behalf.
                      </p>

                      {maxxitApiKey ? (
                        <div className="space-y-3">
                          <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                            <p className="text-sm text-green-400 mb-2">
                              <strong>API Key Generated!</strong>
                            </p>
                            <code className="text-xs bg-[var(--bg-card)] px-2 py-1 rounded font-mono break-all">
                              {maxxitApiKey}
                            </code>
                            <p className="text-xs text-[var(--text-muted)] mt-2">
                              This key will be securely configured in your OpenClaw instance.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
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
                          }}
                          disabled={isGeneratingApiKey}
                          className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {isGeneratingApiKey ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            "Generate API Key"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={goBack}
                    className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (!canContinueFromApiKeyStep) {
                        setErrorMessage("Generate an API key to continue when Ostium or Aster is enabled.");
                        return;
                      }
                      markComplete("apikey");
                      goNext();
                    }}
                    disabled={!canContinueFromApiKeyStep}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {requiresApiKeyGeneration
                      ? (maxxitApiKey ? "Continue" : "Generate API Key to Continue")
                      : (maxxitApiKey ? "Continue" : "Skip & Continue")}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {errorMessage && (
                  <p className="text-red-500 text-sm text-center">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Step 8: Activate / Complete */}
            {currentStepKey === "activate" && (
              <div className="space-y-6">
                {activated ? (
                  <div className="text-center space-y-6">
                    <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${instanceStatusPhase === "ready"
                      ? "bg-[var(--accent)]"
                      : instanceStatusPhase === "error"
                        ? "bg-red-500"
                        : "bg-[var(--accent)]/20"
                      }`}>
                      {instanceStatusPhase === "ready" ? (
                        <Check className="w-10 h-10 text-[var(--bg-deep)]" />
                      ) : instanceStatusPhase === "error" ? (
                        <span className="text-3xl">⚠️</span>
                      ) : (
                        <Loader2 className="w-10 h-10 animate-spin text-[var(--accent)]" />
                      )}
                    </div>

                    <div>
                      <h1 className="font-display text-2xl mb-2">
                        {instanceStatusPhase === "ready"
                          ? "OpenClaw is running"
                          : instanceStatusPhase === "error"
                            ? "Something went wrong"
                            : instanceStatusPhase === "checking"
                              ? "Running status checks..."
                              : instanceStatusPhase === "starting"
                                ? "Starting up..."
                                : "Launching instance..."}
                      </h1>
                      <p className="text-[var(--text-secondary)]">
                        {instanceStatusPhase === "ready"
                          ? "Your instance is live. You should receive a welcome message from your assistant soon as shown below : "
                          : instanceStatusPhase === "error"
                            ? instanceStatusMessage || "Please try again or contact support."
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

                    {instanceStatusPhase && instanceStatusPhase !== "ready" && instanceStatusPhase !== "error" && (
                      <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${instanceStatusPhase === "launching" || instanceStatusPhase === "starting" || instanceStatusPhase === "checking"
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--border)]"
                            }`} />
                          <span className={`text-sm ${instanceStatusPhase === "launching" ? "text-[var(--accent)] font-medium" : "text-[var(--text-muted)]"}`}>
                            Creating instance
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${instanceStatusPhase === "starting" || instanceStatusPhase === "checking"
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--border)]"
                            }`} />
                          <span className={`text-sm ${instanceStatusPhase === "starting" ? "text-[var(--accent)] font-medium" : "text-[var(--text-muted)]"}`}>
                            Starting instance
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${instanceStatusPhase === "checking"
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--border)]"
                            }`} />
                          <span className={`text-sm ${instanceStatusPhase === "checking" ? "text-[var(--accent)] font-medium" : "text-[var(--text-muted)]"}`}>
                            Running status checks
                          </span>
                        </div>
                      </div>
                    )}

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
                          {MODEL_OPTIONS.find((m) => m.id === selectedModel)
                            ?.name}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">
                          Telegram
                        </span>
                        <span className="font-semibold text-[var(--accent)]">
                          {telegramUsername
                            ? `@${telegramUsername}`
                            : "Connected"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">
                          OpenAI Key
                        </span>
                        <span className="font-semibold text-[var(--accent)]">
                          {openaiKeyStatus === "created" ? "Created" : "Not Created"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">LLM Credits</span>
                        <Link href="/llm-credit-history" className="font-semibold text-[var(--accent)] hover:underline">
                          View History
                        </Link>
                      </div>
                    </div>
                    {/* LLM Credits Section */}
                    <div className="border border-[var(--border)] rounded-lg p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-[var(--accent)]" />
                          <h3 className="font-bold text-lg">LLM Credits</h3>
                        </div>
                        {llmBalance?.limitReached && (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded-full">
                            LIMIT REACHED
                          </span>
                        )}
                      </div>

                      {/* Top-up Success Message */}
                      {llmTopUpSuccess && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2">
                          <Check className="w-5 h-5 text-green-400" />
                          <p className="text-sm text-green-400 font-medium">
                            Credits added successfully! Your balance has been updated.
                          </p>
                        </div>
                      )}

                      {isLoadingLlmBalance ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                        </div>
                      ) : llmBalanceError ? (
                        <p className="text-sm text-red-400 text-center">{llmBalanceError}</p>
                      ) : llmBalance ? (
                        <>
                          <div className="flex items-end justify-between">
                            <div>
                              <p className="text-3xl font-bold text-[var(--accent)]">
                                ${(llmBalance.balanceCents / 100).toFixed(2)}
                              </p>
                              <p className="text-sm text-[var(--text-secondary)]">remaining balance</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-[var(--text-muted)]">
                                ${(llmBalance.totalUsed / 100).toFixed(2)} used
                              </p>
                              <p className="text-xs text-[var(--text-muted)]">
                                of ${(llmBalance.totalPurchased / 100).toFixed(2)} total
                              </p>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="space-y-2">
                            <div className="w-full bg-[var(--bg-card)] rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full bg-[var(--accent)] transition-all duration-300"
                                style={{
                                  width: `${Math.min(
                                    (llmBalance.totalUsed / Math.max(llmBalance.totalPurchased, 1)) * 100,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                            <p className="text-xs text-[var(--text-muted)] text-right">
                              {((llmBalance.totalUsed / Math.max(llmBalance.totalPurchased, 1)) * 100).toFixed(1)}% used
                            </p>
                          </div>

                          {/* Warning if limit reached */}
                          {llmBalance.limitReached && (
                            <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-3 flex items-start gap-2">
                              <span className="text-red-400 text-lg">⚠️</span>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-red-400">Credit limit reached</p>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                  Your OpenClaw instance has been paused. Top up to continue using AI features.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Low balance warning */}
                          {!llmBalance.limitReached && llmBalance.balanceCents < 500 && (
                            <div className="border border-yellow-500/50 bg-yellow-500/10 rounded-lg p-3 flex items-start gap-2">
                              <span className="text-yellow-400 text-lg">⚠️</span>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-yellow-400">Low balance</p>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                  Consider topping up to avoid interruption.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Top Up Amount Selector */}
                          <div className="space-y-2">
                            <p className="text-xs text-[var(--text-muted)] text-center">Select top-up amount:</p>
                            <div className="grid grid-cols-4 gap-2">
                              {[
                                { cents: 500, label: '$5' },
                                { cents: 1000, label: '$10' },
                                { cents: 2500, label: '$25' },
                                { cents: 5000, label: '$50' },
                              ].map((option) => (
                                <button
                                  key={option.cents}
                                  onClick={() => setSelectedTopUpAmount(option.cents)}
                                  disabled={isRedirecting}
                                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${selectedTopUpAmount === option.cents
                                    ? 'bg-[var(--accent)] text-[var(--bg-deep)]'
                                    : 'bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card)] hover:opacity-80'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Top Up Button */}
                          <button
                            onClick={handleTopUpLlmCredits}
                            disabled={isRedirecting}
                            className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {isRedirecting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Redirecting to Stripe...
                              </>
                            ) : (
                              <>
                                <Zap className="w-4 h-4" />
                                Top Up ${(selectedTopUpAmount / 100).toFixed(2)}
                              </>
                            )}
                          </button>

                          {/* View History Link */}
                          <div className="text-center">
                            <Link
                              href="/llm-credit-history"
                              className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors inline-flex items-center gap-1"
                            >
                              View full history
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-[var(--text-muted)] text-center">No credit data available</p>
                      )}
                    </div>

                    <a
                      href={`tg://resolve?domain=${botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full py-4 font-bold rounded-lg flex items-center justify-center gap-2 transition-opacity ${instanceStatusPhase === "ready"
                        ? "bg-[#0088cc] text-white hover:opacity-90"
                        : "bg-[#0088cc]/50 text-white/70 cursor-not-allowed"
                        }`}
                      onClick={(e) => {
                        if (instanceStatusPhase !== "ready") {
                          e.preventDefault();
                        }
                      }}
                    >
                      <MessageSquare className="w-5 h-5" />
                      {instanceStatusPhase === "ready" ? "Open Telegram" : "Waiting for instance..."}
                      {instanceStatusPhase === "ready" && <ExternalLink className="w-4 h-4" />}
                    </a>
                  </div>
                ) : (
                  <>
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
                          {PLAN_OPTIONS.find((p) => p.id === selectedPlan)
                            ?.name}{" "}
                          —{" "}
                          {PLAN_OPTIONS.find((p) => p.id === selectedPlan)
                            ?.priceLabel}
                        </span>
                      </div>
                      <div className="h-px bg-[var(--border)]" />
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">Model</span>
                        <span className="font-semibold">
                          {MODEL_OPTIONS.find((m) => m.id === selectedModel)
                            ?.name}
                        </span>
                      </div>
                      <div className="h-px bg-[var(--border)]" />
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">
                          Telegram
                        </span>
                        <span className="font-semibold text-[var(--accent)]">
                          {telegramUsername
                            ? `@${telegramUsername}`
                            : "Connected"}
                        </span>
                      </div>
                      <div className="h-px bg-[var(--border)]" />
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">
                          OpenAI Key
                        </span>
                        <span className="font-semibold text-[var(--accent)]">
                          {openaiKeyStatus === "created" ? "Created" : "Not Created"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={goBack}
                        className="px-6 py-4 border border-[var(--border)] rounded-lg font-bold flex items-center gap-2 hover:border-[var(--text-muted)] transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                      </button>
                      <button
                        onClick={handleActivate}
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
                  <p className="text-red-500 text-sm text-center">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isRedirecting && (
        <div className="fixed inset-0 z-[110] bg-[var(--bg-deep)]/90 backdrop-blur-xl flex items-center justify-center flex-col gap-6 animate-in fade-in duration-500 px-4">
          <div className="relative">
            <Orbit className="h-16 w-16 text-[var(--accent)] animate-spin" style={{ animation: 'spin 3s linear infinite' }} />
            <Zap className="h-6 w-6 text-[var(--accent)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-display uppercase tracking-widest text-[var(--accent)] mb-2">INITIALIZING SECURE GATEWAY</h2>
            <p className="text-[var(--text-muted)] text-xs tracking-[0.2em] font-bold">PREPARING ENCRYPTED SESSION · STACK: STRIPE</p>
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
          console.log('Web3 Payment Success:', txHash);
          setIsWeb3ModalOpen(false);
          handleSelectPlan();
        }}
      />

      <FooterSection />
    </div>
  );
}
