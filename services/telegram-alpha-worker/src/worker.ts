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
let isCycleRunning = false;
// Health check server
const app = express();
app.get("/health", createHealthCheckHandler("telegram-alpha-worker", async () => {
  const dbHealthy = await checkDatabaseHealth();
  return {
    database: dbHealthy ? "connected" : "disconnected",
    interval: INTERVAL,
    isRunning: workerInterval !== null,
    isCycleRunning,
  };
}));

const server = app.listen(PORT, () => {
  console.log(`🏥 Telegram Alpha Worker health check on port ${PORT}`);
});

/**
 * Process and classify Telegram alpha messages
 */
async function processTelegramAlphaMessages() {
  if (isCycleRunning) {
    console.log("[TelegramAlpha] ⏭️ Skipping cycle - previous cycle still running");
    return;
  }

  isCycleRunning = true;

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

        // Get user's impact_factor to pass to LLM
        const userImpactFactor = user?.impact_factor ?? 50; // Default to 50 (neutral) if not set

        // Classify message using LLM - returns array of classifications (one per token)
        const classifications = await classifier.classifyTweet(
          message.message_text,
          userImpactFactor
        );

        // Process each token classification separately
        let tokenSignalsCreated = 0;
        
        for (const classification of classifications) {
          // Skip non-signals
          if (!classification.isSignalCandidate || classification.extractedTokens.length === 0) {
            console.log(`[${username}] ℹ️  Not a signal (or no tokens extracted)`);
            continue;
          }

          const token = classification.extractedTokens[0]; // Only one token per classification now

          // Create NEW record for this specific token
          await prisma.telegram_posts.create({
            data: {
              // Link to original user
              alpha_user_id: message.alpha_user_id,
              source_id: message.source_id,

              // Make message_id unique per token
              message_id: `${message.message_id}_${token}`,

              // Original message metadata
              message_text: message.message_text,
              message_created_at: message.message_created_at,
              sender_id: message.sender_id,
              sender_username: message.sender_username,

              // Token-specific classification
              is_signal_candidate: classification.isSignalCandidate,
              extracted_tokens: [token],
              confidence_score: classification.confidence,
              signal_type:
                classification.sentiment === "bullish"
                  ? "LONG"
                  : classification.sentiment === "bearish"
                  ? "SHORT"
                  : null,
              token_price:
                typeof classification.tokenPrice === "number"
                  ? classification.tokenPrice
                  : null,
              timeline_window: classification.timelineWindow || null,
              take_profit: classification.takeProfit ?? 0,
              stop_loss: classification.stopLoss ?? 0,

              // EigenAI verification data
              llm_signature: classification.signature,
              llm_raw_output: classification.rawOutput,
              llm_model_used: classification.model,
              llm_chain_id: classification.chainId,
              llm_reasoning: classification.reasoning,
              llm_market_context: classification.marketContext,
              llm_full_prompt: classification.fullPrompt,
            },
          });

          tokenSignalsCreated++;
          totalSignals++;
          
          console.log(
            `[${username}] ✅ Signal for ${token}: ${classification.sentiment} (confidence: ${(
              classification.confidence * 100
            ).toFixed(0)}%)`
          );
        }

        // Delete original webhook message after creating token-specific records
        // This prevents confusing NULL rows - only actual signal records remain
        await prisma.telegram_posts.delete({
          where: { id: message.id },
        });

        totalProcessed++;
        
        if (tokenSignalsCreated === 0) {
          console.log(`[${username}] ℹ️  No actionable signals found in message`);
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
  } finally {
    isCycleRunning = false;
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
