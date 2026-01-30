/**
 * Telegram Notification Worker (Event-Driven with BullMQ)
 *
 * Sends Telegram notifications for signals (both traded and untraded).
 * Jobs are processed in parallel across multiple workers for faster throughput.
 *
 * Flow:
 * 1. Trade Executor Worker adds notification job after trade completes
 * 2. Interval trigger finds missed signals as fallback
 * 3. Worker pool processes jobs in parallel
 * 4. Each job sends a Telegram message and logs the notification
 */

import dotenv from "dotenv";
import express from "express";
import {
  prisma,
  checkDatabaseHealth,
  disconnectPrisma,
} from "@maxxit/database";
import {
  setupGracefulShutdown,
  registerCleanup,
  createHealthCheckHandler,
} from "@maxxit/common";
import {
  createWorkerPool,
  createQueue,
  addJob,
  getQueueStats,
  startIntervalTrigger,
  shutdownQueueService,
  isRedisHealthy,
  withLock,
  QueueName,
  TelegramNotificationJobData,
  SendNotificationJobData,
  JobResult,
  Job,
} from "@maxxit/queue";

// Bull Board imports
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

dotenv.config();

const PORT = process.env.PORT || 5010;
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || "2");
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5");
const TRIGGER_INTERVAL = parseInt(process.env.TRIGGER_INTERVAL || "15000"); //15 seconds

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN environment variable is required");
  process.exit(1);
}

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("telegram-notification-worker", async () => {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      isRedisHealthy(),
    ]);

    let queueStats = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
    try {
      queueStats = await getQueueStats(QueueName.TELEGRAM_NOTIFICATION);
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
  console.log(`🏥 Telegram Notification Worker health check on port ${PORT}`);
});

/**
 * Setup Bull Board for queue visualization
 * Access at: http://localhost:PORT/admin/queues
 */
function setupBullBoard() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  const notificationQueue = createQueue(QueueName.TELEGRAM_NOTIFICATION);

  createBullBoard({
    queues: [new BullMQAdapter(notificationQueue)],
    serverAdapter,
  });

  app.use("/admin/queues", serverAdapter.getRouter());
  console.log(
    `📊 Bull Board available at http://localhost:${PORT}/admin/queues`
  );
}

/**
 * Escape Telegram Markdown special characters
 */
function escapeTelegramMarkdown(text: string): string {
  if (!text) return text;
  return text.replace(/([_*[\]`])/g, "\\$1");
}

/**
 * Get notification lock key for deduplication
 */
function getNotificationLockKey(
  signalId: string | undefined,
  userWallet: string,
  notificationType?: string
): string {
  if (signalId) {
    return `notification:${signalId}:${userWallet.toLowerCase()}`;
  }
  // For notifications without signalId (like QUOTA_EXCEEDED), use type and timestamp
  return `notification:${notificationType || "unknown"
    }:${userWallet.toLowerCase()}:${Date.now()}`;
}

/**
 * Process a single notification job
 */
async function processNotificationJob(
  job: Job<TelegramNotificationJobData>
): Promise<JobResult> {
  const { data } = job;

  if (data.type !== "SEND_NOTIFICATION") {
    return {
      success: false,
      error: `Unknown job type: ${(data as any).type}`,
    };
  }

  const jobData = data as SendNotificationJobData;
  const { signalId, userWallet, notificationType, context } = jobData;
  const lockKey = getNotificationLockKey(
    signalId,
    userWallet,
    notificationType
  );

  // Handle QUOTA_EXCEEDED notifications (no signalId needed)
  if (notificationType === "QUOTA_EXCEEDED") {
    const result = await withLock(lockKey, async () => {
      return await sendQuotaExceededNotification(userWallet, context);
    });
    return (
      result || { success: true, message: "Job skipped - lock not acquired" }
    );
  }

  // Handle signal-based notifications
  if (!signalId) {
    // For SIGNAL_NOT_TRADED with context (from signal generator)
    if (notificationType === "SIGNAL_NOT_TRADED" && context) {
      const result = await withLock(lockKey, async () => {
        return await sendContextBasedNotification(
          userWallet,
          notificationType,
          context
        );
      });
      return (
        result || { success: true, message: "Job skipped - lock not acquired" }
      );
    }
    return {
      success: false,
      error: "Signal ID required for this notification type",
    };
  }

  // Use distributed lock to prevent duplicate notifications
  const result = await withLock(lockKey, async () => {
    return await sendNotificationForSignal(
      signalId,
      userWallet,
      notificationType
    );
  });

  if (result === undefined) {
    return {
      success: true,
      message: "Job skipped - another worker is processing this notification",
    };
  }

  return result;
}

/**
 * Send notification for a specific signal
 */
async function sendNotificationForSignal(
  signalId: string,
  userWallet: string,
  notificationType: string
): Promise<JobResult> {
  try {
    console.log(
      `[Notification] 🔔 Processing: signal=${signalId.slice(
        0,
        8
      )}... user=${userWallet.slice(0, 6)}...`
    );

    // Check if already notified
    const existingNotification = await prisma.notification_logs.findFirst({
      where: {
        signal_id: signalId,
        user_wallet: userWallet.toLowerCase(),
        notification_type: {
          in: ["SIGNAL_EXECUTED", "SIGNAL_NOT_TRADED"],
        },
        status: "SENT",
      },
    });

    if (existingNotification) {
      console.log(`[Notification] ⏭️  Already notified - skipping`);
      return {
        success: true,
        message: "Already notified",
      };
    }

    // ✅ OPTIMIZED: Only select fields actually used
    const signal = await prisma.signals.findUnique({
      where: { id: signalId },
      select: {
        id: true,
        side: true,
        token_symbol: true,
        venue: true,
        skipped_reason: true,
        trade_executed: true,
        execution_result: true,
        llm_decision: true,
        llm_fund_allocation: true,
        llm_leverage: true,
        agent_deployments: {
          select: {
            user_wallet: true,
            agents: {
              select: {
                name: true,
              },
            },
          },
        },
        positions: {
          select: {
            id: true,
            entry_price: true,
            qty: true,
            stop_loss: true,
            take_profit: true,
          },
        },
      },
    });

    if (!signal) {
      console.log(
        `[Notification] ⚠️  Signal not found: ${signalId.slice(0, 8)}`
      );
      return {
        success: false,
        error: "Signal not found",
      };
    }

    // ✅ OPTIMIZED: Only select fields actually used
    const userTelegram = await prisma.user_telegram_notifications.findUnique({
      where: {
        user_wallet: userWallet.toLowerCase(),
      },
      select: {
        id: true,
        telegram_chat_id: true,
        is_active: true,
      },
    });

    if (!userTelegram || !userTelegram.is_active) {
      console.log(
        `[Notification] ⏭️  No active Telegram connection - skipping`
      );
      return {
        success: true,
        message: "No active Telegram connection",
      };
    }

    // Format message based on notification type
    const signalAny = signal as any;
    const tradeExecuted = signalAny.trade_executed as string | null;
    const position =
      signal.positions && signal.positions.length > 0
        ? signal.positions[0]
        : null;

    let message: string;
    let actualNotificationType: "SIGNAL_EXECUTED" | "SIGNAL_NOT_TRADED";

    if (notificationType === "SIGNAL_EXECUTED" && position) {
      message = formatSignalExecutedMessage(signal, position);
      actualNotificationType = "SIGNAL_EXECUTED";
    } else {
      const failureReason =
        tradeExecuted === "FAILED"
          ? signalAny.execution_result || "Trade execution failed"
          : signal.skipped_reason || "Agent decided not to trade";
      message = formatSignalNotTradedMessage(
        signal,
        failureReason,
        tradeExecuted === "FAILED"
      );
      actualNotificationType = "SIGNAL_NOT_TRADED";
    }

    // Send the notification
    console.log(`[Notification] 📤 Sending to Telegram...`);
    const result = await sendTelegramMessage(
      userTelegram.telegram_chat_id,
      message
    );

    if (result.success) {
      // Log success
      await prisma.notification_logs.create({
        data: {
          user_wallet: userWallet.toLowerCase(),
          position_id: position?.id || null,
          signal_id: signalId,
          notification_type: actualNotificationType,
          message_content: message,
          telegram_message_id: result.messageId,
          status: "SENT",
          sent_at: new Date(),
        },
      });

      await prisma.user_telegram_notifications.update({
        where: { id: userTelegram.id },
        data: { last_notified_at: new Date() },
      });

      console.log(`[Notification] ✅ Sent successfully!`);
      return {
        success: true,
        message: `Notification sent: ${actualNotificationType}`,
      };
    } else {
      // Log failure
      await prisma.notification_logs.create({
        data: {
          user_wallet: userWallet.toLowerCase(),
          position_id: position?.id || null,
          signal_id: signalId,
          notification_type: actualNotificationType,
          message_content: message,
          status: "FAILED",
          error_message: result.error,
          sent_at: new Date(),
        },
      });

      console.error(`[Notification] ❌ Failed: ${result.error}`);

      // Check if error is retryable
      if (isRetryableError(result.error || "")) {
        throw new Error(result.error); // Re-throw to trigger BullMQ retry
      }

      return {
        success: false,
        error: result.error,
      };
    }
  } catch (error: any) {
    console.error(`[Notification] ❌ Error:`, error.message);
    throw error; // Re-throw to trigger BullMQ retry
  }
}

/**
 * Format message for EXECUTED signal
 */
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

/**
 * Format message for NOT TRADED signal
 */
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

  // const isTokenNotSupported =
  //   reason?.toLowerCase().includes("not supported") ||
  //   reason?.toLowerCase().includes("not available") ||
  //   reason?.toLowerCase().includes("ostium pairs");

  let message: string;

  if (isFailed) {
    message = `❌ *Trade Execution Failed*\n\n`;
  // } else if (isTokenNotSupported) {
  //   message = `⚠️ *Token Not Supported*\n\n`;
  } else {
    message = `📊 *Signal Generated (Not Traded)*\n\n`;
  }

  message += `${sideEmoji} ${side} ${token}\n`;
  message += `${venueEmoji} Venue: ${venue}\n`;
  message += `🤖 Agent: ${escapeTelegramMarkdown(agentName)}\n\n`;

  // if (isTokenNotSupported) {
  //   message += `⚠️ *Why Skipped:*\n`;
  //   message += `• This token is not currently available in the Ostium trading pairs\n`;
  //   message += `• The signal was automatically skipped to prevent from execution\n`;
  //   message += `• Your agent is working correctly - this is expected behavior\n`;
  // } else if (isFailed) {
  //   message += `⚠️ *Status:* Trade attempted but execution failed\n\n`;
  //   if (reason) {
  //     message += `❌ *Error:*\n${escapeTelegramMarkdown(reason)}\n`;
  //   }
  //   if (signal.llm_decision) {
  //     message += `\n💭 *Agent Decision:*\n${formatDecisionAsBullets(
  //       signal.llm_decision
  //     )}\n`;
  //   }
  // } else {
  //   if (signal.llm_decision) {
  //     message += `💭 *Why Not Traded:*\n${formatDecisionAsBullets(
  //       signal.llm_decision
  //     )}\n`;
  //   } else if (reason) {
  //     message += `💭 *Why Not Traded:*\n${formatDecisionAsBullets(reason)}\n`;
  //   }
  // }

  if (isFailed) {
    const hasAllocation =
      signal.llm_fund_allocation !== null && signal.llm_fund_allocation > 0;
    const hasLeverage = signal.llm_leverage !== null && signal.llm_leverage > 0;

    if (hasAllocation || hasLeverage) {
      message += `\n📊 *Parameters Considered:*`;
      if (hasAllocation) {
        message += `\n• Fund Allocation: ${signal.llm_fund_allocation.toFixed(
          2
        )}%`;
      }
      if (hasLeverage) {
        message += `\n• Leverage: ${signal.llm_leverage.toFixed(1)}x`;
      }
    }
  }

  message += `\n\n💡 View all signals on your [Maxxit Dashboard](https://maxxit.ai/my-trades)`;

  return message;
}

/**
 * Format LLM decision text into bullet points
 */
function formatDecisionAsBullets(text: string): string {
  if (!text) return "";

  const sentences = text
    .replace(/\.\s+/g, ".\n")
    .replace(/;\s+/g, ";\n")
    .replace(/\n+/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return escapeTelegramMarkdown(text);

  return sentences
    .map((sentence) => {
      const bullet = sentence.startsWith("-") ? "" : "• ";
      return bullet + escapeTelegramMarkdown(sentence);
    })
    .join("\n");
}

/**
 * Send QUOTA_EXCEEDED notification to user
 */
async function sendQuotaExceededNotification(
  userWallet: string,
  context?: { token?: string; agentName?: string }
): Promise<JobResult> {
  try {
    console.log(
      `[Notification] 🔔 Processing QUOTA_EXCEEDED for ${userWallet.slice(
        0,
        6
      )}...`
    );

    // ✅ OPTIMIZED: Only select fields actually used
    const userTelegram = await prisma.user_telegram_notifications.findUnique({
      where: { user_wallet: userWallet.toLowerCase() },
      select: {
        telegram_chat_id: true,
        is_active: true,
      },
    });

    if (!userTelegram || !userTelegram.is_active) {
      return { success: true, message: "No active Telegram connection" };
    }

    // Format message - clarify that this may apply to multiple agents
    // and that other signals with quota may have processed successfully
    let message = `⚠️ *Trade Quota Reached*\n\n`;
    message += `Your trade credits have been used up for this signal.\n\n`;
    if (context?.token) {
      message += `📊 Signal for *${context.token}* was skipped for some agents.\n`;
    }
    if (context?.agentName) {
      message += `🤖 Including: ${escapeTelegramMarkdown(
        context.agentName
      )} (and possibly others)\n`;
    }
    message += `\nℹ️ _Signals processed before quota ran out were still executed._\n`;
    message += `\n💳 Purchase more credits to continue receiving all signals.\n`;
    message += `\n💡 [Purchase Credits](https://maxxit.ai/pricing)`;

    const result = await sendTelegramMessage(
      userTelegram.telegram_chat_id,
      message
    );

    if (result.success) {
      await prisma.notification_logs.create({
        data: {
          user_wallet: userWallet.toLowerCase(),
          position_id: null,
          signal_id: null,
          notification_type: "QUOTA_EXCEEDED" as any,
          message_content: message,
          telegram_message_id: result.messageId,
          status: "SENT",
          sent_at: new Date(),
        },
      });
      console.log(`[Notification] ✅ QUOTA_EXCEEDED sent successfully!`);
      return { success: true, message: "Quota exceeded notification sent" };
    } else {
      console.error(`[Notification] ❌ Failed: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[Notification] ❌ Error:`, error.message);
    throw error;
  }
}

/**
 * Send context-based notification (when signalId is not available)
 */
async function sendContextBasedNotification(
  userWallet: string,
  notificationType: string,
  context: {
    token?: string;
    side?: string;
    venue?: string;
    agentName?: string;
    reason?: string;
  }
): Promise<JobResult> {
  try {
    console.log(
      `[Notification] 🔔 Processing context-based ${notificationType} for ${userWallet.slice(
        0,
        6
      )}...`
    );

    // ✅ OPTIMIZED: Only select fields actually used
    const userTelegram = await prisma.user_telegram_notifications.findUnique({
      where: { user_wallet: userWallet.toLowerCase() },
      select: {
        telegram_chat_id: true,
        is_active: true,
      },
    });

    if (!userTelegram || !userTelegram.is_active) {
      return { success: true, message: "No active Telegram connection" };
    }

    // Format message based on context
    const sideEmoji = context.side === "LONG" ? "📈" : "📉";
    const venueEmoji =
      context.venue === "HYPERLIQUID"
        ? "🔵"
        : context.venue === "OSTIUM"
          ? "🟢"
          : "⚪";

    let message = `📊 *Signal Generated (Not Traded)*\n\n`;
    if (context.side && context.token) {
      message += `${sideEmoji} ${context.side} ${context.token}\n`;
    }
    if (context.venue) {
      message += `${venueEmoji} Venue: ${context.venue}\n`;
    }
    if (context.agentName) {
      message += `🤖 Agent: ${escapeTelegramMarkdown(context.agentName)}\n`;
    }
    if (context.reason) {
      message += `\n💭 *Why Not Traded:*\n${formatDecisionAsBullets(
        context.reason
      )}\n`;
    }
    message += `\n💡 View all signals on your [Maxxit Dashboard](https://maxxit.ai/my-trades)`;

    const result = await sendTelegramMessage(
      userTelegram.telegram_chat_id,
      message
    );

    if (result.success) {
      await prisma.notification_logs.create({
        data: {
          user_wallet: userWallet.toLowerCase(),
          position_id: null,
          signal_id: null,
          notification_type: "SIGNAL_NOT_TRADED",
          message_content: message,
          telegram_message_id: result.messageId,
          status: "SENT",
          sent_at: new Date(),
        },
      });
      console.log(
        `[Notification] ✅ Context-based notification sent successfully!`
      );
      return { success: true, message: "Context-based notification sent" };
    } else {
      console.error(`[Notification] ❌ Failed: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[Notification] ❌ Error:`, error.message);
    throw error;
  }
}

/**
 * Send message via Telegram Bot API
 */
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

/**
 * Check if an error should trigger a retry
 */
function isRetryableError(errorMessage: string): boolean {
  if (!errorMessage) return false;

  const lowerError = errorMessage.toLowerCase();
  const retryablePatterns = [
    "timeout",
    "network",
    "connection",
    "econnrefused",
    "econnreset",
    "etimedout",
    "fetch failed",
    "429", // Rate limit
    "500",
    "502",
    "503",
    "504",
  ];

  return retryablePatterns.some((pattern) => lowerError.includes(pattern));
}

/**
 * Check for pending signals and add jobs to queue (fallback trigger)
 */
async function checkAndQueuePendingSignals(): Promise<void> {
  try {
    // ✅ OPTIMIZED: Only select fields actually used
    const pendingSignals = await prisma.signals.findMany({
      where: {
        created_at: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        deployment_id: {
          not: null,
        },
        // Either llm_should_trade is false (not traded)
        // OR trade_executed is SUCCESS or FAILED
        OR: [
          { llm_should_trade: false },
          { trade_executed: "SUCCESS" },
          { trade_executed: "FAILED" },
        ],
      },
      select: {
        id: true,
        llm_should_trade: true,
        trade_executed: true,
        agent_deployments: {
          select: {
            user_wallet: true,
          },
        },
      },
      orderBy: {
        created_at: "asc",
      },
      take: 100,
    });

    if (pendingSignals.length === 0) {
      return;
    }

    let jobsQueued = 0;

    for (const signal of pendingSignals) {
      if (!signal.agent_deployments) continue;

      const userWallet = signal.agent_deployments.user_wallet.toLowerCase();

      // Check if already notified
      const existingNotification = await prisma.notification_logs.findFirst({
        where: {
          signal_id: signal.id,
          user_wallet: userWallet,
          status: "SENT",
        },
      });

      if (existingNotification) continue;

      // Determine notification type
      const signalAny = signal as any;
      const tradeExecuted = signalAny.trade_executed as string | null;
      let notificationType: "SIGNAL_EXECUTED" | "SIGNAL_NOT_TRADED";

      if (signal.llm_should_trade === false) {
        notificationType = "SIGNAL_NOT_TRADED";
      } else if (tradeExecuted === "SUCCESS") {
        notificationType = "SIGNAL_EXECUTED";
      } else if (tradeExecuted === "FAILED") {
        notificationType = "SIGNAL_NOT_TRADED";
      } else {
        continue; // Still processing, skip
      }

      await addJob(
        QueueName.TELEGRAM_NOTIFICATION,
        "send-notification",
        {
          type: "SEND_NOTIFICATION" as const,
          signalId: signal.id,
          userWallet: userWallet,
          notificationType: notificationType,
          timestamp: Date.now(),
        },
        {
          jobId: `notify-${signal.id}-${userWallet}`,
        }
      );
      jobsQueued++;
    }

    if (jobsQueued > 0) {
      console.log(`[Trigger] Queued ${jobsQueued} notification jobs`);
    }
  } catch (error: any) {
    console.error("[Trigger] Error checking pending signals:", error.message);
  }
}

/**
 * Main worker startup
 */
async function runWorker() {
  try {
    console.log("🚀 Telegram Notification Worker (Event-Driven) starting...");
    console.log(`👷 Worker count: ${WORKER_COUNT}`);
    console.log(`🔄 Concurrency per worker: ${WORKER_CONCURRENCY}`);
    console.log(`⏱️  Trigger interval: ${TRIGGER_INTERVAL}ms`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error(
        "Database connection failed. Check DATABASE_URL environment variable."
      );
    }
    console.log("✅ Database connection: OK");

    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      throw new Error(
        "Redis connection failed. Check REDIS_URL environment variable."
      );
    }
    console.log("✅ Redis connection: OK");

    setupBullBoard();

    // Create worker pool for parallel processing
    createWorkerPool<TelegramNotificationJobData>(
      QueueName.TELEGRAM_NOTIFICATION,
      processNotificationJob,
      WORKER_COUNT,
      {
        concurrency: WORKER_CONCURRENCY,
        lockDuration: 60000, // 1 minute lock for Telegram API calls
      }
    );

    // Start interval trigger to check for missed signals
    startIntervalTrigger(TRIGGER_INTERVAL, checkAndQueuePendingSignals, {
      runImmediately: true,
      name: "telegram-notification-trigger",
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Telegram Notification Worker started successfully");
    console.log(
      `📊 Effective parallel capacity: ${WORKER_COUNT * WORKER_CONCURRENCY
      } concurrent notifications`
    );
  } catch (error: any) {
    console.error(
      "[TelegramNotification] ❌ Failed to start worker:",
      error.message
    );
    throw error;
  }
}

// Register cleanup handlers
registerCleanup(async () => {
  console.log("🛑 Stopping Telegram Notification Worker...");
  await shutdownQueueService();
  await disconnectPrisma();
  console.log("✅ Cleanup complete");
});

// Setup graceful shutdown
setupGracefulShutdown("Telegram Notification Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[TelegramNotification] ❌ Worker failed to start:", error);
    setTimeout(() => process.exit(1), 5000);
  });
}

export {
  processNotificationJob,
  sendNotificationForSignal,
  checkAndQueuePendingSignals,
};
