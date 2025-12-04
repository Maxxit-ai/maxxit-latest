/**
 * Telegram Alpha Ingestion Worker (Microservice)
 * Processes Telegram DM messages from alpha users and classifies them
 * Interval: 2 minutes (configurable via WORKER_INTERVAL)
 *
 * Flow:
 * 1. Polls database for unprocessed messages from telegram_alpha_users
 * 2. Classifies messages using LLM
 * 3. Updates telegram_posts with classification results
 * 4. Signal generator picks up classified messages
 */

import dotenv from "dotenv";
import express from "express";
import { prisma, checkDatabaseHealth, disconnectPrisma } from "@maxxit/database";
import {
  setupGracefulShutdown,
  registerCleanup,
  createHealthCheckHandler,
} from "@maxxit/common";
import { createLLMClassifier } from "./lib/llm-classifier";

dotenv.config();

const PORT = process.env.PORT || 5006;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "30000"); // 30 seconds default

let workerInterval: NodeJS.Timeout | null = null;

// Health check server
const app = express();
app.get("/health", createHealthCheckHandler("telegram-alpha-worker", async () => {
  const dbHealthy = await checkDatabaseHealth();
  return {
    database: dbHealthy ? "connected" : "disconnected",
    interval: INTERVAL,
    isRunning: workerInterval !== null,
  };
}));

const server = app.listen(PORT, () => {
  console.log(`🏥 Telegram Alpha Worker health check on port ${PORT}`);
});

/**
 * Process and classify Telegram alpha messages
 */
async function processTelegramAlphaMessages() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📱 TELEGRAM ALPHA INGESTION WORKER");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Get unprocessed messages from telegram alpha users
    // Messages that:
    // 1. Have alpha_user_id (from individual DMs, not channels)
    // 2. Don't have is_signal_candidate set yet (not classified)
    // 3. Are from active alpha users
    const unprocessedMessages = await prisma.telegram_posts.findMany({
      where: {
        alpha_user_id: { not: null },
        is_signal_candidate: null, // Not yet classified
        telegram_alpha_users: {
          is_active: true,
        },
      },
      include: {
        telegram_alpha_users: true,
      },
      orderBy: {
        message_created_at: "asc", // Process oldest first
      },
      take: 50, // Process in batches
    });

    if (unprocessedMessages.length === 0) {
      console.log("✅ No unprocessed messages found\n");
      return;
    }

    console.log(
      `📋 Found ${unprocessedMessages.length} unprocessed message(s) to classify\n`
    );

    const classifier = createLLMClassifier();
    if (!classifier) {
      console.log("⚠️  LLM Classifier not available - skipping classification");
      console.log(
        "   Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY"
      );
      console.log("   Messages will remain NULL until API key is configured\n");
      return; // Don't process without LLM - messages stay NULL
    }

    let totalProcessed = 0;
    let totalSignals = 0;
    let totalErrors = 0;

    // Process each message
    for (const message of unprocessedMessages) {
      try {
        const user = message.telegram_alpha_users;
        const username =
          user?.telegram_username || user?.first_name || "Unknown";

        console.log(
          `[${username}] Processing: "${message.message_text.substring(
            0,
            50
          )}..."`
        );

        // NO PRE-FILTERING - Let LLM decide everything
        // All messages go through LLM classification

        // Classify message using LLM
        const classification = await classifier.classifyTweet(
          message.message_text
        );

        // Update message with classification
        await prisma.telegram_posts.update({
          where: { id: message.id },
          data: {
            is_signal_candidate: classification.isSignalCandidate,
            extracted_tokens: classification.extractedTokens,
            confidence_score: classification.confidence,
            signal_type:
              classification.sentiment === "bullish"
                ? "LONG"
                : classification.sentiment === "bearish"
                ? "SHORT"
                : null,
          },
        });

        totalProcessed++;

        if (classification.isSignalCandidate) {
          totalSignals++;
          console.log(
            `[${username}] ✅ Signal detected: ${classification.extractedTokens.join(
              ", "
            )} - ${classification.sentiment} (confidence: ${(
              classification.confidence * 100
            ).toFixed(0)}%)`
          );
        } else {
          console.log(`[${username}] ℹ️  Not a signal`);
        }
      } catch (error: any) {
        totalErrors++;
        console.error(`[Message ${message.id}] ❌ Error:`, error.message);
        console.error(
          `[Message ${message.id}] ⚠️  Keeping message as NULL for retry`
        );

        // DON'T mark as false - keep as NULL so it can be retried
        // Only mark as false if we're certain it's not a signal (after successful LLM classification)
        // If classification fails, leave it NULL for next worker cycle
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 PROCESSING SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Messages Processed: ${totalProcessed}`);
    console.log(`  Signals Detected: ${totalSignals}`);
    console.log(`  Errors: ${totalErrors}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error: any) {
    console.error("[TelegramAlpha] ❌ Fatal error:", error.message);
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Telegram Alpha Worker starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000}s)`);

  // Check LLM classifier availability
  const classifier = createLLMClassifier();
  if (classifier) {
    console.log("🤖 LLM Classifier: ENABLED");
  } else {
    console.log("⚠️  LLM Classifier: DISABLED (no API key)");
    console.log(
      "   Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY to enable"
    );
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Run immediately on startup
  await processTelegramAlphaMessages();

  // Then run on interval
  workerInterval = setInterval(async () => {
    await processTelegramAlphaMessages();
  }, INTERVAL);
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping Telegram Alpha Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  await disconnectPrisma();
  console.log("✅ Prisma disconnected");
});

// Setup graceful shutdown
setupGracefulShutdown("Telegram Alpha Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[TelegramAlpha] ❌ Worker failed to start:", error);
    process.exit(1);
  });
}

export { processTelegramAlphaMessages };
