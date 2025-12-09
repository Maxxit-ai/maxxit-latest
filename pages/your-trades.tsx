import { useEffect, useState } from "react";
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
} from "lucide-react";

interface Trade {
  id: string;
  tokenSymbol: string;
  side: string;
  qty: string;
  entryPrice: string;
  currentPrice: string | null;
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
  hasSignatureData: boolean;
  signatureData: {
    messageText: string;
    llmSignature: string;
    llmRawOutput: string;
    llmModelUsed: string;
    llmChainId: number;
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

export default function YourTrades() {
  const { authenticated, user, login } = usePrivy();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      fetchTrades();
    } else {
      setLoading(false);
    }
  }, [authenticated, user?.wallet?.address]);

  const fetchTrades = async () => {
    if (!user?.wallet?.address) return;

    try {
      const response = await fetch(
        `/api/trades/my-trades?userWallet=${user.wallet.address}`
      );

      if (!response.ok) throw new Error("Failed to fetch trades");

      const data = await response.json();
      setTrades(data.trades || []);
    } catch (error) {
      console.error("Failed to fetch trades:", error);
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignature = async (trade: Trade) => {
    if (!trade.signatureData) return;

    setSelectedTrade(trade);
    setVerificationModalOpen(true);
    setVerificationResult(null);
    setVerifying(true);

    try {
      const response = await fetch("/api/eigenai/verify-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tweetText: trade.signatureData.messageText,
          llm_signature: trade.signatureData.llmSignature,
          llm_raw_output: trade.signatureData.llmRawOutput,
          llm_model_used: trade.signatureData.llmModelUsed,
          llm_chain_id: trade.signatureData.llmChainId,
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

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleString();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)]">
        <Header />
        <div className="flex items-center justify-center h-96">
          <Activity className="w-8 h-8 animate-pulse text-[var(--accent)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <Header />

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <p className="data-label mb-2">BLOCKCHAIN VERIFICATION</p>
          <h1 className="font-display text-4xl md:text-5xl mb-4">
            YOUR TRADES
          </h1>
          <p className="text-[var(--text-secondary)] max-w-2xl">
            All your open trades on Ostium platform with eigenAI signature
            verification. Each trade is cryptographically signed by EigenLabs
            operator ensuring authenticity and transparency.
          </p>
        </div>

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
        ) : trades.length === 0 ? (
          <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Activity className="w-12 h-12 text-[var(--text-muted)] mb-6" />
              <h3 className="font-display text-xl mb-2">NO OPEN TRADES</h3>
              <p className="text-[var(--text-muted)] mb-6 text-center">
                You don't have any open trades with eigenAI signatures yet
              </p>
              <a
                href="/"
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
              const pnlPercent = parseFloat(trade.unrealizedPnlPercent || "0");
              const isProfitable = pnl > 0;

              return (
                <div
                  key={trade.id}
                  className="border border-[var(--border)] bg-[var(--bg-surface)]"
                >
                  {/* Trade Header - Always Visible */}
                  <div
                    className="p-6 cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors"
                    onClick={() => toggleTradeExpansion(trade.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6 flex-1">
                        {/* Trade Number & Token */}
                        <div>
                          <span className="text-[var(--accent)] font-mono text-xs">
                            #{String(index + 1).padStart(2, "0")}
                          </span>
                          <h3 className="font-display text-xl mt-1 flex items-center gap-2">
                            {trade.tokenSymbol}
                            <span
                              className={`text-xs px-2 py-0.5 font-bold ${
                                trade.side === "LONG"
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {trade.side}
                            </span>
                          </h3>
                        </div>

                        {/* PnL */}
                        <div className="flex-1">
                          <p className="data-label mb-1">UNREALIZED PNL</p>
                          <p
                            className={`text-lg font-bold ${
                              isProfitable
                                ? "text-green-400"
                                : "text-red-400"
                            }`}
                          >
                            {isProfitable ? "+" : ""}
                            {trade.unrealizedPnl || "N/A"} (
                            {isProfitable ? "+" : ""}
                            {trade.unrealizedPnlPercent || "0"}%)
                          </p>
                        </div>

                        {/* Entry Price */}
                        <div>
                          <p className="data-label mb-1">ENTRY</p>
                          <p className="font-mono">${trade.entryPrice}</p>
                        </div>

                        {/* Current Price */}
                        <div>
                          <p className="data-label mb-1">CURRENT</p>
                          <p className="font-mono">
                            ${trade.currentPrice || "N/A"}
                          </p>
                        </div>

                        {/* Venue */}
                        <div>
                          <span className="text-xs border border-[var(--border)] px-2 py-1">
                            {trade.venue}
                          </span>
                        </div>

                        {/* Signature Status */}
                        {trade.hasSignatureData && (
                          <div className="flex items-center gap-2 text-[var(--accent)]">
                            <Shield className="w-4 h-4" />
                            <span className="text-xs font-bold">SIGNED</span>
                          </div>
                        )}
                      </div>

                      {/* Expand Icon */}
                      <div>
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
                    <div className="border-t border-[var(--border)] p-6 bg-[var(--bg-elevated)]">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column - Trade Details */}
                        <div className="space-y-4">
                          <h4 className="font-display text-sm mb-3">
                            TRADE DETAILS
                          </h4>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="border border-[var(--border)] p-3">
                              <p className="data-label mb-1">QUANTITY</p>
                              <p className="font-mono">{trade.qty}</p>
                            </div>

                            <div className="border border-[var(--border)] p-3">
                              <p className="data-label mb-1">AGENT</p>
                              <p className="text-sm">{trade.agentName}</p>
                            </div>

                            <div className="border border-[var(--border)] p-3">
                              <p className="data-label mb-1">STOP LOSS</p>
                              <p className="font-mono">
                                {trade.stopLoss || "N/A"}
                              </p>
                            </div>

                            <div className="border border-[var(--border)] p-3">
                              <p className="data-label mb-1">TAKE PROFIT</p>
                              <p className="font-mono">
                                {trade.takeProfit || "N/A"}
                              </p>
                            </div>

                            <div className="border border-[var(--border)] p-3 col-span-2">
                              <p className="data-label mb-1">OPENED AT</p>
                              <p className="text-sm">{formatDate(trade.openedAt)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Right Column - Signature Data */}
                        {trade.signatureData && (
                          <div className="space-y-4">
                            <h4 className="font-display text-sm mb-3">
                              EIGENAI SIGNATURE
                            </h4>

                            <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 space-y-3">
                              {/* Signal Message */}
                              <div>
                                <p className="data-label mb-2">
                                  ORIGINAL SIGNAL
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] italic">
                                  "{trade.signatureData.messageText.substring(0, 150)}
                                  {trade.signatureData.messageText.length > 150
                                    ? "..."
                                    : ""}
                                  "
                                </p>
                              </div>

                              {/* Telegram User */}
                              <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Alpha Trader
                                </span>
                                <span className="text-xs font-mono">
                                  @{trade.signatureData.telegramUsername}
                                </span>
                              </div>

                              {/* Model Used */}
                              <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Model
                                </span>
                                <span className="text-xs font-mono">
                                  {trade.signatureData.llmModelUsed}
                                </span>
                              </div>

                              {/* Chain ID */}
                              <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Chain ID
                                </span>
                                <span className="text-xs font-mono">
                                  {trade.signatureData.llmChainId}
                                </span>
                              </div>

                              {/* Confidence Score */}
                              <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Confidence
                                </span>
                                <span className="text-xs font-bold text-[var(--accent)]">
                                  {(
                                    trade.signatureData.confidenceScore * 100
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
                                  {formatAddress(trade.signatureData.llmSignature)}
                                </p>
                              </div>

                              {/* Verify Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVerifySignature(trade);
                                }}
                                className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2 mt-2"
                              >
                                <Shield className="w-4 h-4" />
                                VERIFY SIGNATURE
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Verification Modal */}
      {verificationModalOpen && selectedTrade && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="border-b border-[var(--border)] p-6 sticky top-0 bg-[var(--bg-deep)] z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-[var(--accent)]" />
                  <div>
                    <h2 className="font-display text-xl">
                      SIGNATURE VERIFICATION
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      {selectedTrade.tokenSymbol} {selectedTrade.side} Trade
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setVerificationModalOpen(false)}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {verifying ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-12 h-12 animate-spin text-[var(--accent)] mb-4" />
                  <p className="text-[var(--text-muted)]">
                    Verifying signature with EigenAI...
                  </p>
                </div>
              ) : verificationResult ? (
                <>
                  {/* Verification Result */}
                  <div
                    className={`border p-6 ${
                      verificationResult.isValid
                        ? "border-green-500/50 bg-green-500/10"
                        : "border-red-500/50 bg-red-500/10"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {verificationResult.isValid ? (
                        <CheckCircle className="w-8 h-8 text-green-400" />
                      ) : (
                        <AlertCircle className="w-8 h-8 text-red-400" />
                      )}
                      <div>
                        <h3 className="font-display text-lg">
                          {verificationResult.isValid
                            ? "✅ SIGNATURE VERIFIED"
                            : "❌ VERIFICATION FAILED"}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {verificationResult.message}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Backend Traces */}
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
                    <div className="border-b border-[var(--border)] p-4">
                      <h4 className="font-display text-sm">BACKEND TRACES</h4>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Step 1: Input Data */}
                      <div className="border border-[var(--border)] p-4">
                        <p className="data-label mb-3">STEP 1: INPUT DATA</p>
                        <div className="space-y-2 text-xs font-mono">
                          <div>
                            <span className="text-[var(--text-muted)]">
                              Chain ID:
                            </span>{" "}
                            {verificationResult.details.chainId}
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">
                              Model:
                            </span>{" "}
                            {verificationResult.details.model}
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">
                              Message Length:
                            </span>{" "}
                            {verificationResult.details.messageLength} characters
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Prompt Reconstruction */}
                      <div className="border border-[var(--border)] p-4">
                        <p className="data-label mb-3">
                          STEP 2: PROMPT RECONSTRUCTION
                        </p>
                        <div className="bg-[var(--bg-elevated)] p-3 text-xs break-all">
                          <p className="text-[var(--text-muted)] mb-2">
                            Original Message:
                          </p>
                          <p className="text-[var(--text-secondary)] italic">
                            "{selectedTrade.signatureData?.messageText}"
                          </p>
                        </div>
                      </div>

                      {/* Step 3: Message Construction */}
                      <div className="border border-[var(--border)] p-4">
                        <p className="data-label mb-3">
                          STEP 3: MESSAGE CONSTRUCTION
                        </p>
                        <div className="text-xs font-mono">
                          <p className="text-[var(--text-muted)]">
                            Format: chainId + modelId + prompt + output
                          </p>
                          <p className="text-[var(--accent)] mt-2">
                            ✅ Message constructed: {verificationResult.details.messageLength} characters
                          </p>
                        </div>
                      </div>

                      {/* Step 4: Signature Verification */}
                      <div className="border border-[var(--border)] p-4">
                        <p className="data-label mb-3">
                          STEP 4: SIGNATURE VERIFICATION
                        </p>
                        <div className="space-y-3 text-xs">
                          <div>
                            <p className="text-[var(--text-muted)] mb-1">
                              Expected Signer (EigenLabs):
                            </p>
                            <p className="font-mono bg-[var(--bg-elevated)] p-2 break-all">
                              {verificationResult.expectedAddress}
                            </p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)] mb-1">
                              Recovered Signer:
                            </p>
                            <p
                              className={`font-mono bg-[var(--bg-elevated)] p-2 break-all ${
                                verificationResult.isValid
                                  ? "text-green-400"
                                  : "text-red-400"
                              }`}
                            >
                              {verificationResult.recoveredAddress}
                            </p>
                          </div>
                          <div
                            className={`flex items-center gap-2 ${
                              verificationResult.isValid
                                ? "text-green-400"
                                : "text-red-400"
                            }`}
                          >
                            {verificationResult.isValid ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <AlertCircle className="w-4 h-4" />
                            )}
                            <span className="font-bold">
                              {verificationResult.isValid
                                ? "ADDRESSES MATCH ✓"
                                : "ADDRESSES DO NOT MATCH ✗"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Step 5: LLM Raw Output */}
                      <div className="border border-[var(--border)] p-4">
                        <p className="data-label mb-3">STEP 5: LLM RAW OUTPUT</p>
                        <div className="bg-[var(--bg-elevated)] p-3 text-xs font-mono max-h-48 overflow-y-auto break-all">
                          {selectedTrade.signatureData?.llmRawOutput}
                        </div>
                      </div>

                      {/* Reasoning */}
                      {selectedTrade.signatureData?.llmReasoning && (
                        <div className="border border-[var(--border)] p-4">
                          <p className="data-label mb-3">LLM REASONING</p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {selectedTrade.signatureData.llmReasoning}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Documentation Link */}
                  <a
                    href="https://docs.eigencloud.xyz/eigenai/howto/verify-signature"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-3 border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    VIEW EIGENAI DOCUMENTATION
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
