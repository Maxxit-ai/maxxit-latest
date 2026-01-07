/**
 * Telegram Alpha Classification Worker (Event-Driven with BullMQ)
 *
 * Processes telegram message classification jobs from the queue.
 * Supports parallel processing with multiple workers.
 *
 * Flow:
 * 1. Webhook stores message in DB and adds job to queue
 * 2. Worker pool processes jobs in parallel
 * 3. Each job classifies a message using LLM and updates DB
 */

import dotenv from "dotenv";
import express from "express";
import { prisma, checkDatabaseHealth, disconnectPrisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup, createHealthCheckHandler } from "@maxxit/common";
import {
  createWorkerPool,
  createQueue,
  addJob,
  getQueueStats,
  startIntervalTrigger,
  shutdownQueueService,
  isRedisHealthy,
  withLock,
  getMessageClassificationLockKey,
  QueueName,
  TelegramAlphaJobData,
  ClassifyMessageJobData,
  JobResult,
  Job,
} from "@maxxit/queue";
import { createLLMClassifier } from "./lib/llm-classifier";

// Bull Board imports
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

dotenv.config();

const PORT = process.env.PORT || 5006;
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || "3");
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5");
const TRIGGER_INTERVAL = parseInt(process.env.TRIGGER_INTERVAL || "15000"); // 15 seconds

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("telegram-alpha-worker", async () => {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      isRedisHealthy(),
    ]);

    let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    try {
      queueStats = await getQueueStats(QueueName.TELEGRAM_ALPHA_CLASSIFICATION);
    } catch {
      // Queue might not be initialized yet
    }

    return {
      database: dbHealthy ? "connected" : "disconnected",
      redis: redisHealthy ? "connected" : "disconnected",
      workerCount: WORKER_COUNT,
      workerConcurrency: WORKER_CONCURRENCY,
      triggerInterval: TRIGGER_INTERVAL,
      queue: queueStats,
    };
  })
);

const server = app.listen(PORT, () => {
  console.log(`🏥 Telegram Alpha Worker health check on port ${PORT}`);
});

/**
 * Setup Bull Board for queue visualization
 * Access at: http://localhost:PORT/admin/queues
 */
function setupBullBoard() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  // Create queues for Bull Board (they connect to existing Redis queues)
  const telegramAlphaQueue = createQueue(QueueName.TELEGRAM_ALPHA_CLASSIFICATION);
//   const tradeExecutionQueue = createQueue(QueueName.TRADE_EXECUTION);
//   const signalGenerationQueue = createQueue(QueueName.SIGNAL_GENERATION);

  createBullBoard({
    queues: [
      new BullMQAdapter(telegramAlphaQueue),
    //   new BullMQAdapter(tradeExecutionQueue),
    //   new BullMQAdapter(signalGenerationQueue),
    ],
    serverAdapter,
  });

  app.use("/admin/queues", serverAdapter.getRouter());
  console.log(`📊 Bull Board available at http://localhost:${PORT}/admin/queues`);
}

/**
 * Process a single message classification job
 */
async function processClassificationJob(
  job: Job<TelegramAlphaJobData>
): Promise<JobResult> {
  const { data } = job;

  if (data.type !== "CLASSIFY_MESSAGE") {
    return {
      success: false,
      error: `Unknown job type: ${(data as any).type}`,
    };
  }

  const { messageId } = data as ClassifyMessageJobData;
  const lockKey = getMessageClassificationLockKey(messageId);

  // Use distributed lock to prevent duplicate classification
  const result = await withLock(lockKey, async () => {
    return await classifyMessage(messageId);
  });

  if (result === undefined) {
    // Lock could not be acquired, another worker is processing this
    return {
      success: true,
      message: "Job skipped - another worker is processing this message",
    };
  }

  return result;
}

/**
 * Classify a single message using LLM
 * Creates separate records for each token classification (matching worker.ts logic)
 */
async function classifyMessage(messageId: string): Promise<JobResult> {
  try {
    // Fetch the message
    const message = await prisma.telegram_posts.findUnique({
      where: { id: messageId },
      include: {
        telegram_alpha_users: true,
      },
    });

    if (!message) {
      console.log(`[Classifier] ⚠️  Message not found: ${messageId.substring(0, 8)}`);
      return {
        success: false,
        error: "Message not found",
      };
    }

    // Check if already classified
    if (message.is_signal_candidate !== null) {
      console.log(`[Classifier] ⏭️  Message already classified: ${messageId.substring(0, 8)}`);
      return {
        success: true,
        message: "Already classified",
      };
    }

    const user = message.telegram_alpha_users;
    const username = user?.telegram_username || user?.first_name || "Unknown";
    const userImpactFactor = user?.impact_factor ?? 50; // Default to 50 (neutral) if not set

    console.log(`[Classifier] 🔄 Processing: "${message.message_text.substring(0, 50)}..."`);

    // Create classifier
    const classifier = createLLMClassifier();
    if (!classifier) {
      console.log("[Classifier] ⚠️  LLM Classifier not available");
      // Throw to trigger retry - LLM might be temporarily unavailable
      throw new Error("LLM Classifier not available - will retry");
    }

    // Classify message - returns array of classifications (one per token)
    const classifications = await classifier.classifyTweet(
      message.message_text,
      userImpactFactor
    );

    // Process each token classification separately (matching worker.ts logic)
    let tokenSignalsCreated = 0;

    for (const classification of classifications) {
      // Skip non-signals
      if (!classification.isSignalCandidate || classification.extractedTokens.length === 0) {
        console.log(`[Classifier] ℹ️  [${username}] Not a signal (or no tokens extracted)`);
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

      console.log(
        `[Classifier] ✅ [${username}] Signal for ${token}: ${classification.sentiment} (confidence: ${(
          classification.confidence * 100
        ).toFixed(0)}%)`
      );
    }

    // Delete original webhook message after creating token-specific records
    // This prevents confusing NULL rows - only actual signal records remain
    await prisma.telegram_posts.delete({
      where: { id: messageId },
    });

    if (tokenSignalsCreated === 0) {
      console.log(`[Classifier] ℹ️  [${username}] No actionable signals found in message`);
    }

    return {
      success: true,
      message: tokenSignalsCreated > 0 ? `Created ${tokenSignalsCreated} signal(s)` : "No signals found",
      data: {
        signalsCreated: tokenSignalsCreated,
        classificationsProcessed: classifications.length,
      },
    };
  } catch (error: any) {
    console.error(`[Classifier] ❌ Error classifying message ${messageId.substring(0, 8)}:`, error.message);

    // Check if error is retryable
    const isRetryable = isRetryableError(error.message);
    if (isRetryable) {
      throw error; // Re-throw to trigger BullMQ retry
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if an error should trigger a retry
 */
function isRetryableError(errorMessage: string): boolean {
  if (!errorMessage) return false;

  const lowerError = errorMessage.toLowerCase();
  const retryablePatterns = [
    "will retry",
    "not available",
    "timeout",
    "network",
    "connection",
    "econnrefused",
    "econnreset",
    "etimedout",
    "fetch failed",
    "request failed",
    "429", // Rate limit
    "500",
    "502",
    "503",
    "504",
    "internal server error",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
  ];

  return retryablePatterns.some((pattern) => lowerError.includes(pattern));
}

/**
 * Check for unprocessed messages and add them to the queue (fallback trigger)
 */
async function checkAndQueuePendingMessages(): Promise<void> {
  try {
    // Fetch unprocessed messages (fallback for webhook failures or missed messages)
    const unprocessedMessages = await prisma.telegram_posts.findMany({
      where: {
        alpha_user_id: { not: null },
        is_signal_candidate: null, // Not yet classified
        telegram_alpha_users: {
          is_active: true,
        },
      },
      select: { id: true },
      orderBy: {
        message_created_at: "asc",
      },
      take: 50,
    });

    if (unprocessedMessages.length === 0) {
      return;
    }

    console.log(`[Trigger] Found ${unprocessedMessages.length} unprocessed messages`);

    // Add jobs to the queue
    for (const message of unprocessedMessages) {
      await addJob(
        QueueName.TELEGRAM_ALPHA_CLASSIFICATION,
        "classify-message",
        {
          type: "CLASSIFY_MESSAGE" as const,
          messageId: message.id,
          timestamp: Date.now(),
        },
        {
          // Unique job ID prevents duplicates
          jobId: `classify-${message.id}`,
        }
      );
    }

    console.log(`[Trigger] Queued ${unprocessedMessages.length} messages for classification`);
  } catch (error: any) {
    console.error("[Trigger] Error checking pending messages:", error.message);
  }
}

/**
 * Main worker startup
 */
async function runWorker() {
  try {
    console.log("🚀 Telegram Alpha Worker (Event-Driven) starting...");
    console.log(`👷 Worker count: ${WORKER_COUNT}`);
    console.log(`🔄 Concurrency per worker: ${WORKER_CONCURRENCY}`);
    console.log(`⏱️  Trigger interval: ${TRIGGER_INTERVAL}ms`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Test database connection
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error("Database connection failed. Check DATABASE_URL environment variable.");
    }
    console.log("✅ Database connection: OK");

    // Test Redis connection
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      throw new Error("Redis connection failed. Check REDIS_URL environment variable.");
    }
    console.log("✅ Redis connection: OK");

    // Setup Bull Board for queue visualization
    setupBullBoard();

    // Check LLM classifier availability
    const classifier = createLLMClassifier();
    if (classifier) {
      console.log("✅ LLM Classifier: ENABLED");
    } else {
      console.log("⚠️  LLM Classifier: DISABLED (no API key)");
      console.log("   Set EIGENAI_API_KEY or OPENAI_API_KEY to enable");
    }

    // Create worker pool for parallel processing
    createWorkerPool<TelegramAlphaJobData>(
      QueueName.TELEGRAM_ALPHA_CLASSIFICATION,
      processClassificationJob,
      WORKER_COUNT,
      {
        concurrency: WORKER_CONCURRENCY,
        lockDuration: 120000, // 2 minute lock for LLM classification (can be slow)
      }
    );

    // Start interval trigger to check for missed messages
    startIntervalTrigger(TRIGGER_INTERVAL, checkAndQueuePendingMessages, {
      runImmediately: true,
      name: "telegram-alpha-trigger",
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Telegram Alpha Worker started successfully");
    console.log(`📊 Effective parallel capacity: ${WORKER_COUNT * WORKER_CONCURRENCY} concurrent LLM calls`);
  } catch (error: any) {
    console.error("[TelegramAlpha] ❌ Failed to start worker:", error.message);
    console.error("[TelegramAlpha] Stack:", error.stack);
    throw error;
  }
}

// Register cleanup handlers
registerCleanup(async () => {
  console.log("🛑 Stopping Telegram Alpha Worker...");
  await shutdownQueueService();
  await disconnectPrisma();
  console.log("✅ Cleanup complete");
});

// Setup graceful shutdown
setupGracefulShutdown("Telegram Alpha Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[TelegramAlpha] ❌ Worker failed to start:", error);
    console.error("[TelegramAlpha] Stack:", error.stack);
    setTimeout(() => {
      console.error("[TelegramAlpha] Exiting after error...");
      process.exit(1);
    }, 5000);
  });
}

export { processClassificationJob, classifyMessage, checkAndQueuePendingMessages };
