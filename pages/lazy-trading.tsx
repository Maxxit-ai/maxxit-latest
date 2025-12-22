/**
 * Lazy Trading - Simplified agent setup for casual traders
 *
 * A streamlined 4-step flow:
 * 1. Connect Wallet
 * 2. Connect Telegram (as signal source)
 * 3. Trading Preferences
 * 4. Ostium Setup (Delegation + Allowance)
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import { Header } from "@components/Header";
import {
  TradingPreferencesForm,
  TradingPreferences,
} from "@components/TradingPreferencesModal";
import {
  Wallet,
  Send,
  Sliders,
  Shield,
  Check,
  ChevronRight,
  ExternalLink,
  Activity,
  AlertCircle,
  Copy,
  CheckCircle,
  Zap,
} from "lucide-react";
import { ethers } from "ethers";
import { getOstiumConfig } from "../lib/ostium-config";

// Ostium configuration
const {
  tradingContract: OSTIUM_TRADING_CONTRACT,
  usdcContract: USDC_TOKEN,
  storageContract: OSTIUM_STORAGE,
} = getOstiumConfig();
const OSTIUM_TRADING_ABI = ["function setDelegate(address delegate) external"];
const USDC_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

type Step = "wallet" | "telegram" | "preferences" | "ostium" | "complete";

interface TelegramUser {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
}

export default function LazyTrading() {
  const router = useRouter();
  const { authenticated, user, login } = usePrivy();

  const [step, setStep] = useState<Step>("wallet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Telegram state
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [linkCode, setLinkCode] = useState<string>("");
  const [botUsername, setBotUsername] = useState<string>("");
  const [deepLink, setDeepLink] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [checkingTelegram, setCheckingTelegram] = useState(false);

  // Trading preferences
  const [tradingPreferences, setTradingPreferences] =
    useState<TradingPreferences | null>(null);

  // Ostium state
  const [ostiumAgentAddress, setOstiumAgentAddress] = useState<string>("");
  const [hyperliquidAgentAddress, setHyperliquidAgentAddress] = useState<string>("");
  const [delegationComplete, setDelegationComplete] = useState(false);
  const [allowanceComplete, setAllowanceComplete] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  // ETH sending state (for funding agent address)
  const [ethAmount, setEthAmount] = useState<string>("0.005");
  const [sendingEth, setSendingEth] = useState(false);
  const [ethTxHash, setEthTxHash] = useState<string | null>(null);
  const [ethError, setEthError] = useState<string | null>(null);

  // Agent state
  const [agentId, setAgentId] = useState<string>("");
  const [deploymentId, setDeploymentId] = useState<string>("");
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Load existing setup status when wallet is connected
  useEffect(() => {
    if (authenticated && user?.wallet?.address && !initialLoadDone) {
      loadExistingSetup();
    }
  }, [authenticated, user?.wallet?.address, initialLoadDone]);

  const loadExistingSetup = async () => {
    if (!user?.wallet?.address) return;

    try {
      const response = await fetch(
        `/api/lazy-trading/get-setup-status?userWallet=${user.wallet.address}`
      );
      const data = await response.json();

      if (data.success && data.hasSetup) {
        // Restore state from existing setup
        if (data.agent) {
          setAgentId(data.agent.id);
        }
        if (data.telegramUser) {
          setTelegramUser(data.telegramUser);
        }
        if (data.deployment) {
          setDeploymentId(data.deployment.id);
        }
        if (data.tradingPreferences) {
          setTradingPreferences(data.tradingPreferences);
        }
        if (data.ostiumAgentAddress) {
          setOstiumAgentAddress(data.ostiumAgentAddress);
        }
        if (data.hyperliquidAgentAddress) {
          setHyperliquidAgentAddress(data.hyperliquidAgentAddress);
        }

        // NEW: Pre-fill delegation and approval status from API
        // This matches the normal club flow behavior - if user already has
        // delegated and approved, we skip those steps
        if (data.isDelegatedToAgent) {
          console.log("[LazyTrading] Delegation already complete - pre-filling state");
          setDelegationComplete(true);
        }
        if (data.hasUsdcApproval) {
          console.log("[LazyTrading] USDC approval already complete - pre-filling state");
          setAllowanceComplete(true);
        }

        // Set the current step based on progress
        // Note: The API now returns 'complete' step if both delegation and approval are done
        setStep(data.step as Step);

        // If on ostium step, set address and check delegation/allowance status
        if (data.step === "ostium" && data.ostiumAgentAddress) {
          setOstiumAgentAddress(data.ostiumAgentAddress);
          // Check status after address is set (useEffect will handle this)
        } else if (data.ostiumAgentAddress) {
          // Even if not on ostium step, set the address for future use
          setOstiumAgentAddress(data.ostiumAgentAddress);
        }
      } else {
        // No existing setup, start fresh
        // But check if wallet already has agent address assigned (from normal club flow)
        if (data.hasExistingOstiumAddress && data.ostiumAgentAddress) {
          console.log("[LazyTrading] Wallet has existing Ostium address from normal flow:", data.ostiumAgentAddress);
          setOstiumAgentAddress(data.ostiumAgentAddress);

          // Also pre-fill delegation/approval if already done
          if (data.isDelegatedToAgent) {
            setDelegationComplete(true);
          }
          if (data.hasUsdcApproval) {
            setAllowanceComplete(true);
          }
        }
        if (data.hyperliquidAgentAddress) {
          setHyperliquidAgentAddress(data.hyperliquidAgentAddress);
        }
        setStep("telegram");
      }
    } catch (err) {
      console.error("Error loading existing setup:", err);
      setStep("telegram");
    } finally {
      setInitialLoadDone(true);
    }
  };

  // Poll for telegram connection
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (step === "telegram" && linkCode && !telegramUser) {
      interval = setInterval(() => {
        checkTelegramStatus();
      }, 3000); // Check every 3 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, linkCode, telegramUser]);

  // Check Ostium status when on ostium step and agent address is available
  useEffect(() => {
    if (step === "ostium" && user?.wallet?.address && ostiumAgentAddress) {
      console.log(
        "[Ostium] Agent address available, checking delegation status..."
      );
      checkOstiumStatus();
    }
  }, [step, user?.wallet?.address, ostiumAgentAddress]);

  const checkTelegramStatus = async () => {
    if (!user?.wallet?.address) {
      console.log("[Telegram] Cannot check status: no wallet address");
      return;
    }

    setCheckingTelegram(true);
    try {
      console.log(
        "[Telegram] Checking connection status for wallet:",
        user.wallet.address
      );

      // Include linkCode in the query if we have one (for polling)
      const queryParams = new URLSearchParams({
        userWallet: user.wallet.address,
      });
      if (linkCode) {
        queryParams.append("linkCode", linkCode);
        console.log("[Telegram] Using link code:", linkCode);
      }

      const response = await fetch(
        `/api/lazy-trading/check-telegram-status?${queryParams.toString()}`
      );
      const data = await response.json();

      console.log("[Telegram] Status check response:", {
        success: data.success,
        connected: data.connected,
        hasTelegramUser: !!data.telegramUser,
        telegramUser: data.telegramUser,
      });

      if (data.success && data.connected && data.telegramUser) {
        console.log(
          "[Telegram] ✅ Telegram connected:",
          data.telegramUser.telegram_username || data.telegramUser.first_name
        );
        setTelegramUser(data.telegramUser);
        // Clear linkCode to stop polling and show connected state
        setLinkCode("");
        if (data.agentId) {
          setAgentId(data.agentId);
        }
        // Stay on telegram step to show connected state
        setStep("telegram");
      } else {
        // Still waiting for connection
        console.log("[Telegram] ⏳ Still waiting for connection...", {
          success: data.success,
          connected: data.connected,
          hasTelegramUser: !!data.telegramUser,
        });
        setStep("telegram");
      }
    } catch (err) {
      console.error("[Telegram] ❌ Error checking telegram status:", err);
      setStep("telegram");
    } finally {
      setCheckingTelegram(false);
    }
  };

  const generateTelegramLink = async () => {
    if (!user?.wallet?.address) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/lazy-trading/generate-telegram-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: user.wallet.address }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.alreadyLinked) {
          setTelegramUser(data.telegramUser);
        } else {
          setLinkCode(data.linkCode);
          setBotUsername(data.botUsername);
          setDeepLink(data.deepLink);
        }
      } else {
        setError(data.error || "Failed to generate link");
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate link");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreferencesSave = (prefs: TradingPreferences) => {
    setTradingPreferences(prefs);
    createAgentAndProceed(prefs);
  };

  const createAgentAndProceed = async (prefs: TradingPreferences) => {
    if (!user?.wallet?.address || !telegramUser) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/lazy-trading/create-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: user.wallet.address,
          telegramAlphaUserId: telegramUser.id,
          tradingPreferences: prefs,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAgentId(data.agent.id);
        if (data.deployment?.id) {
          setDeploymentId(data.deployment.id);
        }

        if (data.ostiumAgentAddress) {
          setOstiumAgentAddress(data.ostiumAgentAddress);
          // Wait a bit for state to update, then check status
          setTimeout(() => {
            checkOstiumStatus();
          }, 100);
        } else {
          // Generate agent address if not returned
          await generateOstiumAddress();
          // checkOstiumStatus will be called via useEffect when address is set
        }

        if (data.hyperliquidAgentAddress) {
          setHyperliquidAgentAddress(data.hyperliquidAgentAddress);
        }

        // NEW: Check if delegation and approval are already complete
        // (from existing wallet setup via normal club flow)
        // If both are already done, skip to complete step
        if (delegationComplete && allowanceComplete) {
          console.log("[LazyTrading] Delegation and approval already complete, skipping to complete step");
          setStep("complete");
        } else {
          setStep("ostium");
        }
      } else {
        setError(data.error || "Failed to create agent");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  const generateOstiumAddress = async () => {
    if (!user?.wallet?.address) return;

    try {
      const response = await fetch("/api/ostium/generate-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: user.wallet.address }),
      });

      if (response.ok) {
        const data = await response.json();
        setOstiumAgentAddress(data.agentAddress);
      }
    } catch (err) {
      console.error("Error generating Ostium address:", err);
    }
  };

  const checkOstiumStatus = async () => {
    if (!user?.wallet?.address) {
      console.log("[Ostium] Cannot check status: no wallet address");
      return;
    }

    if (!ostiumAgentAddress) {
      console.log("[Ostium] Cannot check status: no agent address yet");
      return;
    }

    try {
      console.log(
        "[Ostium] Checking delegation status for:",
        user.wallet.address,
        "->",
        ostiumAgentAddress
      );

      // Check delegation status
      const delegationResponse = await fetch(
        `/api/ostium/check-delegation-status?userWallet=${user.wallet.address}&agentAddress=${ostiumAgentAddress}`
      );

      if (delegationResponse.ok) {
        const delegationData = await delegationResponse.json();
        console.log("[Ostium] Delegation check result:", delegationData);

        if (delegationData.isDelegatedToAgent) {
          console.log("[Ostium] ✅ Delegation is complete");
          setDelegationComplete(true);
        } else {
          console.log(
            "[Ostium] ⚠️ Delegation not found or to different address:",
            delegationData.delegatedAddress,
            "expected:",
            ostiumAgentAddress
          );
          setDelegationComplete(false);
        }
      } else {
        console.error(
          "[Ostium] Failed to check delegation:",
          await delegationResponse.text()
        );
      }

      // Check USDC allowance
      const allowanceResponse = await fetch(
        `/api/ostium/check-approval-status?userWallet=${user.wallet.address}`
      );

      if (allowanceResponse.ok) {
        const allowanceData = await allowanceResponse.json();
        console.log("[Ostium] Allowance check result:", allowanceData);

        if (allowanceData.hasApproval) {
          console.log("[Ostium] ✅ Allowance is complete");
          setAllowanceComplete(true);
        } else {
          setAllowanceComplete(false);
        }
      } else {
        console.error(
          "[Ostium] Failed to check allowance:",
          await allowanceResponse.text()
        );
      }
    } catch (err) {
      console.error("[Ostium] Error checking Ostium status:", err);
    }
  };

  const approveDelegation = async () => {
    if (!authenticated || !user?.wallet?.address) {
      setError("Please connect your wallet first");
      return;
    }

    if (!ostiumAgentAddress) {
      setError("Agent address not found. Please refresh the page.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error("No wallet provider found. Please install MetaMask.");
      }

      // Request account access first - this triggers MetaMask popup if needed
      await provider.request({ method: "eth_requestAccounts" });

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const network = await ethersProvider.getNetwork();

      // Check network (Arbitrum One = 42161, Arbitrum Sepolia = 421614)
      const ARBITRUM_CHAIN_ID =
        process.env.NEXT_PUBLIC_CHAIN_ID === "42161" ? 42161 : 42161;
      if (network.chainId !== ARBITRUM_CHAIN_ID) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}` }],
          });
          // Re-create provider after network switch
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            throw new Error("Please add Arbitrum to your wallet");
          }
          throw new Error("Please switch to Arbitrum network");
        }
      }

      // Get fresh provider after potential network switch
      const freshProvider = new ethers.providers.Web3Provider(
        (window as any).ethereum
      );
      const signer = freshProvider.getSigner();
      const contract = new ethers.Contract(
        OSTIUM_TRADING_CONTRACT,
        OSTIUM_TRADING_ABI,
        signer
      );

      console.log("Setting delegate to:", ostiumAgentAddress);

      const gasEstimate = await contract.estimateGas.setDelegate(
        ostiumAgentAddress
      );
      const gasLimit = gasEstimate.mul(150).div(100);

      const tx = await contract.setDelegate(ostiumAgentAddress, { gasLimit });
      setTxHash(tx.hash);

      await tx.wait();

      setDelegationComplete(true);
      setTxHash(null);
    } catch (err: any) {
      console.error("Delegation error:", err);
      if (err.code === 4001) {
        setError("Transaction rejected");
      } else if (err.code === -32603) {
        setError("Transaction failed. Please check your wallet balance.");
      } else {
        setError(err.message || "Failed to approve delegation");
      }
    } finally {
      setLoading(false);
    }
  };

  const approveUsdc = async () => {
    if (!authenticated || !user?.wallet?.address) return;

    setLoading(true);
    setError("");

    try {
      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error("No wallet provider found.");
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      await ethersProvider.send("eth_requestAccounts", []);

      const signer = ethersProvider.getSigner();
      const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);

      const allowanceAmount = ethers.utils.parseUnits("1000000", 6);

      const approveData = usdcContract.interface.encodeFunctionData("approve", [
        OSTIUM_STORAGE,
        allowanceAmount,
      ]);
      const gasEstimate = await ethersProvider.estimateGas({
        to: USDC_TOKEN,
        from: user.wallet.address,
        data: approveData,
      });

      const gasWithBuffer = gasEstimate.mul(150).div(100);

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: user.wallet.address,
            to: USDC_TOKEN,
            data: approveData,
            gas: gasWithBuffer.toHexString(),
          },
        ],
      });

      setTxHash(txHash);
      await ethersProvider.waitForTransaction(txHash);

      setAllowanceComplete(true);
      setTxHash(null);

      // Both complete - move to final step
      if (delegationComplete) {
        setStep("complete");
      }
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes("rejected")) {
        setError("Transaction rejected");
      } else {
        setError(err.message || "Failed to approve USDC");
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle sending ETH to agent address for gas fees
  const handleSendETH = async () => {
    if (!ostiumAgentAddress || !ethAmount || parseFloat(ethAmount) <= 0) {
      setEthError("Please enter a valid ETH amount");
      return;
    }

    setSendingEth(true);
    setEthError(null);
    setEthTxHash(null);

    try {
      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error("No wallet provider found.");
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      await ethersProvider.send("eth_requestAccounts", []);

      const amountInWei = ethers.utils.parseEther(ethAmount);

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: user?.wallet?.address,
            to: ostiumAgentAddress,
            value: amountInWei.toHexString(),
          },
        ],
      });

      setEthTxHash(txHash);
      await ethersProvider.waitForTransaction(txHash);

      console.log("[LazyTrading] ETH sent successfully:", txHash);
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes("rejected")) {
        setEthError("Transaction rejected");
      } else {
        setEthError(err.message || "Failed to send ETH");
      }
    } finally {
      setSendingEth(false);
    }
  };

  // Proceed to complete when both delegation and allowance are done
  useEffect(() => {
    if (step === "ostium" && delegationComplete && allowanceComplete) {
      setStep("complete");
    }
  }, [step, delegationComplete, allowanceComplete]);

  const steps = [
    { id: "wallet", label: "WALLET", icon: Wallet },
    { id: "telegram", label: "TELEGRAM", icon: Send },
    { id: "preferences", label: "PREFERENCES", icon: Sliders },
    { id: "ostium", label: "OSTIUM", icon: Shield },
    { id: "complete", label: "COMPLETE", icon: Check },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <Header />

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--accent)] bg-[var(--accent)]/10 mb-4">
            <Zap className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-sm font-bold text-[var(--accent)]">
              LAZY TRADING
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4">
            QUICK SETUP
          </h1>
          <p className="text-[var(--text-secondary)]">
            Connect, configure, and start trading in minutes
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="relative">
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-[var(--border)]" />
            <div
              className="absolute top-4 left-4 h-0.5 bg-[var(--accent)] transition-all duration-500"
              style={{
                width: `calc(${(currentStepIndex / (steps.length - 1)) * 100
                  }% - 32px)`,
              }}
            />
            <div className="relative flex justify-between">
              {steps.map((s, index) => {
                const Icon = s.icon;
                const isCompleted = index < currentStepIndex;
                const isCurrent = s.id === step;
                return (
                  <div key={s.id} className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 flex items-center justify-center transition-all border ${isCompleted
                        ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--bg-deep)]"
                        : isCurrent
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-[var(--border)] text-[var(--text-muted)]"
                        }`}
                    >
                      {isCompleted ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span
                      className={`mt-2 text-[10px] font-bold hidden sm:block ${isCurrent
                        ? "text-[var(--accent)]"
                        : "text-[var(--text-muted)]"
                        }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 border border-[var(--danger)] bg-[var(--danger)]/10 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
            <p className="text-[var(--danger)] text-sm">{error}</p>
          </div>
        )}

        {/* Step Content */}
        <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-8">
          {/* Step 1: Connect Wallet */}
          {step === "wallet" && (
            <div className="text-center space-y-6 py-8">
              <div className="w-20 h-20 mx-auto border-2 border-[var(--accent)] flex items-center justify-center">
                <Wallet className="w-10 h-10 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="font-display text-2xl mb-2">CONNECT WALLET</h2>
                <p className="text-[var(--text-secondary)]">
                  Connect your wallet to start setting up lazy trading
                </p>
              </div>

              {authenticated && user?.wallet?.address ? (
                <div className="space-y-4">
                  <div className="border border-[var(--accent)] bg-[var(--accent)]/10 p-4">
                    <p className="text-sm text-[var(--accent)] mb-2">
                      CONNECTED
                    </p>
                    <p className="font-mono text-sm text-[var(--text-primary)] break-all">
                      {user.wallet.address}
                    </p>
                  </div>
                  <button
                    onClick={() => checkTelegramStatus()}
                    className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"
                  >
                    {checkingTelegram ? (
                      <>
                        <Activity className="w-5 h-5 animate-pulse" />
                        CHECKING...
                      </>
                    ) : (
                      <>
                        CONTINUE
                        <ChevronRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => login()}
                  className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"
                >
                  <Wallet className="w-5 h-5" />
                  CONNECT WALLET
                </button>
              )}
            </div>
          )}

          {/* Step 2: Connect Telegram */}
          {step === "telegram" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto border-2 border-[var(--accent)] flex items-center justify-center mb-4">
                  <Send className="w-8 h-8 text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-2xl mb-2">CONNECT TELEGRAM</h2>
                <p className="text-[var(--text-secondary)]">
                  Link your Telegram to send trading signals
                </p>
              </div>

              {telegramUser ? (
                <div className="space-y-4">
                  <div className="border border-[var(--accent)] bg-[var(--accent)]/10 p-6 text-center">
                    <CheckCircle className="w-12 h-12 text-[var(--accent)] mx-auto mb-3" />
                    <p className="font-bold text-lg text-[var(--text-primary)]">
                      TELEGRAM CONNECTED
                    </p>
                    <p className="text-[var(--accent)] mt-2">
                      {telegramUser.telegram_username
                        ? `@${telegramUser.telegram_username}`
                        : telegramUser.first_name || "Connected"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={() => setStep("preferences")}
                      className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"
                    >
                      CONTINUE
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    {/* Manual Refresh Button */}
                    <button
                      onClick={checkTelegramStatus}
                      disabled={checkingTelegram || !user?.wallet?.address}
                      className="w-full py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {checkingTelegram ? (
                        <>
                          <Activity className="w-4 h-4 animate-pulse" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <Activity className="w-4 h-4" />
                          Refresh Connection Status
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : linkCode ? (
                <div className="space-y-4">
                  {/* Step 1: Copy Code */}
                  <div className="border border-[var(--border)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold">
                        Step 1: Copy Code
                      </span>
                      <span className="text-xs px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)]">
                        1 of 3
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-[var(--bg-deep)] px-4 py-3 font-mono text-xl tracking-wider text-center text-[var(--accent)]">
                        {linkCode}
                      </code>
                      <button
                        onClick={copyCode}
                        className="p-3 border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                      >
                        {copied ? (
                          <CheckCircle className="w-5 h-5 text-[var(--accent)]" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Step 2: Open Bot */}
                  <div className="border border-[var(--border)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold">
                        Step 2: Open Bot
                      </span>
                      <span className="text-xs px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)]">
                        2 of 3
                      </span>
                    </div>
                    <a
                      href={deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 border border-[var(--accent)] text-[var(--accent)] font-bold hover:bg-[var(--accent)]/10 transition-colors flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Open @{botUsername}
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  {/* Step 3: Start Bot */}
                  <div className="border border-[var(--border)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold">
                        Step 3: Start Bot
                      </span>
                      <span className="text-xs px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)]">
                        3 of 3
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Click "Start" in Telegram to complete the connection. This
                      page will update automatically.
                    </p>
                  </div>

                  <div className="border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4 flex items-center gap-3">
                    <Activity className="w-5 h-5 text-[var(--accent)] animate-pulse flex-shrink-0" />
                    <p className="text-sm text-[var(--text-secondary)] flex-1">
                      Waiting for Telegram connection...
                    </p>
                  </div>

                  {/* Manual Refresh Button */}
                  <button
                    onClick={checkTelegramStatus}
                    disabled={checkingTelegram || !user?.wallet?.address}
                    className="w-full py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {checkingTelegram ? (
                      <>
                        <Activity className="w-4 h-4 animate-pulse" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <Activity className="w-4 h-4" />
                        Refresh Connection Status
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={generateTelegramLink}
                  disabled={loading}
                  className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Activity className="w-5 h-5 animate-pulse" />
                      GENERATING...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      GENERATE TELEGRAM LINK
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Step 3: Trading Preferences */}
          {step === "preferences" && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h2 className="font-display text-2xl mb-2">
                  TRADING PREFERENCES
                </h2>
                <p className="text-[var(--text-secondary)]">
                  Configure how your agent should trade
                </p>
              </div>

              <TradingPreferencesForm
                userWallet={user?.wallet?.address || ""}
                onClose={() => router.push("/")}
                onBack={() => setStep("telegram")}
                localOnly={true}
                onSaveLocal={handlePreferencesSave}
                initialPreferences={tradingPreferences || undefined}
                primaryLabel={loading ? "Creating Agent..." : "Save & Continue"}
              />
            </div>
          )}

          {/* Step 4: Ostium Setup */}
          {step === "ostium" && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="font-display text-2xl mb-2">OSTIUM SETUP</h2>
                <p className="text-[var(--text-secondary)]">
                  Authorize your agent to trade on Ostium
                </p>
              </div>

              {/* Agent Address */}
              {ostiumAgentAddress && (
                <div className="border border-[var(--accent)] bg-[var(--accent)]/10 p-4">
                  <p className="text-sm text-[var(--accent)] mb-2">
                    AGENT ADDRESS
                  </p>
                  <p className="font-mono text-xs text-[var(--text-primary)] break-all">
                    {ostiumAgentAddress}
                  </p>
                </div>
              )}

              {/* Step 1: Delegation */}
              <div
                className={`border p-4 ${delegationComplete
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)]"
                  }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 flex items-center justify-center border ${delegationComplete
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-deep)]"
                        : "border-[var(--border)]"
                        }`}
                    >
                      {delegationComplete ? <Check className="w-4 h-4" /> : "1"}
                    </span>
                    <div>
                      <p className="font-bold">SET DELEGATION</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Allow agent to trade on your behalf
                      </p>
                    </div>
                  </div>
                  {delegationComplete && (
                    <span className="text-xs px-2 py-1 bg-[var(--accent)] text-[var(--bg-deep)] font-bold">
                      DONE
                    </span>
                  )}
                </div>

                {!delegationComplete && (
                  <div className="space-y-2">
                    <button
                      onClick={approveDelegation}
                      disabled={loading || !ostiumAgentAddress}
                      className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading && !allowanceComplete ? (
                        <>
                          <Activity className="w-5 h-5 animate-pulse" />
                          SIGNING...
                        </>
                      ) : (
                        "APPROVE DELEGATION"
                      )}
                    </button>
                    {ostiumAgentAddress && (
                      <button
                        onClick={checkOstiumStatus}
                        disabled={loading}
                        className="w-full py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        Refresh Status
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: USDC Allowance */}
              <div
                className={`border p-4 ${allowanceComplete
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)]"
                  }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 flex items-center justify-center border ${allowanceComplete
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-deep)]"
                        : "border-[var(--border)]"
                        }`}
                    >
                      {allowanceComplete ? <Check className="w-4 h-4" /> : "2"}
                    </span>
                    <div>
                      <p className="font-bold">SET ALLOWANCE</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Approve USDC spending for trades
                      </p>
                    </div>
                  </div>
                  {allowanceComplete && (
                    <span className="text-xs px-2 py-1 bg-[var(--accent)] text-[var(--bg-deep)] font-bold">
                      DONE
                    </span>
                  )}
                </div>

                {!allowanceComplete && (
                  <button
                    onClick={approveUsdc}
                    disabled={loading || !delegationComplete}
                    className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading && delegationComplete ? (
                      <>
                        <Activity className="w-5 h-5 animate-pulse" />
                        SIGNING...
                      </>
                    ) : (
                      "APPROVE USDC"
                    )}
                  </button>
                )}
              </div>

              {/* Transaction Hash */}
              {txHash && (
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-3">
                  <p className="text-[var(--accent)] text-sm mb-2">
                    Transaction submitted
                  </p>
                  <a
                    href={`https://arbiscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] flex items-center gap-1"
                  >
                    View on Arbiscan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Info Box */}
              <div className="border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-bold text-[var(--text-primary)] mb-2">
                  🔐 Security Note
                </p>
                <ul className="space-y-1 text-xs">
                  <li>• Agent can only trade - cannot withdraw funds</li>
                  <li>• You can revoke access anytime</li>
                  <li>• Funds remain in your wallet</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === "complete" && (
            <div className="space-y-6 py-4">
              {/* Success Header */}
              <div className="text-center">
                <div className="w-20 h-20 mx-auto border-2 border-[var(--accent)] bg-[var(--accent)] flex items-center justify-center mb-4">
                  <CheckCircle className="w-10 h-10 text-[var(--bg-deep)]" />
                </div>
                <h2 className="font-display text-2xl mb-2">YOU'RE ALL SET!</h2>
                <p className="text-[var(--text-secondary)]">
                  Your Lazy Trading agent is ready to execute trades
                </p>
              </div>

              {/* Checklist */}
              <div className="border border-[var(--accent)] bg-[var(--accent)]/10 p-4 text-left space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm">Wallet connected</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm">Telegram linked as signal source</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm">Trading preferences configured</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm">Ostium delegation approved</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm">USDC spending approved</span>
                </div>
              </div>

              {/* Agent Address Display */}
              {ostiumAgentAddress && (
                <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                  <p className="text-xs font-bold text-[var(--text-secondary)] mb-2">
                    YOUR OSTIUM TRADING ADDRESS
                  </p>
                  <div className="flex items-center gap-2 bg-[var(--bg-deep)] p-3 border border-[var(--border)]">
                    <code className="flex-1 text-xs font-mono text-[var(--text-primary)] break-all">
                      {ostiumAgentAddress}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(ostiumAgentAddress);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="p-2 hover:bg-[var(--bg-elevated)] transition-colors"
                      title="Copy address"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-[var(--accent)]" />
                      ) : (
                        <Copy className="w-4 h-4 text-[var(--text-muted)]" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ETH Funding Section */}
              {ostiumAgentAddress && (
                <div className="border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4">
                  <p className="text-xs font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Fund Agent with ETH
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Send ETH to your trading address so it can pay for gas fees when executing trades.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.005"
                      value={ethAmount}
                      onChange={(e) => setEthAmount(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={handleSendETH}
                      disabled={sendingEth || !ethAmount || parseFloat(ethAmount) <= 0}
                      className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-xs hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {sendingEth ? (
                        <>
                          <Activity className="w-3.5 h-3.5 animate-pulse" />
                          SENDING...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          SEND ETH
                        </>
                      )}
                    </button>
                  </div>
                  {ethTxHash && (
                    <p className="text-xs text-[var(--accent)] mt-2 font-mono">
                      TX: <a
                        href={`https://arbiscan.io/tx/${ethTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {ethTxHash.slice(0, 20)}...
                      </a>
                    </p>
                  )}
                  {ethError && (
                    <p className="text-xs text-red-500 mt-2">
                      {ethError}
                    </p>
                  )}
                </div>
              )}

              {/* Ostium Registration */}
              <div className="border border-[var(--border)] p-4">
                <p className="text-xs font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Register on Ostium Platform
                </p>
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  To enable trading, you need to register on the Ostium platform and deposit USDC:
                </p>
                <ol className="space-y-1 text-xs text-[var(--text-secondary)] ml-4 list-decimal mb-3">
                  <li>
                    Visit{' '}
                    <a
                      href="https://app.ostium.com/trade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      app.ostium.com/trade
                    </a>
                  </li>
                  <li>Connect your wallet and set a username</li>
                  <li>Deposit USDC to your account</li>
                  <li>The agent will trade using the USDC you deposit</li>
                </ol>
                <a
                  href="https://app.ostium.com/trade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-xs hover:bg-[var(--accent-dim)] transition-colors"
                >
                  Open Ostium Platform
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* How to Send Signals */}
              <div className="border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-bold text-[var(--text-primary)] mb-2">
                  📱 How to Send Signals
                </p>
                <p className="text-xs">
                  Send trading signals to the Telegram bot, and your agent will
                  execute them automatically.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => router.push("/my-deployments")}
                  className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                >
                  VIEW MY DEPLOYMENTS
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--accent)] transition-colors"
                >
                  BACK TO HOME
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
