import { useEffect, useRef, useState } from "react";
import { Header } from "@components/Header";
import { usePrivy } from "@privy-io/react-auth";
import {
  Wallet,
  Activity,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Shield,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertCircle,
  Loader2,
  Bell,
  BellOff,
} from "lucide-react";

interface Trade {
  id: string;
  tokenSymbol: string;
  side: string;
  status: string;
  qty: string;
  entryPrice: string;
  currentPrice: string | null;
  exitPrice: string | null;
  pnl: string | null;
  unrealizedPnl: string | null;
  unrealizedPnlPercent: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  openedAt: string;
  venue: string;
  agentName: string;
  agentId: string;
  deploymentId: string;
  signalId: string;
  signalCreatedAt: string;
  llmDecision: string | null;
  llmFundAllocation: number | null;
  llmLeverage: number | null;
  llmShouldTrade: boolean | null;
  hasSignatureData: boolean;
  signatureData: {
    messageText: string;
    llmSignature: string;
    llmRawOutput: string;
    llmModelUsed: string;
    llmChainId: number;
    llmFullPrompt: string | null;
    llmMarketContext: string | null;
    llmReasoning: string;
    messageCreatedAt: string;
    confidenceScore: number;
    telegramPostId: string;
    telegramUsername: string;
  } | null;
}

interface VerificationResult {
  success: boolean;
  isValid: boolean;
  recoveredAddress: string;
  expectedAddress: string;
  message: string;
  details: {
    chainId: number;
    model: string;
    messageLength: number;
  };
}

interface UntradedSignal {
  id: string;
  tokenSymbol: string;
  side: string;
  venue: string;
  createdAt: string;
  agentName: string;
  agentId: string;
  deploymentId: string | null;
  llmDecision: string | null;
  llmFundAllocation: number | null;
  llmLeverage: number | null;
  llmShouldTrade: boolean | null;
  hasSignatureData: boolean;
  signatureData: Trade["signatureData"];
}

interface TradesResponse {
  trades: Trade[];
  total: number;
  summary?: {
    total: number;
    open: number;
    closed: number;
  };
  untradedSignals?: UntradedSignal[];
}

export default function MyTrades() {
  const { authenticated, user, login } = usePrivy();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [expandedUntradedSignal, setExpandedUntradedSignal] = useState<
    string | null
  >(null);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<
    Trade | UntradedSignal | null
  >(null);
  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "CLOSED">(
    "ALL"
  );
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{
    total: number;
    open: number;
    closed: number;
  }>({
    total: 0,
    open: 0,
    closed: 0,
  });
  const [untradedSignals, setUntradedSignals] = useState<UntradedSignal[]>([]);

  // Telegram Notification States
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);

  // Prevent background scroll when verification modal is open
  useEffect(() => {
    if (verificationModalOpen) {
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.overflow = originalBodyOverflow;
      };
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }, [verificationModalOpen]);
  const cacheRef = useRef<Record<string, TradesResponse>>({});

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      fetchTrades(page, statusFilter);
      checkTelegramStatus();
    } else {
      setLoading(false);
    }
  }, [authenticated, user?.wallet?.address, page, statusFilter]);

  const checkTelegramStatus = async () => {
    if (!user?.wallet?.address) return;

    try {
      const response = await fetch(
        `/api/telegram-notifications/status?userWallet=${user.wallet.address}`
      );
      const data = await response.json();

      if (data.connected) {
        setTelegramConnected(true);
        setTelegramUsername(data.telegram_username);
      }
    } catch (error) {
      console.error("Failed to check Telegram status:", error);
    }
  };

  const handleConnectTelegram = async () => {
    if (!user?.wallet?.address) return;

    setTelegramLoading(true);
    try {
      const response = await fetch(
        "/api/telegram-notifications/generate-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userWallet: user.wallet.address }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        // Open the deep link in a new tab
        window.open(data.deepLink, "_blank");

        // Show success message
        alert(
          `Link generated! Click the link that just opened, or manually open:\n\n${data.deepLink}\n\nAfter clicking "Start" in Telegram, refresh this page to see the connection status.`
        );
      } else {
        alert(`Error: ${data.error || "Failed to generate link"}`);
      }
    } catch (error) {
      console.error("Failed to connect Telegram:", error);
      alert("Failed to connect Telegram. Please try again.");
    } finally {
      setTelegramLoading(false);
    }
  };

  const fetchTrades = async (
    currentPage: number = 1,
    status: "ALL" | "OPEN" | "CLOSED" = "ALL",
    forceRefresh = false
  ) => {
    if (!user?.wallet?.address) return;

    const cacheKey = `${status}-${currentPage}`;
    const cached = cacheRef.current[cacheKey];

    if (!forceRefresh && cached) {
      setTrades(cached.trades || []);
      setTotal(cached.total || 0);
      if (cached.summary) {
        setSummary({
          total: cached.summary.total,
          open: cached.summary.open,
          closed: cached.summary.closed,
        });
      }
      setUntradedSignals(cached.untradedSignals || []);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const query = new URLSearchParams({
        userWallet: user.wallet.address,
        page: String(currentPage),
        pageSize: String(pageSize),
      });

      if (status !== "ALL") {
        query.append("status", status);
      }

      const response = await fetch(`/api/trades/my-trades?${query.toString()}`);

      if (!response.ok) throw new Error("Failed to fetch trades");

      const data = await response.json();
      console.log("data", data);
      setTrades(data.trades || []);
      setTotal(data.total || 0);
      if (data.summary) {
        setSummary({
          total: data.summary.total,
          open: data.summary.open,
          closed: data.summary.closed,
        });
      }
      setUntradedSignals(data.untradedSignals || []);
      cacheRef.current[cacheKey] = data;
    } catch (error) {
      console.error("Failed to fetch trades:", error);
      setTrades([]);
      setTotal(0);
      setSummary({ total: 0, open: 0, closed: 0 });
      setUntradedSignals([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignature = async (trade: Trade | UntradedSignal) => {
    if (!trade.signatureData) return;

    setSelectedTrade(trade);
    setVerificationModalOpen(true);
    setVerificationResult(null);
    setVerifying(true);

    try {
      let llmFullPrompt = trade.signatureData.llmFullPrompt;

      // If llmFullPrompt is missing, construct it using the construct-prompt API
      if (!llmFullPrompt) {
        console.log("[MyTrades] llmFullPrompt is missing, constructing it...");

        const constructResponse = await fetch("/api/eigenai/construct-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tweetText: trade.signatureData.messageText,
            llm_market_context: trade.signatureData.llmMarketContext || "NO MARKET DATA AVAILABLE",
            tokenSymbol: trade.tokenSymbol,
            userImpactFactor: 50, // Default value
          }),
        });

        const constructData = await constructResponse.json();

        if (!constructResponse.ok || !constructData.success) {
          throw new Error(
            constructData.error || "Failed to construct LLM prompt"
          );
        }

        llmFullPrompt = constructData.llm_full_prompt;
        console.log("[MyTrades] Successfully constructed llmFullPrompt");
      }

      // Now verify the signature with the full prompt
      const response = await fetch("/api/eigenai/verify-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tweetText: trade.signatureData.messageText,
          llm_signature: trade.signatureData.llmSignature,
          llm_raw_output: trade.signatureData.llmRawOutput,
          llm_model_used: trade.signatureData.llmModelUsed,
          llm_chain_id: trade.signatureData.llmChainId,
          llm_full_prompt: llmFullPrompt,
          llm_market_context:
            trade.signatureData.llmMarketContext || "NO MARKET DATA AVAILABLE",
        }),
      });

      const data = await response.json();
      setVerificationResult(data);
    } catch (error) {
      console.error("Verification error:", error);
      setVerificationResult({
        success: false,
        isValid: false,
        recoveredAddress: "",
        expectedAddress: "",
        message: error instanceof Error ? error.message : "Unknown error",
        details: {
          chainId: 0,
          model: "",
          messageLength: 0,
        },
      });
    } finally {
      setVerifying(false);
    }
  };

  const toggleTradeExpansion = (tradeId: string) => {
    setExpandedTrade(expandedTrade === tradeId ? null : tradeId);
  };

  const toggleUntradedExpansion = (signalId: string) => {
    setExpandedUntradedSignal(
      expandedUntradedSignal === signalId ? null : signalId
    );
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleString();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const openCount = summary.open;
  const closedCount = summary.closed;
  const showingStart =
    total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total);
  const showingEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] border border-[var(--border)]">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="mb-6 sm:mb-12">
          <p className="data-label mb-2 text-xs sm:text-sm">BLOCKCHAIN VERIFICATION</p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl mb-3 sm:mb-4 leading-tight">MY TRADES</h1>
          <p className="text-[var(--text-secondary)] text-sm sm:text-base max-w-2xl leading-relaxed">
            All your open trades on Ostium platform with eigenAI signature
            verification. Each trade is cryptographically signed by EigenLabs
            operator ensuring authenticity and transparency.
          </p>
        </div>

        {/* Telegram Notifications */}
        {authenticated && (
          <div className="mb-6 sm:mb-8 border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 sm:gap-4 w-full sm:w-auto min-w-0">
                {telegramConnected ? (
                  <>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 border border-[var(--accent)] bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                      <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-sm sm:text-lg mb-1">
                        TELEGRAM CONNECTED
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] break-words">
                        Notifications enabled for @
                        {telegramUsername || "your account"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 sm:block">
                        Real-time updates for position changes
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                      <BellOff className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--text-muted)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-sm sm:text-lg mb-1">
                        TELEGRAM NOTIFICATIONS
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                        Get instant notifications about your trades on Telegram
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 sm:block">
                        • New positions • Closed positions • Stop loss/Take profit hits
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="w-full sm:w-auto flex-shrink-0">
                {telegramConnected ? (
                  <button
                    onClick={checkTelegramStatus}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 border border-[var(--accent)] text-[var(--accent)] font-bold hover:bg-[var(--accent)]/10 transition-colors text-sm whitespace-nowrap"
                  >
                    ✓ CONNECTED
                  </button>
                ) : (
                  <button
                    onClick={handleConnectTelegram}
                    disabled={telegramLoading}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                  >
                    {telegramLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        CONNECTING...
                      </>
                    ) : (
                      <>
                        <Bell className="w-4 h-4" />
                        CONNECT TELEGRAM
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Overview cards */}
        {authenticated && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-4">
              <p className="data-label mb-2 text-xs">TOTAL TRADES</p>
              <p className="font-display text-3xl sm:text-3xl">{summary.total}</p>
              <p className="text-[var(--text-muted)] text-xs sm:text-sm leading-relaxed">
                All signals linked to your deployments
              </p>
            </div>
            <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-4">
              <p className="data-label mb-2 text-xs">OPEN POSITIONS</p>
              <p className="font-display text-3xl sm:text-3xl text-green-400">
                {openCount}
              </p>
              <p className="text-[var(--text-muted)] text-xs sm:text-sm leading-relaxed">
                Currently active trades
              </p>
            </div>
            <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-4">
              <p className="data-label mb-2 text-xs">CLOSED / FILLED</p>
              <p className="font-display text-3xl sm:text-3xl text-[var(--text-muted)]">
                {closedCount}
              </p>
              <p className="text-[var(--text-muted)] text-xs sm:text-sm leading-relaxed">
                Completed or inactive trades
              </p>
            </div>
          </div>
        )}

        {!authenticated ? (
          <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 border border-[var(--accent)] flex items-center justify-center mb-6">
                <Wallet className="w-8 h-8 text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl mb-2">CONNECT WALLET</h3>
              <p className="text-[var(--text-muted)] mb-6 text-center">
                Connect your wallet to view your trades
              </p>
              <button
                onClick={login}
                className="px-8 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
              >
                CONNECT WALLET
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <label className="text-xs text-[var(--text-muted)] font-mono">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(
                      e.target.value as "ALL" | "OPEN" | "CLOSED"
                    );
                    setPage(1);
                  }}
                  className="bg-[var(--bg-surface)] border border-[var(--border)] px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm"
                >
                  <option value="ALL">All</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <div className="text-xs text-[var(--text-muted)] font-mono">
                  Showing {showingStart}-{showingEnd} of {total} trades
                </div>
                <button
                  onClick={() => {
                    cacheRef.current = {};
                    fetchTrades(page, statusFilter, true);
                  }}
                  className="px-3 py-1.5 sm:py-2 border border-[var(--border)] text-xs sm:text-sm hover:border-[var(--accent)] disabled:opacity-50"
                  disabled={loading}
                >
                  Refresh
                </button>
              </div>
            </div>

            {loading ? (
              <div className="space-y-4 border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                {[1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="border border-[var(--border)] bg-[var(--bg-surface)] animate-pulse"
                  >
                    <div className="p-6">
                      <div className="grid grid-cols-12 items-center gap-4">
                        <div className="col-span-3">
                          <div className="h-3 w-16 bg-[var(--bg-elevated)] mb-2" />
                          <div className="h-5 w-32 bg-[var(--bg-elevated)]" />
                        </div>
                        <div className="col-span-2">
                          <div className="h-3 w-24 bg-[var(--bg-elevated)] mb-1" />
                          <div className="h-4 w-20 bg-[var(--bg-elevated)]" />
                        </div>
                        <div className="col-span-3">
                          <div className="h-3 w-24 bg-[var(--bg-elevated)] mb-1" />
                          <div className="h-4 w-32 bg-[var(--bg-elevated)]" />
                        </div>
                        <div className="col-span-2">
                          <div className="h-3 w-16 bg-[var(--bg-elevated)] mb-1" />
                          <div className="h-4 w-16 bg-[var(--bg-elevated)]" />
                        </div>
                        <div className="col-span-1">
                          <div className="h-3 w-24 bg-[var(--bg-elevated)]" />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <div className="h-4 w-4 bg-[var(--bg-elevated)]" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : trades.length === 0 ? (
              <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <Activity className="w-12 h-12 text-[var(--text-muted)] mb-6" />
                  <h3 className="font-display text-xl mb-2">NO TRADES YET</h3>
                  <p className="text-[var(--text-muted)] mb-6 text-center">
                    You don't have any trades linked to your deployments yet.
                    Try adjusting filters.
                  </p>
                  <a
                    href="/#agents"
                    className="px-8 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                  >
                    BROWSE AGENTS
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {trades.map((trade, index) => {
                  const isExpanded = expandedTrade === trade.id;
                  const pnl = parseFloat(trade.unrealizedPnl || "0");
                  const pnlPercent = parseFloat(
                    trade.unrealizedPnlPercent || "0"
                  );
                  const isProfitable = pnl > 0;

                  return (
                    <div
                      key={trade.id}
                      className="border border-[var(--border)] bg-[var(--bg-surface)]"
                    >
                      {/* Trade Header - Always Visible */}
                      <div
                        className="p-4 sm:p-6 cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors"
                        onClick={() => toggleTradeExpansion(trade.id)}
                      >
                        {/* Mobile Layout */}
                        <div className="block sm:hidden">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-[var(--accent)] font-mono text-xs">
                                #{String(index + 1).padStart(2, "0")}
                              </span>
                              <h3 className="font-display text-lg mt-1 flex flex-wrap items-center gap-1.5">
                                {trade.tokenSymbol}
                                <span
                                  className={`text-xs px-1.5 py-0.5 font-bold ${trade.side === "LONG"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-red-500/20 text-red-400"
                                    }`}
                                >
                                  {trade.side}
                                </span>
                                <span
                                  className={`text-xs px-1.5 py-0.5 font-bold border border-[var(--border)] ${trade.status === "OPEN"
                                    ? "text-green-300 bg-green-500/10"
                                    : "text-[var(--text-muted)] bg-[var(--bg-surface)]"
                                    }`}
                                >
                                  {trade.status}
                                </span>
                              </h3>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              {trade.hasSignatureData && (
                                <Shield className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                              )}
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="data-label mb-1 text-xs">ENTRY</p>
                              <p className="font-mono text-sm">${trade.entryPrice}</p>
                            </div>
                            <div>
                              <p className="data-label mb-1 text-xs">VENUE</p>
                              <span className="text-xs border border-[var(--border)] px-2 py-1 inline-block">
                                {trade.venue}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="data-label mb-1 text-xs">SIGNAL TIME</p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {formatDate(trade.signalCreatedAt)}
                            </p>
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden sm:grid grid-cols-12 items-center gap-4">
                          {/* Trade Number & Token */}
                          <div className="col-span-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-[var(--accent)] font-mono text-xs">
                                #{String(index + 1).padStart(2, "0")}
                              </span>
                              <h3 className="font-display text-xl mt-1 flex flex-wrap items-center gap-2">
                                {trade.tokenSymbol}
                                <span
                                  className={`text-xs px-2 py-0.5 font-bold ${trade.side === "LONG"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-red-500/20 text-red-400"
                                    }`}
                                >
                                  {trade.side}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 font-bold border border-[var(--border)] ${trade.status === "OPEN"
                                    ? "text-green-300 bg-green-500/10"
                                    : "text-[var(--text-muted)] bg-[var(--bg-surface)]"
                                    }`}
                                >
                                  {trade.status}
                                </span>
                              </h3>
                            </div>
                          </div>

                          {/* Entry Price */}
                          <div className="col-span-2">
                            <p className="data-label mb-1 text-xs">ENTRY</p>
                            <p className="font-mono text-base">${trade.entryPrice}</p>
                          </div>

                          {/* Signal Time */}
                          <div className="col-span-3">
                            <p className="data-label mb-1 text-xs">SIGNAL TIME</p>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {formatDate(trade.signalCreatedAt)}
                            </p>
                          </div>

                          {/* Venue */}
                          <div className="col-span-2">
                            <span className="text-xs border border-[var(--border)] px-2 py-1 inline-block">
                              {trade.venue}
                            </span>
                          </div>

                          {/* Signature Status */}
                          <div className="col-span-1 flex items-center gap-2">
                            {trade.hasSignatureData ? (
                              <>
                                <Shield className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                                <span className="text-xs font-bold text-[var(--accent)]">
                                  SIGNED
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)] font-mono">
                                No signature
                              </span>
                            )}
                          </div>

                          {/* Expand Icon */}
                          <div className="col-span-1 flex justify-end">
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t border-[var(--border)] p-4 sm:p-6 bg-[var(--bg-elevated)]">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                            {/* Left Column - Trade Details */}
                            <div className="space-y-4 lg:col-span-1">
                              <h4 className="font-display text-sm mb-3">
                                TRADE DETAILS
                              </h4>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                                <div className="border border-[var(--border)] p-3">
                                  <p className="data-label mb-1 text-xs">QUANTITY</p>
                                  <p className="font-mono text-sm">{trade.qty}</p>
                                </div>

                                <div className="border border-[var(--border)] p-3">
                                  <p className="data-label mb-1 text-xs">AGENT</p>
                                  <p className="text-sm break-words">{trade.agentName}</p>
                                </div>

                                <div className="border border-[var(--border)] p-3">
                                  <p className="data-label mb-1 text-xs">STATUS</p>
                                  <p
                                    className={`text-sm font-bold ${trade.status === "OPEN"
                                      ? "text-green-400"
                                      : "text-[var(--text-muted)]"
                                      }`}
                                  >
                                    {trade.status}
                                  </p>
                                </div>

                                {/* PNL and Exit Price - Only show if present */}
                                {(trade.pnl !== null ||
                                  trade.exitPrice !== null) && (
                                    <>
                                      {trade.exitPrice && (
                                        <div className="border border-[var(--border)] p-3">
                                          <p className="data-label mb-1 text-xs">
                                            EXIT PRICE
                                          </p>
                                          <p className="font-mono text-sm">
                                            ${trade.exitPrice}
                                          </p>
                                        </div>
                                      )}

                                      {trade.pnl && (
                                        <div className="border border-[var(--border)] p-3">
                                          <p className="data-label mb-1 text-xs">
                                            REALIZED PNL
                                          </p>
                                          <p
                                            className={`font-mono text-sm font-bold ${parseFloat(trade.pnl) >= 0
                                              ? "text-green-400"
                                              : "text-red-400"
                                              }`}
                                          >
                                            {parseFloat(trade.pnl) >= 0
                                              ? "+"
                                              : ""}
                                            ${trade.pnl}
                                          </p>
                                        </div>
                                      )}
                                    </>
                                  )}

                                <div className="border border-[var(--border)] p-3">
                                  <p className="data-label mb-1 text-xs">STOP LOSS</p>
                                  <p className="font-mono text-sm">
                                    {trade.stopLoss || "N/A"}
                                  </p>
                                </div>

                                <div className="border border-[var(--border)] p-3">
                                  <p className="data-label mb-1 text-xs">TAKE PROFIT</p>
                                  <p className="font-mono text-sm">
                                    {trade.takeProfit || "N/A"}
                                  </p>
                                </div>

                                <div className="border border-[var(--border)] p-3 col-span-full">
                                  <p className="data-label mb-1 text-xs">OPENED AT</p>
                                  <p className="text-sm">
                                    {formatDate(trade.openedAt)}
                                  </p>
                                </div>

                                <div className="border border-[var(--border)] p-3 col-span-full">
                                  <p className="data-label mb-1 text-xs">
                                    SIGNAL CREATED AT
                                  </p>
                                  <p className="text-sm">
                                    {formatDate(trade.signalCreatedAt)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Middle Column - LLM Decision (if available) */}
                            {(trade.llmDecision !== null ||
                              trade.llmFundAllocation !== null ||
                              trade.llmLeverage !== null ||
                              trade.llmShouldTrade !== null) && (
                                <div className="space-y-4 lg:col-span-1">
                                  <h4 className="font-display text-sm mb-3">
                                    AGENT DECISION
                                  </h4>
                                  <div className="border border-[var(--border)] p-4 space-y-3 bg-[var(--bg-surface)]">
                                    {trade.llmDecision && (
                                      <div>
                                        <p className="data-label mb-1 text-xs">
                                          DECISION SUMMARY
                                        </p>
                                        <p className="text-xs text-[var(--text-secondary)] break-words">
                                          {trade.llmDecision}
                                        </p>
                                      </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                                      {trade.llmFundAllocation !== null && (
                                        <div className="border border-[var(--border)] p-3">
                                          <p className="data-label mb-1 text-xs">
                                            FUND ALLOCATION
                                          </p>
                                          <p className="text-sm font-mono text-[var(--accent)]">
                                            {trade.llmFundAllocation.toFixed(0)}%
                                          </p>
                                        </div>
                                      )}

                                      {trade.llmLeverage !== null && (
                                        <div className="border border-[var(--border)] p-3">
                                          <p className="data-label mb-1 text-xs">
                                            LEVERAGE
                                          </p>
                                          <p className="text-sm font-mono">
                                            {trade.llmLeverage.toFixed(1)}x
                                          </p>
                                        </div>
                                      )}

                                      {trade.llmShouldTrade !== null && (
                                        <div className="border border-[var(--border)] p-3 col-span-full">
                                          <p className="data-label mb-1 text-xs">
                                            SHOULD TRADE
                                          </p>
                                          <p
                                            className={`text-sm font-bold ${trade.llmShouldTrade
                                              ? "text-green-400"
                                              : "text-red-400"
                                              }`}
                                          >
                                            {trade.llmShouldTrade
                                              ? "YES - EXECUTE TRADE"
                                              : "NO - DO NOT TRADE"}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                            {/* Right Column - Signature Data */}
                            <div className="space-y-4 lg:col-span-1">
                              <h4 className="font-display text-sm mb-3">
                                EIGENAI SIGNATURE
                              </h4>

                              {trade.signatureData ? (
                                <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 space-y-3">
                                  {/* Signal Message */}
                                  <div>
                                    <p className="data-label mb-2 text-xs">
                                      ORIGINAL SIGNAL
                                    </p>
                                    <p className="text-xs text-[var(--text-secondary)] italic break-words">
                                      "
                                      {trade.signatureData.messageText.substring(
                                        0,
                                        150
                                      )}
                                      {trade.signatureData.messageText.length >
                                        150
                                        ? "..."
                                        : ""}
                                      "
                                    </p>
                                  </div>

                                  {/* Telegram User */}
                                  <div className="flex justify-between items-center py-2 border-t border-[var(--border)] gap-2">
                                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                                      Alpha Trader
                                    </span>
                                    <span className="text-xs font-mono break-all text-right">
                                      @{trade.signatureData.telegramUsername}
                                    </span>
                                  </div>

                                  {/* Model Used */}
                                  <div className="flex justify-between items-center py-2 border-t border-[var(--border)] gap-2">
                                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                                      Model
                                    </span>
                                    <span className="text-xs font-mono break-all text-right">
                                      {trade.signatureData.llmModelUsed}
                                    </span>
                                  </div>

                                  {/* Chain ID */}
                                  <div className="flex justify-between items-center py-2 border-t border-[var(--border)] gap-2">
                                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                                      Chain ID
                                    </span>
                                    <span className="text-xs font-mono">
                                      {trade.signatureData.llmChainId}
                                    </span>
                                  </div>

                                  {/* Confidence Score */}
                                  <div className="flex justify-between items-center py-2 border-t border-[var(--border)] gap-2">
                                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                                      Confidence
                                    </span>
                                    <span className="text-xs font-bold text-[var(--accent)]">
                                      {(
                                        trade.signatureData.confidenceScore *
                                        100
                                      ).toFixed(0)}
                                      %
                                    </span>
                                  </div>

                                  {/* Signature (truncated) */}
                                  <div className="py-2 border-t border-[var(--border)]">
                                    <p className="text-xs text-[var(--text-muted)] mb-1">
                                      Signature
                                    </p>
                                    <p className="text-xs font-mono break-all text-[var(--accent)]">
                                      {formatAddress(
                                        trade.signatureData.llmSignature
                                      )}
                                    </p>
                                  </div>

                                  {/* Verify Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleVerifySignature(trade);
                                    }}
                                    className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2 mt-2 text-sm"
                                  >
                                    <Shield className="w-4 h-4" />
                                    VERIFY SIGNATURE
                                  </button>
                                </div>
                              ) : (
                                <div className="border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-3 text-sm text-[var(--text-muted)]">
                                  <p className="font-bold text-[var(--text-secondary)]">
                                    No signature available for this signal yet.
                                  </p>
                                  <p className="text-xs">
                                    You can still track the position details and
                                    status above.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between pt-4 gap-3">
                  <div className="flex items-center gap-2 order-2 sm:order-1">
                    <button
                      disabled={page === 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPage((p) => Math.max(1, p - 1));
                      }}
                      className={`px-4 py-2 border border-[var(--border)] text-sm ${page === 1
                        ? "text-[var(--text-muted)] cursor-not-allowed"
                        : "hover:border-[var(--accent)]"
                        }`}
                    >
                      Previous
                    </button>
                    <button
                      disabled={page * pageSize >= total}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPage((p) => p + 1);
                      }}
                      className={`px-4 py-2 border border-[var(--border)] text-sm ${page * pageSize >= total
                        ? "text-[var(--text-muted)] cursor-not-allowed"
                        : "hover:border-[var(--accent)]"
                        }`}
                    >
                      Next
                    </button>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] font-mono text-center order-1 sm:order-2">
                    Page {page} / {Math.max(1, Math.ceil(total / pageSize))}
                  </div>
                </div>
              </div>
            )}

            {/* Untraded signals (signals without positions) */}
            {untradedSignals.length > 0 && (
              <div className="mt-8 sm:mt-12 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <p className="data-label mb-1 text-xs">UNTRADED SIGNALS</p>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                      Signals from your agents that did not result in positions.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {untradedSignals.length} signals
                  </span>
                </div>

                {untradedSignals.map((signal, index) => {
                  const isExpanded = expandedUntradedSignal === signal.id;

                  return (
                    <div
                      key={signal.id}
                      className="border border-[var(--border)] bg-[var(--bg-surface)]"
                    >
                      {/* Header */}
                      <div
                        className="p-4 sm:p-6 cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors"
                        onClick={() => toggleUntradedExpansion(signal.id)}
                      >
                        {/* Mobile Layout */}
                        <div className="block sm:hidden">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-[var(--accent)] font-mono text-xs">
                                S#{String(index + 1).padStart(2, "0")}
                              </span>
                              <h3 className="font-display text-lg mt-1 flex flex-wrap items-center gap-1.5">
                                {signal.tokenSymbol}
                                <span
                                  className={`text-xs px-1.5 py-0.5 font-bold ${signal.side === "LONG"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-red-500/20 text-red-400"
                                    }`}
                                >
                                  {signal.side}
                                </span>
                                <span className="text-xs px-1.5 py-0.5 font-bold border border-[var(--border)] text-yellow-300 bg-yellow-500/10">
                                  NOT TRADED
                                </span>
                              </h3>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              {signal.hasSignatureData && (
                                <Shield className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                              )}
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="data-label mb-1 text-xs">AGENT</p>
                              <p className="text-sm break-words">{signal.agentName}</p>
                            </div>
                            <div>
                              <p className="data-label mb-1 text-xs">VENUE</p>
                              <span className="text-xs border border-[var(--border)] px-2 py-1 inline-block">
                                {signal.venue}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="data-label mb-1 text-xs">SIGNAL TIME</p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {formatDate(signal.createdAt)}
                            </p>
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden sm:grid grid-cols-12 items-center gap-4">
                          {/* Index + token */}
                          <div className="col-span-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-[var(--accent)] font-mono text-xs">
                                S#{String(index + 1).padStart(2, "0")}
                              </span>
                              <h3 className="font-display text-xl mt-1 flex flex-wrap items-center gap-2">
                                {signal.tokenSymbol}
                                <span
                                  className={`text-xs px-2 py-0.5 font-bold ${signal.side === "LONG"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-red-500/20 text-red-400"
                                    }`}
                                >
                                  {signal.side}
                                </span>
                                <span className="text-xs px-2 py-0.5 font-bold border border-[var(--border)] text-yellow-300 bg-yellow-500/10">
                                  NOT TRADED
                                </span>
                              </h3>
                            </div>
                          </div>

                          {/* Agent */}
                          <div className="col-span-3">
                            <p className="data-label mb-1 text-xs">AGENT</p>
                            <p className="text-sm">{signal.agentName}</p>
                          </div>

                          {/* Signal time */}
                          <div className="col-span-3">
                            <p className="data-label mb-1 text-xs">SIGNAL TIME</p>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {formatDate(signal.createdAt)}
                            </p>
                          </div>

                          {/* Venue */}
                          <div className="col-span-2">
                            <p className="data-label mb-1 text-xs">VENUE</p>
                            <span className="text-xs border border-[var(--border)] px-2 py-1 inline-block">
                              {signal.venue}
                            </span>
                          </div>

                          {/* Signature status + toggle */}
                          <div className="col-span-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {signal.hasSignatureData ? (
                                <>
                                  <Shield className="w-4 h-4 text-[var(--accent)]" />
                                  <span className="text-xs font-bold text-[var(--accent)]">
                                    SIGNED
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs text-[var(--text-muted)] font-mono">
                                  No signature
                                </span>
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t border-[var(--border)] p-4 sm:p-6 bg-[var(--bg-elevated)] space-y-4 sm:space-y-6">
                          {/* LLM decision summary row */}
                          {(signal.llmDecision ||
                            signal.llmFundAllocation !== null ||
                            signal.llmLeverage !== null ||
                            signal.llmShouldTrade !== null) && (
                              <div className="space-y-3">
                                <p className="data-label mb-2">AGENT DECISION</p>
                                {signal.llmDecision && (
                                  <p className="text-xs text-[var(--text-secondary)]">
                                    {signal.llmDecision}
                                  </p>
                                )}
                              </div>
                            )}

                          {/* EigenAI Signature for untraded signals */}
                          <div>
                            <p className="data-label mb-2">EIGENAI SIGNATURE</p>
                            {signal.signatureData ? (
                              <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 space-y-3">
                                <div>
                                  <p className="data-label mb-2">
                                    ORIGINAL SIGNAL
                                  </p>
                                  <p className="text-xs text-[var(--text-secondary)] italic">
                                    "
                                    {signal.signatureData.messageText}
                                    "
                                  </p>
                                </div>

                                <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
                                  <span className="text-xs text-[var(--text-muted)]">
                                    Alpha Trader
                                  </span>
                                  <span className="text-xs font-mono">
                                    @{signal.signatureData.telegramUsername}
                                  </span>
                                </div>

                                <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
                                  <span className="text-xs text-[var(--text-muted)]">
                                    Model
                                  </span>
                                  <span className="text-xs font-mono">
                                    {signal.signatureData.llmModelUsed}
                                  </span>
                                </div>

                                <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
                                  <span className="text-xs text-[var(--text-muted)]">
                                    Chain ID
                                  </span>
                                  <span className="text-xs font-mono">
                                    {signal.signatureData.llmChainId}
                                  </span>
                                </div>

                                <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
                                  <span className="text-xs text-[var(--text-muted)]">
                                    Confidence
                                  </span>
                                  <span className="text-xs font-bold text-[var(--accent)]">
                                    {(
                                      signal.signatureData.confidenceScore * 100
                                    ).toFixed(0)}
                                    %
                                  </span>
                                </div>

                                <div className="py-2 border-t border-[var(--border)]">
                                  <p className="text-xs text-[var(--text-muted)] mb-1">
                                    Signature
                                  </p>
                                  <p className="text-xs font-mono break-all text-[var(--accent)]">
                                    {formatAddress(
                                      signal.signatureData.llmSignature
                                    )}
                                  </p>
                                </div>

                                <button
                                  onClick={() => {
                                    setSelectedTrade(signal);
                                    setVerificationModalOpen(true);
                                    setVerificationResult(null);
                                    handleVerifySignature(signal);
                                  }}
                                  className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2 mt-2"
                                >
                                  <Shield className="w-4 h-4" />
                                  VERIFY SIGNATURE
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--text-muted)]">
                                No EigenAI signature available for this signal.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Verification Modal */}
      {verificationModalOpen && selectedTrade && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-hidden overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="bg-[var(--bg-deep)] border-0 sm:border border-[var(--border)] max-w-4xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="border-b border-[var(--border)] p-4 sm:p-6 sticky top-0 bg-[var(--bg-deep)] z-10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--accent)] flex-shrink-0" />
                  <div className="min-w-0">
                    <h2 className="font-display text-lg sm:text-xl">
                      SIGNATURE VERIFICATION
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] break-words">
                      {selectedTrade.tokenSymbol} {selectedTrade.side} Trade
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setVerificationModalOpen(false)}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
                >
                  <X className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {verifying ? (
                <div className="flex flex-col items-center justify-center py-8 sm:py-16">
                  <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 animate-spin text-[var(--accent)] mb-4" />
                  <p className="text-[var(--text-muted)] text-sm sm:text-base">
                    Verifying signature with EigenAI...
                  </p>
                </div>
              ) : verificationResult ? (
                <>
                  {/* Verification Result */}
                  <div
                    className={`border p-4 sm:p-6 ${verificationResult.isValid
                      ? "border-green-500/50 bg-green-500/10"
                      : "border-red-500/50 bg-red-500/10"
                      }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {verificationResult.isValid ? (
                        <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-400 flex-shrink-0 mt-1 sm:mt-0" />
                      ) : (
                        <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-400 flex-shrink-0 mt-1 sm:mt-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-base sm:text-lg leading-tight">
                          {verificationResult.isValid
                            ? "✅ SIGNATURE VERIFIED"
                            : "❌ VERIFICATION FAILED"}
                        </h3>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 break-words">
                          {verificationResult.message}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Backend Traces */}
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
                    <div className="border-b border-[var(--border)] p-3 sm:p-4">
                      <h4 className="font-display text-xs sm:text-sm">BACKEND TRACES</h4>
                    </div>
                    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                      {/* Step 1: Input Data */}
                      <div className="border border-[var(--border)] p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">STEP 1: INPUT DATA</p>
                        <div className="space-y-2 text-xs font-mono">
                          <div className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="text-[var(--text-muted)] flex-shrink-0">
                              Chain ID:
                            </span>
                            <span className="break-all">{verificationResult.details.chainId}</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="text-[var(--text-muted)] flex-shrink-0">
                              Model:
                            </span>
                            <span className="break-all">{verificationResult.details.model}</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="text-[var(--text-muted)] flex-shrink-0">
                              Message Length:
                            </span>
                            <span>{verificationResult.details.messageLength} characters</span>
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Prompt Reconstruction */}
                      <div className="border border-[var(--border)] p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 2: PROMPT RECONSTRUCTION
                        </p>
                        <div className="bg-[var(--bg-elevated)] p-3 text-xs">
                          <p className="text-[var(--text-muted)] mb-2">
                            Original Message:
                          </p>
                          <p className="text-[var(--text-secondary)] italic break-words leading-relaxed">
                            "{selectedTrade.signatureData?.messageText}"
                          </p>
                        </div>
                      </div>

                      {/* Step 3: Message Construction */}
                      <div className="border border-[var(--border)] p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 3: MESSAGE CONSTRUCTION
                        </p>
                        <div className="text-xs font-mono space-y-2">
                          <p className="text-[var(--text-muted)] break-words">
                            Format: chainId + modelId + prompt + output
                          </p>
                          <p className="text-[var(--accent)]">
                            ✅ Message constructed: {verificationResult.details.messageLength} characters
                          </p>
                        </div>
                      </div>

                      {/* Step 4: Signature Verification */}
                      <div className="border border-[var(--border)] p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 4: SIGNATURE VERIFICATION
                        </p>
                        <div className="space-y-3 text-xs">
                          <div>
                            <p className="text-[var(--text-muted)] mb-2">
                              Expected Signer (EigenLabs):
                            </p>
                            <p className="font-mono bg-[var(--bg-elevated)] p-2 break-all text-[10px] sm:text-xs leading-relaxed">
                              {verificationResult.expectedAddress}
                            </p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)] mb-2">
                              Recovered Signer:
                            </p>
                            <p
                              className={`font-mono bg-[var(--bg-elevated)] p-2 break-all text-[10px] sm:text-xs leading-relaxed ${verificationResult.isValid
                                ? "text-green-400"
                                : "text-red-400"
                                }`}
                            >
                              {verificationResult.recoveredAddress}
                            </p>
                          </div>
                          <div
                            className={`flex items-start gap-2 ${verificationResult.isValid
                              ? "text-green-400"
                              : "text-red-400"
                              }`}
                          >
                            {verificationResult.isValid ? (
                              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            )}
                            <span className="font-bold text-xs leading-relaxed">
                              {verificationResult.isValid
                                ? "ADDRESSES MATCH ✓"
                                : "ADDRESSES DO NOT MATCH ✗"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Step 5: LLM Raw Output */}
                      <div className="border border-[var(--border)] p-3 sm:p-4">
                        <p className="data-label mb-2 sm:mb-3 text-xs">
                          STEP 5: LLM RAW OUTPUT
                        </p>
                        <div className="bg-[var(--bg-elevated)] p-3 text-xs font-mono max-h-40 sm:max-h-48 overflow-y-auto break-words leading-relaxed">
                          {selectedTrade.signatureData?.llmRawOutput}
                        </div>
                      </div>

                      {/* Reasoning */}
                      {/* {selectedTrade.signatureData?.llmReasoning && (
                        <div className="border border-[var(--border)] p-4">
                          <p className="data-label mb-3">LLM REASONING</p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {selectedTrade.signatureData.llmReasoning}
                          </p>
                        </div>
                      )} */}
                    </div>
                  </div>

                  {/* Documentation Link */}
                  <a
                    href="https://docs.eigencloud.xyz/eigenai/howto/verify-signature"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-3 sm:py-3 border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />
                    <span className="text-center break-words">VIEW EIGENAI DOCUMENTATION</span>
                  </a>
                </>
              ) : (
                <div className="text-center py-8 text-[var(--text-muted)]">
                  No verification result
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
