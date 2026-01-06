/**
 * Impact Factor Worker (24-Hour Cycle)
 * 
 * Contains ALL business logic and calculations:
 * - MFE/MAE calculations
 * - TOS scoring
 * - Impact factor computation
 * - Trade state determination
 * 
 * API endpoints handle:
 * - Fetching signals from DB (DATABASE_URL)
 * - Fetching OHLC from CoinGecko (COINGECKO_API_KEY)
 * - Updating DB with results (DATABASE_URL)
 * 
 * Smart contract stores:
 * - Impact factor calculation results (MFE, MAE, impact_factor, pnl)
 * - Data integrity hashes for verification
 */

import dotenv from "dotenv";
import express from "express";
import {
  setupGracefulShutdown,
  registerCleanup,
  createHealthCheckHandler,
} from "@maxxit/common";
// import { updateImpactFactorInContract } from "../../../lib/impact-factor-contract";

dotenv.config();

const PORT = process.env.PORT || 5009;
const INTERVAL = parseInt(process.env.IMPACT_FACTOR_INTERVAL || "86400000"); // 24 hours default

// API base URL (Next.js app on Vercel)
const API_BASE_URL =
  process.env.IMPACT_FACTOR_API_URL ||
  "https://maxxit.ai/api/admin/impact-factor-worker";

// Default values for signals without TP/SL/timeline
const DEFAULT_TAKE_PROFIT_PCT = 10; // 10%
const DEFAULT_STOP_LOSS_PCT = 5; // 5%
const DEFAULT_TIMELINE_DAYS = 7; // 7 days

// Trade states
type TradeState =
  | "OPEN"
  | "CLOSED_TP"
  | "CLOSED_PARTIAL_TP"
  | "CLOSED_SL"
  | "CLOSED_TIME";

let workerInterval: NodeJS.Timeout | null = null;

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("impact-factor-worker", async () => {
    return {
      interval: INTERVAL,
      isRunning: workerInterval !== null,
      apiBaseUrl: API_BASE_URL,
    };
  })
);

const server = app.listen(PORT, () => {
  console.log(`🏥 Impact Factor Worker health check on port ${PORT}`);
});

/**
 * Fetch active signals from API
 */
async function fetchSignals() {
  const response = await fetch(`${API_BASE_URL}/signals`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch signals: ${response.status} - ${errorText}`);
}
  const data = await response.json() as { signals: any[] };
  return data.signals || [];
}

/**
 * Fetch OHLC data from API for a token
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
 * Update signal with calculated results
 * Updates both DB (via API) and smart contract
 */
async function updateSignal(
  signalId: string,
  pnl: number,
  maxFavorableExcursion: number,
  maxAdverseExcursion: number,
  impactFactor?: number,
  impactFactorFlag?: boolean
) {
  // Update DB via API
  const response = await fetch(`${API_BASE_URL}/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      signalId,
      pnl,
      maxFavorableExcursion,
      maxAdverseExcursion,
      impactFactor,
      impactFactorFlag,
    }),
  });

    if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update signal in DB: ${response.status} - ${errorText}`);
  }
  
  // Also update smart contract with impact factor results
  // For closed trades: use provided impactFactor and flag
  // For open trades: use 0 for impactFactor and true for flag (keep monitoring)
  // const contractImpactFactor = impactFactor !== undefined ? impactFactor : 0;
  // const contractImpactFactorFlag = impactFactorFlag !== undefined ? impactFactorFlag : true;
  
  // try {
  //   await updateImpactFactorInContract(
  //     signalId,
  //     pnl,
  //     maxFavorableExcursion,
  //     maxAdverseExcursion,
  //     contractImpactFactor,
  //     contractImpactFactorFlag
  //   );
  // } catch (error: any) {
  //   console.error(`[ImpactFactorWorker] Failed to update contract (non-fatal):`, error.message);
  //   // Continue - DB update succeeded
  // }
}

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
    // For SHORT: favorable if price goes down
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
    // For LONG: adverse if price goes down
    return ((entryPrice - lowestPrice) / entryPrice) * 100;
  } else {
    // For SHORT: adverse if price goes up
    return ((highestPrice - entryPrice) / entryPrice) * 100;
  }
}

/**
 * Get MFE bonus based on standardized table
 */
function getMFEBonus(mfePct: number): number {
  if (mfePct >= 15) return 0.5; // ≥ +15%
  if (mfePct >= 8) return 0.3; // 8-15%
  if (mfePct >= 4) return 0.1; // 4-8%
  return 0; // <4%
}

/**
 * Get MAE penalty based on standardized table
 */
function getMAEPenalty(maePct: number): number {
  if (maePct > 6) return 0.5; // >6%
  if (maePct >= 4) return 0.3; // 4-6%
  if (maePct >= 2) return 0.1; // 2-4%
  return 0; // <2%
}

/**
 * Get Trade Outcome Score (TOS) based on final state and P&L
 */
function getTOS(pnlPct: number, state: TradeState, tpPct: number): number {
  if (state === "CLOSED_TP") return 1.0;
  if (state === "CLOSED_SL") return -1.0;

  // Partial TP (≥ +6% but didn't hit full TP)
  if (state === "CLOSED_PARTIAL_TP" || (pnlPct >= 6 && pnlPct < tpPct)) {
    return 0.5;
  }

  // Time-stopped trades
  if (state === "CLOSED_TIME") {
    if (pnlPct >= -3 && pnlPct <= 3) return 0; // Breakeven
    if (pnlPct < -3 && pnlPct >= -5) return -0.5; // Time stop loss
  }

  return 0;
}

/**
 * Determine trade state based on high/low prices vs TP/SL and time
 * - Checks TP/SL over ENTIRE trade duration (path-dependent via high/low)
 * - Then checks timeline expiry (7 days by default)
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

  // PRIORITY 1: Check if TP/SL hit during ENTIRE period
  if (isLong) {
    if (high >= tpPrice) return "CLOSED_TP";
    if (low <= slPrice) return "CLOSED_SL";
  } else {
    if (low <= tpPrice) return "CLOSED_TP";
    if (high >= slPrice) return "CLOSED_SL";
  }

  // PRIORITY 2: If neither TP/SL hit, check if timeline expired
  if (isExpired) {
    const finalPnl = isLong
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

    // Check if current price at expiry itself satisfies TP
    if (isLong) {
      if (currentPrice >= tpPrice) return "CLOSED_TP";
    } else {
      if (currentPrice <= tpPrice) return "CLOSED_TP";
    }

    // Partial TP at expiry
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
  console.log("  📊 IMPACT FACTOR WORKER (24-Hour Cycle)");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Fetch signals from API (DB access via API)
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

        // Fetch OHLC data from API (CoinGecko access via API)
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

        const prevMaxMFE = signal.max_favorable_excursion
          ? parseFloat(signal.max_favorable_excursion.toString())
          : 0;
        const prevMaxMAE = signal.max_adverse_excursion
          ? parseFloat(signal.max_adverse_excursion.toString())
          : 0;

        const lifetimeMFE = Math.max(mfe, prevMaxMFE);
        const lifetimeMAE = Math.max(mae, prevMaxMAE);

        console.log(
          `[Signal ${signal.id}] Current MFE: ${mfe.toFixed(
            2
          )}% | Lifetime MFE: ${lifetimeMFE.toFixed(2)}%`
        );
        console.log(
          `[Signal ${signal.id}] Current MAE: ${mae.toFixed(
            2
          )}% | Lifetime MAE: ${lifetimeMAE.toFixed(2)}%`
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
          `[Signal ${signal.id}] MFE: ${mfe.toFixed(2)}% | MAE: ${mae.toFixed(
            2
          )}% | P&L: ${pnlPct.toFixed(2)}% | State: ${state}`
        );

        // Calculate impact factor if trade is closed (ALL LOGIC IN WORKER)
        if (state !== "OPEN") {
          const tos = getTOS(pnlPct, state, tpPct);
          const mfeBonus = getMFEBonus(lifetimeMFE);
          const maePenalty = getMAEPenalty(lifetimeMAE);
          const impactFactor = tos + mfeBonus - maePenalty;

          console.log(
            `[Signal ${signal.id}] ✅ CLOSED | TOS: ${tos.toFixed(
              2
            )} | MFE Bonus: ${mfeBonus.toFixed(
              2
            )} | MAE Penalty: ${maePenalty.toFixed(
              2
            )} | Impact Factor: ${impactFactor.toFixed(2)}`
          );

          // Update via API (DB access via API)
          await updateSignal(
            signal.id,
            pnlPct,
            lifetimeMFE,
            lifetimeMAE,
            impactFactor,
            true // impact_factor_flag = true (stop monitoring)
          );

          totalClosed++;
        } else {
          // Update via API (DB access via API) - keep monitoring
          await updateSignal(
            signal.id,
            pnlPct,
            lifetimeMFE,
            lifetimeMAE,
            undefined, // impact_factor not calculated yet for open trades
            undefined // keep monitoring flag unchanged
          );

          console.log(
            `[Signal ${signal.id}] ⏳ Still OPEN, continuing to monitor...`
          );
        }

        totalProcessed++;

        // Rate limiting delay (CoinGecko free tier)
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
 * Update user-level impact factors by averaging all their completed signals
 * Called after processImpactFactor to aggregate per-signal results
 */
async function updateUserImpactFactors() {
  try {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("👥 UPDATING USER IMPACT FACTORS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const response = await fetch(`${API_BASE_URL}/users/update-impact-factors`, {
      method: "POST",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update user impact factors: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { 
      usersUpdated: number; 
      errors: number;
      users: Array<{ id: string; username: string; impact_factor: number; signal_count: number }>;
    };

    console.log(`✅ Updated ${result.usersUpdated} users`);
    if (result.errors > 0) {
      console.log(`⚠️  Errors: ${result.errors}`);
    }

    // Log top performers
    if (result.users && result.users.length > 0) {
      console.log("\n📊 Top Performers:");
      const topUsers = result.users
        .sort((a, b) => b.impact_factor - a.impact_factor)
        .slice(0, 5);
      
      topUsers.forEach((user, idx) => {
        console.log(
          `  ${idx + 1}. ${user.username || "Unknown"}: ${user.impact_factor.toFixed(4)} ` +
          `(${user.signal_count} signals)`
        );
      });
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error: any) {
    console.error("[UpdateUserImpactFactors] ❌ Error:", error.message);
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Impact Factor Worker starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60 / 60}h)`);
  console.log(`🌐 API Base URL: ${API_BASE_URL}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Run immediately on startup
  await processImpactFactor();
  await updateUserImpactFactors(); // Aggregate user-level impact factors

  // Then run on interval (24 hours)
  workerInterval = setInterval(async () => {
    await processImpactFactor();
    await updateUserImpactFactors(); // Aggregate user-level impact factors
  }, INTERVAL);
}

// Register cleanup
registerCleanup(async () => {
  console.log("🛑 Stopping Impact Factor Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown("Impact Factor Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[ImpactFactorWorker] ❌ Worker failed to start:", error);
    process.exit(1);
  });
}

export { processImpactFactor };
