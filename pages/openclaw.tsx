import { useCallback, useEffect, useState } from "react";
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

type PlanId = "free" | "starter" | "pro";

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
};

const STEPS = [
  { key: "plan", label: "Plan" },
  { key: "model", label: "Model" },
  { key: "telegram", label: "Telegram" },
  { key: "skills", label: "Skills" },
  { key: "activate", label: "Launch" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const PLAN_OPTIONS: PlanOption[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "$0/mo",
    budgetLabel: "$2 LLM usage",
    modelsLabel: "Basic models",
  },
  {
    id: "starter",
    name: "Starter",
    priceLabel: "$19/mo",
    budgetLabel: "$10 LLM usage",
    modelsLabel: "All models",
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$49/mo",
    budgetLabel: "$30 LLM usage",
    modelsLabel: "All models + custom skills",
  },
];

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    minPlan: "free",
    costLabel: "$0.15 in / $0.60 out per 1M tokens",
    speedLabel: "Fast & efficient",
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    minPlan: "free",
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

const PLAN_RANKS: Record<PlanId, number> = { free: 0, starter: 1, pro: 2 };

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
                  }`}
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

  // Payment modal states
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isWeb3ModalOpen, setIsWeb3ModalOpen] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isValidatingBot, setIsValidatingBot] = useState(false);

  // Skills state - simplified: just track if API key exists
  const [lazyTradingEnabled, setLazyTradingEnabled] = useState(false);
  const [lazyTradingSetupComplete, setLazyTradingSetupComplete] = useState(false);
  const [isCheckingLazyTradingSetup, setIsCheckingLazyTradingSetup] = useState(false);
  const [maxxitApiKey, setMaxxitApiKey] = useState<string | null>(null);
  const [existingApiKeyPrefix, setExistingApiKeyPrefix] = useState<string | null>(null);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);

  // EC2 instance status for monitoring launch progress
  const [instanceStatusPhase, setInstanceStatusPhase] = useState<
    "launching" | "starting" | "checking" | "ready" | "error" | null
  >(null);
  const [instanceStatusMessage, setInstanceStatusMessage] = useState<string | null>(null);

  const currentStepKey = STEPS[currentStepIndex]?.key;

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
        };
      };

      const inst = data.instance;
      setInstanceData({
        id: inst.id,
        plan: inst.plan,
        model: inst.model,
        status: inst.status,
        telegramLinked: !!inst.telegram.botUsername,
        telegramVerified: inst.telegram.linked, // linked means telegram_user_id is set
        telegramUsername: inst.telegram.botUsername,
      });

      setSelectedPlan(inst.plan as PlanId);
      setSelectedModel(inst.model);
      markComplete("plan");

      if (inst.model) {
        markComplete("model");
      }

      // Restore telegram state - use botUsername for the bot link
      if (inst.telegram.botUsername) {
        setTelegramLinked(true);
        setTelegramUsername(inst.telegram.botUsername);
        setBotUsername(inst.telegram.botUsername);
      }

      // If telegram is verified (has userId), mark telegram step complete
      if (inst.telegram.linked && inst.telegram.userId) {
        setTelegramVerified(true);
        markComplete("telegram");
      }

      // If instance is active, mark skills and activate steps as complete
      if (inst.status === "active") {
        markComplete("skills"); // Skills step was passed (even if skipped)
        markComplete("telegram"); // Must have completed telegram to activate
        markComplete("activate");
        setActivated(true);
        setTelegramVerified(true); // Must be verified if active

        // Check containerStatus to determine if instance is actually running
        // If container is running, it's ready. Otherwise start polling to check.
        if (inst.containerStatus === "running") {
          setInstanceStatusPhase("ready");
          setInstanceStatusMessage("Instance is running");
        } else {
          // Instance is active but container may still be launching
          setInstanceStatusPhase("checking");
          setInstanceStatusMessage("Checking instance status...");
        }
      }

      // Determine which step to show
      if (inst.status === "active") {
        setCurrentStepIndex(4); // Show activated/running step
      } else if (inst.telegram.linked && inst.telegram.userId) {
        setCurrentStepIndex(3); // Skills step
      } else if (inst.telegram.username) {
        setCurrentStepIndex(2); // Telegram step (connected but not verified)
      } else if (inst.model) {
        setCurrentStepIndex(2); // Telegram step
      } else {
        setCurrentStepIndex(1); // Model step
      }

      setShowLanding(false);
    } catch {
      // No existing instance, start fresh
    } finally {
      setInitialLoading(false);
    }
  }, [walletAddress, markComplete]);

  useEffect(() => {
    if (authenticated && walletAddress) {
      loadExistingProgress();
    }
  }, [authenticated, walletAddress, loadExistingProgress]);

  // Handle return from Stripe payment
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
            setCurrentStepIndex(1); // Go to model step
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

  // Poll for Telegram verification when user is on Telegram step with bot connected but not verified
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
        // Ignore errors during polling
      }
    };

    const interval = setInterval(checkVerification, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [walletAddress, currentStepKey, telegramLinked, telegramVerified, markComplete]);

  // Poll for EC2 instance status when launching/checking
  useEffect(() => {
    // Only poll when activated and not yet ready
    if (!walletAddress || !activated || instanceStatusPhase === "ready" || instanceStatusPhase === null) {
      return;
    }

    const checkInstanceStatus = async () => {
      try {
        const res = await fetch(`/api/openclaw/instance-status?userWallet=${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          const { statusPhase, statusMessage, instance } = data;

          if (statusPhase) {
            setInstanceStatusPhase(statusPhase);
          }
          if (statusMessage) {
            setInstanceStatusMessage(statusMessage);
          }
        }
      } catch {
        // Ignore errors during polling
      }
    };

    // Check immediately on mount
    checkInstanceStatus();

    // Then poll every 5 seconds
    const interval = setInterval(checkInstanceStatus, 5000);
    return () => clearInterval(interval);
  }, [walletAddress, activated, instanceStatusPhase]);

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

  // Get pricing tier info for modals
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
    // For free plan, just proceed
    if (selectedPlan === "free") {
      handleSelectPlan();
      return;
    }
    // For paid plans, show payment modal
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
        telegramVerified: false, // Not verified yet when just created
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
      });
      markComplete("activate");
      setActivated(true);
      // Set initial status - will be updated by polling
      setInstanceStatusPhase("launching");
      setInstanceStatusMessage("Launching instance...");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Check for existing API key when user enters skills step
  useEffect(() => {
    if (currentStepKey === "skills" && walletAddress && lazyTradingEnabled && !maxxitApiKey && !existingApiKeyPrefix) {
      (async () => {
        try {
          const res = await fetch(`/api/lazy-trading/api-key?userWallet=${walletAddress}`);
          if (res.ok) {
            const data = await res.json();
            if (data.apiKey?.prefix) {
              setExistingApiKeyPrefix(data.apiKey.prefix);
            }
          }
        } catch { }
      })();
    }
  }, [currentStepKey, walletAddress, lazyTradingEnabled, maxxitApiKey, existingApiKeyPrefix]);

  // Check lazy trading setup status when user enables the skill
  useEffect(() => {
    if (!lazyTradingEnabled || !walletAddress) return;
    // Don't re-check if already known to be complete or if we have an API key
    if (lazyTradingSetupComplete || existingApiKeyPrefix || maxxitApiKey) return;

    (async () => {
      setIsCheckingLazyTradingSetup(true);
      try {
        const res = await fetch(`/api/lazy-trading/get-setup-status?userWallet=${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          // User has completed setup if step is "complete" or hasSetup is true with an agent
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
  }, [lazyTradingEnabled, walletAddress, lazyTradingSetupComplete, existingApiKeyPrefix, maxxitApiKey]);

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
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <Header />

      <div className="container mx-auto px-4 py-12 max-w-2xl">
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
                          {selectedPlan === "free" ? "Continue" : "Subscribe & Continue"}
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

                    {/* Verification Step */}
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

            {/* Step 4: Skills */}
            {currentStepKey === "skills" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="font-display text-2xl mb-2">
                    Add Skills (Optional)
                  </h1>
                  <p className="text-[var(--text-secondary)]">
                    Extend your agent&apos;s capabilities with powerful skills.
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
                        {lazyTradingEnabled && (maxxitApiKey || existingApiKeyPrefix) && (
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
                      ) : existingApiKeyPrefix && !maxxitApiKey ? (
                        <div className="space-y-3">
                          <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                            <p className="text-sm text-green-400 mb-2">
                              <strong>API Key Active</strong>
                            </p>
                            <code className="text-xs bg-[var(--bg-card)] px-2 py-1 rounded font-mono">
                              {existingApiKeyPrefix}••••••••
                            </code>
                            <p className="text-xs text-[var(--text-muted)] mt-2">
                              Your existing API key will be used for this OpenClaw instance.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setLazyTradingEnabled(false);
                              setExistingApiKeyPrefix(null);
                            }}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          >
                            Remove Skill
                          </button>
                        </div>
                      ) : maxxitApiKey ? (
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
                            }}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          >
                            Remove Skill
                          </button>
                        </div>
                      ) : isCheckingLazyTradingSetup ? (
                        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Checking setup status...
                        </div>
                      ) : lazyTradingSetupComplete ? (
                        <div className="space-y-3">
                          <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4 text-center">
                            <Check className="w-6 h-6 text-green-400 mx-auto mb-1" />
                            <p className="font-bold text-green-400">Lazy Trading Setup Complete</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">Generate an API key to connect this skill to your OpenClaw instance.</p>
                          </div>
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
                          <button
                            onClick={() => {
                              setLazyTradingEnabled(false);
                              setLazyTradingSetupComplete(false);
                            }}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-sm text-[var(--text-secondary)]">
                            To enable this skill, you need to first complete the Lazy Trading setup.
                          </p>
                          <a
                            href="/lazy-trading"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                          >
                            <Zap className="w-4 h-4" />
                            Set Up Lazy Trading
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <p className="text-xs text-[var(--text-muted)]">
                            After completing setup, click the button below to check your status.
                          </p>
                          <button
                            onClick={() => {
                              setLazyTradingSetupComplete(false);
                              // Force re-check by triggering the useEffect
                              setIsCheckingLazyTradingSetup(true);
                              (async () => {
                                try {
                                  const res = await fetch(`/api/lazy-trading/get-setup-status?userWallet=${walletAddress}`);
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
                            }}
                            className="w-full py-2 border border-[var(--accent)] text-[var(--accent)] font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-[var(--accent)]/10 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                            I&apos;ve Completed Setup
                          </button>
                          <button
                            onClick={() => setLazyTradingEnabled(false)}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          >
                            Cancel
                          </button>
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
                      markComplete("skills");
                      goNext();
                    }}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    {lazyTradingEnabled && (maxxitApiKey || existingApiKeyPrefix) ? "Continue with Skill" : "Skip & Continue"}
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

            {/* Step 5: Activate / Complete */}
            {currentStepKey === "activate" && (
              <div className="space-y-6">
                {activated ? (
                  <div className="text-center space-y-6">
                    {/* Status icon - changes based on phase */}
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

                    {/* Status message - dynamic based on phase */}
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
                          ? "Your instance is live. Open Telegram and say hi."
                          : instanceStatusPhase === "error"
                            ? instanceStatusMessage || "Please try again or contact support."
                            : instanceStatusMessage || "This may take 1-2 minutes..."}
                      </p>
                    </div>

                    {/* Status progress indicator when not ready */}
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

                    {/* Instance details when ready or always show */}
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
                    </div>

                    {/* Telegram button - only enabled when ready */}
                    <a
                      href={
                        botUsername ? `https://t.me/${botUsername}` : "#"
                      }
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
                        disabled={isLoading}
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

      {/* Redirecting Overlay */}
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

      {/* Payment Modals */}
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
