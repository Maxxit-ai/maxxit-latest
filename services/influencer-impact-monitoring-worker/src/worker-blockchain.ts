/**
 * Impact Factor Worker - Blockchain Version (24-Hour Cycle)
 * 
 * Same logic as worker.ts but uses Solidity smart contract on Arbitrum L2
 * instead of MongoDB/PostgreSQL database.
 * 
 * Contains ALL business logic and calculations:
 * - MFE/MAE calculations
 * - TOS scoring
 * - Impact factor computation
 * - Trade state determination
 * 
 * Uses smart contract for:
 * - Fetching signals (instead of DB API)
 * - Updating signal data (instead of DB API)
 * 
 * Still uses API for:
 * - Fetching OHLC from CoinGecko (COINGECKO_API_KEY)
 */

import dotenv from "dotenv";
import express from "express";
import { ethers } from "ethers";
import {
  setupGracefulShutdown,
  registerCleanup,
  createHealthCheckHandler,
} from "@maxxit/common";

dotenv.config();

const PORT = process.env.PORT || 5010;
const INTERVAL = parseInt(process.env.IMPACT_FACTOR_INTERVAL || "86400000"); // 24 hours default

// Smart contract configuration
const CONTRACT_ADDRESS = process.env.IMPACT_FACTOR_CONTRACT_ADDRESS || "0x690911de7cb5BDA427b363437caa930dB6aB7773";
const ARBITRUM_RPC_URL = process.env.ARBITRUM_RPC_URL || process.env.ARBITRUM_RPC;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.EXECUTOR_PRIVATE_KEY || "";

// API base URL for OHLC data (still using API for CoinGecko)
const API_BASE_URL =
  process.env.IMPACT_FACTOR_API_URL ||
  "http://localhost:5000/api/admin/impact-factor-worker";

// Default values for signals without TP/SL/timeline
const DEFAULT_TAKE_PROFIT_PCT = 10; // 10%
const DEFAULT_STOP_LOSS_PCT = 5; // 5%
const DEFAULT_TIMELINE_DAYS = 7; // 7 days

// Scaling factors for blockchain (use 1e4 for percentages, 1e18 for prices)
const SCALE_PERCENTAGE = 10000; // 4 decimal places
const SCALE_PRICE = ethers.parseEther("1"); // 18 decimal places

// Trade states
type TradeState =
  | "OPEN"
  | "CLOSED_TP"
  | "CLOSED_PARTIAL_TP"
  | "CLOSED_SL"
  | "CLOSED_TIME";

let workerInterval: NodeJS.Timeout | null = null;

// Initialize provider and contract
let provider: ethers.Provider;
let signer: ethers.Wallet;
let contract: ethers.Contract;

// ABI for ImpactFactorStorage contract
const CONTRACT_ABI = [
  "function getActiveSignals(uint256 limit, uint256 offset) view returns (string[])",
  "function getSignal(string memory signalIdStr) view returns (string id, string[] extractedTokens, uint256 tokenPrice, string signalType, int256 pnl, uint256 messageCreatedAt, uint256 takeProfit, uint256 stopLoss, string timelineWindow, int256 maxFavorableExcursion, int256 maxAdverseExcursion, int256 impactFactor, bool impactFactorFlag, bool isSignalCandidate)",
  "function updateSignal(string memory signalIdStr, int256 pnl, int256 maxFavorableExcursion, int256 maxAdverseExcursion, int256 impactFactor, bool impactFactorFlag)",
];

/**
 * Initialize blockchain connection
 */
async function initializeBlockchain() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("IMPACT_FACTOR_CONTRACT_ADDRESS environment variable is required");
  }
  
  if (!PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY or EXECUTOR_PRIVATE_KEY environment variable is required");
  }

  provider = new ethers.JsonRpcProvider(ARBITRUM_RPC_URL);
  signer = new ethers.Wallet(PRIVATE_KEY, provider);
  contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  console.log(`🔗 Connected to Arbitrum`);
  console.log(`📝 Contract: ${CONTRACT_ADDRESS}`);
  console.log(`👤 Signer: ${signer.address}`);
}


/**
 * Convert scaled percentage from blockchain to number
 */
function scaleFromPercentage(scaled: bigint): number {
  return Number(scaled) / SCALE_PERCENTAGE;
}

/**
 * Convert percentage to scaled int256 for blockchain
 */
function scaleToPercentage(value: number): bigint {
  return BigInt(Math.round(value * SCALE_PERCENTAGE));
}

/**
 * Convert scaled price from blockchain to number
 */
function scaleFromPrice(scaled: bigint): number {
  return Number(ethers.formatEther(scaled));
}

/**
 * Convert price to scaled uint256 for blockchain
 */
function scaleToPrice(value: number): bigint {
  return ethers.parseEther(value.toString());
}

/**
 * Fetch active signals from API (NeonDB is source of truth for signal data)
 * Contract only stores hashes and calculation results, NOT signal details
 */
async function fetchSignals(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/signals`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch signals: ${response.status} - ${errorText}`);
  }
  const data = await response.json() as { signals: any[] };
  return data.signals || [];
}

/**
 * Fetch OHLC data from API for a token (still using API for CoinGecko)
 */
async function fetchOHLCData(
  tokenSymbol: string,
  signalDate: string
): Promise<{ high: number; low: number; currentPrice: number } | null> {
  const params = new URLSearchParams({
    tokenSymbol,
    signalDate,
  });

  const response = await fetch(`${API_BASE_URL}/ohlc?${params}`);
  if (!response.ok) {
    if (response.status === 404) {
      return null; // Token not found
    }
    const errorText = await response.text();
    throw new Error(`Failed to fetch OHLC: ${response.status} - ${errorText}`);
  }
  const data = await response.json() as { high: number; low: number; currentPrice: number };
  return {
    high: data.high,
    low: data.low,
    currentPrice: data.currentPrice,
  };
}

/**
 * Update signal in smart contract
 */
async function updateSignal(
  signalId: string,
  pnl: number,
  maxFavorableExcursion: number,
  maxAdverseExcursion: number,
  impactFactor?: number,
  impactFactorFlag?: boolean
) {
  const pnlScaled = scaleToPercentage(pnl);
  const mfeScaled = scaleToPercentage(maxFavorableExcursion);
  const maeScaled = scaleToPercentage(maxAdverseExcursion);
  const impactFactorScaled = impactFactor !== undefined ? scaleToPercentage(impactFactor) : BigInt(0);
  const flag = impactFactorFlag !== undefined ? impactFactorFlag : true;

  const tx = await contract.updateSignal(
    signalId,
    pnlScaled,
    mfeScaled,
    maeScaled,
    impactFactorScaled,
    flag
  );
  
  console.log(`📝 Transaction submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
}

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("impact-factor-worker-blockchain", async () => {
    return {
      interval: INTERVAL,
      isRunning: workerInterval !== null,
      contractAddress: CONTRACT_ADDRESS,
      network: "Arbitrum",
    };
  })
);

const server = app.listen(PORT, () => {
  console.log(`🏥 Impact Factor Worker (Blockchain) health check on port ${PORT}`);
});

/**
 * Calculate MFE (Maximum Favorable Excursion) as percentage
 */
function calculateMFE(
  entryPrice: number,
  highestPrice: number,
  lowestPrice: number,
  isLong: boolean
): number {
  if (isLong) {
    return ((highestPrice - entryPrice) / entryPrice) * 100;
  } else {
    return ((entryPrice - lowestPrice) / entryPrice) * 100;
  }
}

/**
 * Calculate MAE (Maximum Adverse Excursion) as percentage
 */
function calculateMAE(
  entryPrice: number,
  lowestPrice: number,
  highestPrice: number,
  isLong: boolean
): number {
  if (isLong) {
    return ((entryPrice - lowestPrice) / entryPrice) * 100;
  } else {
    return ((highestPrice - entryPrice) / entryPrice) * 100;
  }
}

/**
 * Get MFE bonus based on standardized table
 */
function getMFEBonus(mfePct: number): number {
  if (mfePct >= 15) return 0.5;
  if (mfePct >= 8) return 0.3;
  if (mfePct >= 4) return 0.1;
  return 0;
}

/**
 * Get MAE penalty based on standardized table
 */
function getMAEPenalty(maePct: number): number {
  if (maePct > 6) return 0.5;
  if (maePct >= 4) return 0.3;
  if (maePct >= 2) return 0.1;
  return 0;
}

/**
 * Get Trade Outcome Score (TOS) based on final state and P&L
 */
function getTOS(pnlPct: number, state: TradeState, tpPct: number): number {
  if (state === "CLOSED_TP") return 1.0;
  if (state === "CLOSED_SL") return -1.0;

  if (state === "CLOSED_PARTIAL_TP" || (pnlPct >= 6 && pnlPct < tpPct)) {
    return 0.5;
  }

  if (state === "CLOSED_TIME") {
    if (pnlPct >= -3 && pnlPct <= 3) return 0;
    if (pnlPct < -3 && pnlPct >= -5) return -0.5;
  }

  return 0;
}

/**
 * Determine trade state based on high/low prices vs TP/SL and time
 */
function determineTradeState(
  high: number,
  low: number,
  currentPrice: number,
  entryPrice: number,
  tpPct: number,
  slPct: number,
  messageDate: Date,
  timelineDays: number,
  isLong: boolean
): TradeState {
  const now = new Date();
  const expiryDate = new Date(messageDate);
  expiryDate.setDate(expiryDate.getDate() + timelineDays);

  const tpPrice = isLong
    ? entryPrice * (1 + tpPct / 100)
    : entryPrice * (1 - tpPct / 100);

  const slPrice = isLong
    ? entryPrice * (1 - slPct / 100)
    : entryPrice * (1 + slPct / 100);

  const isExpired = now >= expiryDate;

  if (isLong) {
    if (high >= tpPrice) return "CLOSED_TP";
    if (low <= slPrice) return "CLOSED_SL";
  } else {
    if (low <= tpPrice) return "CLOSED_TP";
    if (high >= slPrice) return "CLOSED_SL";
  }

  if (isExpired) {
    const finalPnl = isLong
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

    if (isLong) {
      if (currentPrice >= tpPrice) return "CLOSED_TP";
    } else {
      if (currentPrice <= tpPrice) return "CLOSED_TP";
    }

    if (finalPnl >= 6 && finalPnl < tpPct) {
      return "CLOSED_PARTIAL_TP";
    }

    return "CLOSED_TIME";
  }

  return "OPEN";
}

/**
 * Parse timeline_window to number of days
 */
function parseTimelineDays(timelineWindow: string | null): number {
  if (!timelineWindow) return DEFAULT_TIMELINE_DAYS;

  const daysMatch = timelineWindow.match(/(\d+)\s*day/i);
  if (daysMatch) return parseInt(daysMatch[1], 10);

  const date = new Date(timelineWindow);
  if (!isNaN(date.getTime())) {
    const now = new Date();
    const diffDays = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(1, diffDays);
  }

  return DEFAULT_TIMELINE_DAYS;
}

/**
 * Main processing function - contains ALL calculation logic
 */
async function processImpactFactor() {
  console.log(
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );
  console.log("  📊 IMPACT FACTOR WORKER (Blockchain) - 24-Hour Cycle");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Fetch signals from smart contract
    const signals = await fetchSignals();

    if (signals.length === 0) {
      console.log("✅ No active signals to monitor\n");
      return;
    }

    console.log(`📋 Found ${signals.length} active signal(s) to evaluate\n`);

    let totalProcessed = 0;
    let totalClosed = 0;
    let totalErrors = 0;

    for (const signal of signals) {
      try {
        if (!signal.extracted_tokens?.length || !signal.token_price) {
          continue;
        }

        const primaryToken = signal.extracted_tokens[0].toUpperCase();
        const entryPrice = signal.token_price;
        const isLong = signal.signal_type !== "SHORT";

        const tpPct =
          signal.take_profit && signal.take_profit > 0
            ? signal.take_profit
            : DEFAULT_TAKE_PROFIT_PCT;
        const slPct =
          signal.stop_loss && signal.stop_loss > 0
            ? signal.stop_loss
            : DEFAULT_STOP_LOSS_PCT;
        const timelineDays = parseTimelineDays(signal.timeline_window);

        console.log(
          `[Signal ${signal.id}] ${primaryToken} | Entry: $${entryPrice} | TP: ${tpPct}% | SL: ${slPct}% | Timeline: ${timelineDays}d`
        );

        // Fetch OHLC data from API (still using API for CoinGecko)
        const messageDate = new Date(signal.message_created_at);
        const ohlcData = await fetchOHLCData(
          primaryToken,
          messageDate.toISOString()
        );

        if (!ohlcData) {
          console.log(
            `[Signal ${signal.id}] ⚠️ Could not fetch OHLC data, skipping`
          );
          totalErrors++;
          continue;
        }

        const { high, low, currentPrice } = ohlcData;

        // Calculate MFE and MAE (ALL CALCULATIONS IN WORKER)
        const mfe = calculateMFE(entryPrice, high, low, isLong);
        const mae = calculateMAE(entryPrice, low, high, isLong);

        const prevMaxMFE = signal.max_favorable_excursion || 0;
        const prevMaxMAE = signal.max_adverse_excursion || 0;

        const lifetimeMFE = Math.max(mfe, prevMaxMFE);
        const lifetimeMAE = Math.max(mae, prevMaxMAE);

        console.log(
          `[Signal ${signal.id}] Current MFE: ${mfe.toFixed(2)}% | Lifetime MFE: ${lifetimeMFE.toFixed(2)}%`
        );
        console.log(
          `[Signal ${signal.id}] Current MAE: ${mae.toFixed(2)}% | Lifetime MAE: ${lifetimeMAE.toFixed(2)}%`
        );

        // Determine trade state (ALL LOGIC IN WORKER)
        const state = determineTradeState(
          high,
          low,
          currentPrice,
          entryPrice,
          tpPct,
          slPct,
          messageDate,
          timelineDays,
          isLong
        );

        // Calculate P&L (ALL LOGIC IN WORKER)
        let pnlPct: number;
        if (state === "CLOSED_TP") {
          pnlPct = tpPct;
        } else if (state === "CLOSED_SL") {
          pnlPct = -slPct;
        } else if (state === "CLOSED_PARTIAL_TP") {
          pnlPct = isLong
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - currentPrice) / entryPrice) * 100;
        } else {
          pnlPct = isLong
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - currentPrice) / entryPrice) * 100;
        }

        console.log(
          `[Signal ${signal.id}] MFE: ${mfe.toFixed(2)}% | MAE: ${mae.toFixed(2)}% | P&L: ${pnlPct.toFixed(2)}% | State: ${state}`
        );

        // Calculate impact factor if trade is closed (ALL LOGIC IN WORKER)
        if (state !== "OPEN") {
          const tos = getTOS(pnlPct, state, tpPct);
          const mfeBonus = getMFEBonus(lifetimeMFE);
          const maePenalty = getMAEPenalty(lifetimeMAE);
          const impactFactor = tos + mfeBonus - maePenalty;

          console.log(
            `[Signal ${signal.id}] ✅ CLOSED | TOS: ${tos.toFixed(2)} | MFE Bonus: ${mfeBonus.toFixed(2)} | MAE Penalty: ${maePenalty.toFixed(2)} | Impact Factor: ${impactFactor.toFixed(2)}`
          );

          // Update via smart contract (blockchain storage)
          await updateSignal(
            signal.id,
            pnlPct,
            lifetimeMFE,
            lifetimeMAE,
            impactFactor,
            false // impact_factor_flag = false (stop monitoring)
          );

          totalClosed++;
        } else {
          // Update via smart contract (blockchain storage) - keep monitoring
          await updateSignal(
            signal.id,
            pnlPct,
            lifetimeMFE,
            lifetimeMAE
            // No impact_factor or flag update for open trades
          );

          console.log(
            `[Signal ${signal.id}] ⏳ Still OPEN, continuing to monitor...`
          );
        }

        totalProcessed++;

        // Rate limiting delay (CoinGecko free tier + blockchain transactions)
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (error: any) {
        totalErrors++;
        console.error(`[Signal ${signal.id}] ❌ Error:`, error.message);
      }
    }

    console.log(
      "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log("📊 PROCESSING SUMMARY");
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log(`  Signals Evaluated: ${totalProcessed}`);
    console.log(`  Trades Closed: ${totalClosed}`);
    console.log(`  Still Open: ${totalProcessed - totalClosed}`);
    console.log(`  Errors: ${totalErrors}`);
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    );
  } catch (error: any) {
    console.error("[ImpactFactorWorker] ❌ Fatal error:", error.message);
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Impact Factor Worker (Blockchain) starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60 / 60}h)`);
  console.log(`🔗 Network: Arbitrum L2`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    await initializeBlockchain();

    // Run immediately on startup
    await processImpactFactor();

    // Then run on interval (24 hours)
    workerInterval = setInterval(async () => {
      await processImpactFactor();
    }, INTERVAL);
  } catch (error: any) {
    console.error("[ImpactFactorWorker] ❌ Failed to initialize:", error);
    process.exit(1);
  }
}

// Register cleanup
registerCleanup(async () => {
  console.log("🛑 Stopping Impact Factor Worker (Blockchain) interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown("Impact Factor Worker (Blockchain)", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[ImpactFactorWorker] ❌ Worker failed to start:", error);
    process.exit(1);
  });
}

export { processImpactFactor };
