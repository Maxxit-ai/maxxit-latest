/**
 * Telegram Notification Worker (BullMQ-powered)
 *
 * This worker has two modes:
 * 1. SCANNER MODE (default): Scans signals and enqueues notification jobs
 * 2. PROCESSOR MODE: Consumes jobs from queue and sends Telegram messages
 *
 * Run modes:
 * - Full (default): Both scanner and processor in one process
 * - Scanner only: WORKER_MODE=scanner (for dedicated signal scanning)
 * - Processor only: WORKER_MODE=processor (for dedicated sending, can scale horizontally)
 *
 * Flow:
 * 1. Scanner fetches signals from last 24h with deployment_id
 * 2. For each signal:
 *    - If already notified → skip
 *    - If llm_should_trade = false → enqueue SIGNAL_NOT_TRADED
 *    - If llm_should_trade = true:
 *      - trade_executed = NULL → wait
 *      - trade_executed = "SUCCESS" → enqueue SIGNAL_EXECUTED
 *      - trade_executed = "FAILED" → enqueue SIGNAL_NOT_TRADED with error
 * 3. Processor picks jobs from queue, sends to Telegram, logs result
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import {
  setupGracefulShutdown,
  registerCleanup,
  NotificationQueue,
  NotificationProducer,
  NotificationWorker,
  TelegramNotificationJob,
} from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";
import { Job } from "bullmq";

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 5010;
const SCAN_INTERVAL = parseInt(process.env.WORKER_INTERVAL || "30000"); // 30 seconds
const BOT_TOKEN = process.env.TELEGRAM_NOTIFICATION_BOT_TOKEN;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const WORKER_MODE = (process.env.WORKER_MODE || "full") as
  | "full"
  | "scanner"
  | "processor";
const PROCESSOR_CONCURRENCY = parseInt(
  process.env.PROCESSOR_CONCURRENCY || "10"
);

if (!BOT_TOKEN) {
  console.error(
    "❌ TELEGRAM_NOTIFICATION_BOT_TOKEN environment variable is required"
  );
  process.exit(1);
}

// ============================================================================
// State
// ============================================================================

let scannerInterval: NodeJS.Timeout | null = null;
let notificationsSent = 0;
let notificationsFailed = 0;
let notificationsEnqueued = 0;
let isScanCycleRunning = false;

// BullMQ instances
let notificationQueue: NotificationQueue | null = null;
let producer: NotificationProducer | null = null;
let worker: NotificationWorker | null = null;

// ============================================================================
// Health check server
// ============================================================================

const app = express();

app.get("/health", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  const redisHealthy = notificationQueue?.isRedisConnected() ?? false;
  const queueStats = notificationQueue
    ? await notificationQueue.getStats()
    : null;

  res.status(dbHealthy && redisHealthy ? 200 : 503).json({
    status: dbHealthy && redisHealthy ? "ok" : "degraded",
    service: "telegram-notification-worker",
    mode: WORKER_MODE,
    scanInterval: SCAN_INTERVAL,
    database: dbHealthy ? "connected" : "disconnected",
    redis: redisHealthy ? "connected" : "disconnected",
    isScanCycleRunning,
    stats: {
      notificationsSent,
      notificationsFailed,
      notificationsEnqueued,
    },
    queue: queueStats,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Telegram Notification Worker health check on port ${PORT}`);
});

// ============================================================================
// Telegram Markdown Escaping
// ============================================================================

function escapeTelegramMarkdown(text: string): string {
  if (!text) return text;
  return text.replace(/([_*[\]`])/g, "\\$1");
}

// ============================================================================
// Message Formatting
// ============================================================================

function formatSignalExecutedMessage(signal: any, position: any): string {
  const side = signal.side;
  const token = signal.token_symbol;
  const venue = signal.venue;
  const agentName = signal.agent_deployments?.agents?.name || "Unknown Agent";

  const sideEmoji = side === "LONG" ? "📈" : "📉";
  const venueEmoji =
    venue === "HYPERLIQUID" ? "🔵" : venue === "OSTIUM" ? "🟢" : "⚪";

  const entryPrice = parseFloat(
    position.entry_price?.toString() || "0"
  ).toFixed(4);
  const qty = parseFloat(position.qty?.toString() || "0").toFixed(4);

  let message = `🎯 *Position Opened*\n\n`;
  message += `${sideEmoji} *${side}* ${token}\n`;
  message += `${venueEmoji} Venue: ${venue}\n`;
  message += `🤖 Agent: ${escapeTelegramMarkdown(agentName)}\n\n`;
  message += `📊 *Trade Details:*\n`;
  message += `• Entry Price: $${entryPrice}\n`;
  message += `• Quantity: ${qty}\n`;

  if (position.stop_loss) {
    message += `• Stop Loss: $${parseFloat(
      position.stop_loss?.toString() || "0"
    ).toFixed(4)}\n`;
  }

  if (position.take_profit) {
    message += `• Take Profit: $${parseFloat(
      position.take_profit?.toString() || "0"
    ).toFixed(4)}\n`;
  }

  if (signal.llm_decision) {
    message += `\n💭 *Agent Decision:*\n${escapeTelegramMarkdown(
      signal.llm_decision
    )}`;
  }

  if (signal.llm_fund_allocation !== null || signal.llm_leverage !== null) {
    message += `\n\n📊 *Trade Parameters:*`;
    if (signal.llm_fund_allocation !== null) {
      message += `\n• Fund Allocation: ${signal.llm_fund_allocation.toFixed(
        2
      )}%`;
    }
    if (signal.llm_leverage !== null) {
      message += `\n• Leverage: ${signal.llm_leverage.toFixed(1)}x`;
    }
  }

  message += `\n\n💡 Track this trade on your [Maxxit Dashboard](https://maxxit.ai/my-trades)`;

  return message;
}

function formatSignalNotTradedMessage(
  signal: any,
  reason: string | null,
  isFailed: boolean
): string {
  const side = signal.side;
  const token = signal.token_symbol;
  const venue = signal.venue;
  const agentName = signal.agent_deployments?.agents?.name || "Unknown Agent";

  const sideEmoji = side === "LONG" ? "📈" : "📉";
  const venueEmoji =
    venue === "HYPERLIQUID" ? "🔵" : venue === "OSTIUM" ? "🟢" : "⚪";

  let message: string;

  if (isFailed) {
    message = `❌ *Trade Execution Failed*\n\n`;
  } else {
    message = `📊 *Signal Generated (Not Traded)*\n\n`;
  }

  message += `${sideEmoji} ${side} ${token}\n`;
  message += `${venueEmoji} Venue: ${venue}\n`;
  message += `🤖 Agent: ${escapeTelegramMarkdown(agentName)}\n\n`;

  if (isFailed) {
    message += `⚠️ *Status:* Trade attempted but execution failed\n\n`;
    if (reason) {
      message += `❌ *Error:*\n${escapeTelegramMarkdown(reason)}\n`;
    }
  } else {
    message += `ℹ️ *Status:* Signal generated but not traded\n\n`;
    if (reason) {
      message += `⚠️ *Reason:*\n${escapeTelegramMarkdown(reason)}\n`;
    }
  }

  if (signal.llm_decision) {
    message += `\n💭 *Agent Decision:*\n${escapeTelegramMarkdown(
      signal.llm_decision
    )}\n`;
  }

  if (signal.llm_fund_allocation !== null || signal.llm_leverage !== null) {
    message += `\n📊 *Parameters Considered:*`;
    if (signal.llm_fund_allocation !== null) {
      message += `\n• Fund Allocation: ${signal.llm_fund_allocation.toFixed(
        2
      )}%`;
    }
    if (signal.llm_leverage !== null) {
      message += `\n• Leverage: ${signal.llm_leverage.toFixed(1)}x`;
    }
  }

  message += `\n\n💡 View all signals on your [Maxxit Dashboard](https://maxxit.ai/my-trades)`;

  return message;
}

// ============================================================================
// Telegram API
// ============================================================================

async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Telegram API error: ${error}` };
    }

    const data = (await response.json()) as any;
    return { success: true, messageId: data.result?.message_id?.toString() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Telegram Handler (for BullMQ worker)
// ============================================================================

async function handleTelegramJob(
  job: Job<TelegramNotificationJob>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { chatId, message, userId, signalId, notificationType, metadata } =
    job.data;

  console.log(
    `[Processor] 📤 Sending ${notificationType} to ${userId.slice(0, 6)}...`
  );

  const result = await sendTelegramMessage(chatId, message);

  // Log to database
  try {
    if (result.success) {
      await prisma.notification_logs.create({
        data: {
          user_wallet: userId.toLowerCase(),
          position_id: metadata?.positionId || null,
          signal_id: signalId,
          notification_type: notificationType,
          message_content: message,
          telegram_message_id: result.messageId,
          status: "SENT",
          sent_at: new Date(),
        },
      });

      // Update last notified timestamp
      await prisma.user_telegram_notifications.updateMany({
        where: { user_wallet: userId.toLowerCase() },
        data: { last_notified_at: new Date() },
      });

      notificationsSent++;
      console.log(`[Processor] ✅ Sent to ${userId.slice(0, 6)}...`);
    } else {
      await prisma.notification_logs.create({
        data: {
          user_wallet: userId.toLowerCase(),
          position_id: metadata?.positionId || null,
          signal_id: signalId,
          notification_type: notificationType,
          message_content: message,
          status: "FAILED",
          error_message: result.error,
          sent_at: new Date(),
        },
      });

      notificationsFailed++;
      console.error(
        `[Processor] ❌ Failed for ${userId.slice(0, 6)}...: ${result.error}`
      );

      // Throw error to trigger BullMQ retry
      throw new Error(result.error);
    }
  } catch (dbError: any) {
    console.error(`[Processor] ❌ DB error:`, dbError.message);
    throw dbError;
  }

  return result;
}

// ============================================================================
// Scanner: Scan signals and enqueue notifications
// ============================================================================

async function scanAndEnqueueNotifications() {
  if (isScanCycleRunning) {
    console.log("[Scanner] ⏭️ Skipping - previous scan still running");
    return;
  }

  isScanCycleRunning = true;

  console.log(
    "\n╔═══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║            📱 TELEGRAM NOTIFICATION SCANNER                   ║"
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝\n"
  );

  const startTime = Date.now();

  try {
    console.log("[Scanner] Querying signals from last 24 hours...");

    const recentSignals = await prisma.signals.findMany({
      where: {
        created_at: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        deployment_id: {
          not: null,
        },
      },
      include: {
        agents: true,
        agent_deployments: {
          include: {
            agents: true,
          },
        },
        positions: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    console.log(`[Scanner] Found ${recentSignals.length} signals\n`);

    if (recentSignals.length === 0) {
      console.log("[Scanner] ✅ No signals to process\n");
      return { success: true, enqueued: 0 };
    }

    let enqueued = 0;
    let skipped = 0;
    let waiting = 0;

    for (const signal of recentSignals) {
      try {
        if (!signal.agent_deployments) {
          skipped++;
          continue;
        }

        const deployment = signal.agent_deployments;
        const userWallet = deployment.user_wallet;

        // Check if already notified in DB
        const existingNotification = await prisma.notification_logs.findFirst({
          where: {
            signal_id: signal.id,
            user_wallet: userWallet.toLowerCase(),
            notification_type: {
              in: ["SIGNAL_EXECUTED", "SIGNAL_NOT_TRADED"],
            },
            status: "SENT",
          },
        });

        if (existingNotification) {
          skipped++;
          continue;
        }

        // Check if job already in queue (deduplication)
        const jobExists = await producer!.jobExists(signal.id, userWallet);
        if (jobExists) {
          skipped++;
          continue;
        }

        // Get user's Telegram
        const userTelegram =
          await prisma.user_telegram_notifications.findUnique({
            where: { user_wallet: userWallet.toLowerCase() },
          });

        if (!userTelegram || !userTelegram.is_active) {
          skipped++;
          continue;
        }

        // Determine notification type
        const llmShouldTrade = signal.llm_should_trade;
        const signalAny = signal as any;
        const tradeExecuted = signalAny.trade_executed as string | null;
        const skippedReason = signal.skipped_reason;
        const executionResult = signalAny.execution_result as string | null;

        let notificationType: "SIGNAL_EXECUTED" | "SIGNAL_NOT_TRADED" | null =
          null;
        let message: string | null = null;
        let position: any = null;
        let failureReason: string | null = null;

        if (llmShouldTrade === false) {
          notificationType = "SIGNAL_NOT_TRADED";
          failureReason = skippedReason || "Agent decided not to trade";
          message = formatSignalNotTradedMessage(signal, failureReason, false);
        } else if (llmShouldTrade === true) {
          if (tradeExecuted === null || tradeExecuted === undefined) {
            waiting++;
            continue;
          } else if (tradeExecuted === "SUCCESS") {
            position = signal.positions?.[0];
            if (!position) {
              waiting++;
              continue;
            }
            notificationType = "SIGNAL_EXECUTED";
            message = formatSignalExecutedMessage(signal, position);
          } else if (tradeExecuted === "FAILED") {
            notificationType = "SIGNAL_NOT_TRADED";
            failureReason =
              executionResult || "Trade execution failed (unknown error)";
            message = formatSignalNotTradedMessage(signal, failureReason, true);
          } else {
            waiting++;
            continue;
          }
        } else {
          waiting++;
          continue;
        }

        if (!notificationType || !message) {
          continue;
        }

        // Enqueue the notification
        await producer!.enqueueTelegramNotification({
          chatId: userTelegram.telegram_chat_id,
          message,
          userId: userWallet,
          signalId: signal.id,
          notificationType,
          metadata: {
            positionId: position?.id,
            agentName: deployment.agents?.name,
            tokenSymbol: signal.token_symbol,
            venue: signal.venue,
          },
        });

        enqueued++;
        notificationsEnqueued++;

        console.log(
          `[Scanner] 📤 Enqueued ${notificationType} for ${userWallet.slice(
            0,
            6
          )}... (${signal.token_symbol})`
        );
      } catch (error: any) {
        console.error(`[Scanner] ❌ Error processing signal:`, error.message);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[Scanner] 📊 Summary:`);
    console.log(`   📤 Enqueued: ${enqueued}`);
    console.log(`   ⏳ Waiting: ${waiting}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ⏱️  Duration: ${duration}s\n`);

    return { success: true, enqueued, waiting, skipped };
  } catch (error: any) {
    console.error("[Scanner] ❌ Error:", error.message);
    return { success: false, error: error.message };
  } finally {
    isScanCycleRunning = false;
  }
}

// ============================================================================
// Main Worker
// ============================================================================

async function runWorker() {
  console.log("🚀 Telegram Notification Worker starting...");
  console.log(`📋 Mode: ${WORKER_MODE.toUpperCase()}`);
  console.log(`⏱️  Scan Interval: ${SCAN_INTERVAL}ms`);
  console.log(`🔗 Redis URL: ${REDIS_URL.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`🤖 Bot Token: ${BOT_TOKEN ? "✅ Configured" : "❌ Missing"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Initialize BullMQ
  notificationQueue = new NotificationQueue({ redisUrl: REDIS_URL });
  producer = new NotificationProducer(notificationQueue);

  // Start processor if needed
  if (WORKER_MODE === "full" || WORKER_MODE === "processor") {
    worker = new NotificationWorker(
      notificationQueue,
      { telegram: handleTelegramJob },
      {
        concurrency: PROCESSOR_CONCURRENCY,
        limiter: {
          max: 25, // Telegram rate limit safe
          duration: 1000,
        },
      }
    );
    await worker.start();
    console.log(
      `✅ Processor started with concurrency=${PROCESSOR_CONCURRENCY}`
    );
  }

  // Start scanner if needed
  if (WORKER_MODE === "full" || WORKER_MODE === "scanner") {
    // Run immediately
    await scanAndEnqueueNotifications();

    // Then on interval
    scannerInterval = setInterval(async () => {
      await scanAndEnqueueNotifications();
    }, SCAN_INTERVAL);

    console.log(`✅ Scanner started with interval=${SCAN_INTERVAL}ms`);
  }
}

// ============================================================================
// Cleanup & Graceful Shutdown
// ============================================================================

registerCleanup(async () => {
  console.log("🛑 Stopping Telegram Notification Worker...");

  if (scannerInterval) {
    clearInterval(scannerInterval);
    scannerInterval = null;
  }

  if (worker) {
    await worker.stop();
  }

  if (notificationQueue) {
    await notificationQueue.close();
  }
});

setupGracefulShutdown("Telegram Notification Worker", server);

// ============================================================================
// Start
// ============================================================================

if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[Worker] ❌ Failed to start:", error);
    process.exit(1);
  });
}

export { scanAndEnqueueNotifications, handleTelegramJob };
