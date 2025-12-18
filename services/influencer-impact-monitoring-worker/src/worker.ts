/**
 * Thin Impact Factor Worker (24-Hour Cycle)
 *
 * Responsibility of this service:
 * - Run on an interval (e.g. every 24 hours)
 * - Call the Next.js API route that owns DB + CoinGecko logic
 *
 * It MUST NOT have direct access to DATABASE_URL or COINGECKO_API_KEY.
 */

import dotenv from "dotenv";
import express from "express";

dotenv.config();

const PORT = process.env.PORT || 5009;
const INTERVAL = parseInt(process.env.IMPACT_FACTOR_INTERVAL || "86400000"); // 24 hours default

// URL of the Next.js API route that runs the impact factor logic
// This should be configured via env on the worker host.
const IMPACT_FACTOR_API_URL =
  process.env.IMPACT_FACTOR_API_URL ||
  "http://localhost:5000/api/admin/impact-factor-worker";

let workerInterval: NodeJS.Timeout | null = null;

// Health check server
const app = express();
app.get(
  "/health",
  (req, res) => {
    res.status(200).json({
      status: "ok",
      service: "influencer-impact-monitoring-worker",
      interval: INTERVAL,
      isRunning: workerInterval !== null,
      apiUrl: IMPACT_FACTOR_API_URL,
    });
  }
);

const server = app.listen(PORT, () => {
  console.log(
    `🏥 Impact Factor Worker health check on port ${PORT}, calling API: ${IMPACT_FACTOR_API_URL}`
  );
});

server.on("close", () => {
  console.log("🛑 Impact Factor Worker health check server closed");
});

server.on("error", (error) => {
  console.error("🛑 Impact Factor Worker health check server error:", error);
});

/**
 * Call the Next.js API route once to process impact factors.
 */
async function processImpactFactor() {
  console.log(
    `\n[ImpactFactorWorker] 🔄 Triggering API: ${IMPACT_FACTOR_API_URL}`
  );

  try {
    const res = await fetch(IMPACT_FACTOR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[ImpactFactorWorker] ❌ API failed: ${res.status} ${res.statusText} - ${text}`
      );
      return;
    }

    console.log("[ImpactFactorWorker] ✅ API call succeeded");
  } catch (error: any) {
    console.error(
      "[ImpactFactorWorker] ❌ Error calling API:",
      error.message || error
    );
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Impact Factor Worker (API client) starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60 / 60}h)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Run immediately on startup
  await processImpactFactor();

  // Then run on interval (24 hours by default)
  workerInterval = setInterval(async () => {
    await processImpactFactor();
  }, INTERVAL);
}

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error(
      "[ImpactFactorWorker] ❌ Worker failed to start:",
      error
    );
    process.exit(1);
  });
}

export { processImpactFactor };
