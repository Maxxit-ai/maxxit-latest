/**
 * Telegram Notification Worker
 * Sends Telegram notifications for ALL signals (both traded and untraded)
 * Interval: 30 seconds
 *
 * Flow:
 * 1. Fetch signals from last 24h with deployment_id (only user-specific signals)
 * 2. For each signal:
 *    - If already notified for THIS user + signal → skip
 *    - If llm_should_trade = false → SIGNAL_NOT_TRADED with skipped_reason
 *    - If llm_should_trade = true:
 *      - trade_executed = NULL → wait (not executed yet)
 *      - trade_executed = "SUCCESS" → SIGNAL_EXECUTED with position data
 *      - trade_executed = "FAILED" → SIGNAL_NOT_TRADED with execution_result error
 * 3. Notify ONLY the specific deployment's user (no fan-out to all agent deployers)
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const PORT = process.env.PORT || 5010;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "30000"); // 30 seconds default

// Use the main bot token (same as lazy trading)
// This allows both features to share a single bot
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error(
    "❌ TELEGRAM_BOT_TOKEN environment variable is required"
  );
  process.exit(1);
}

let workerInterval: NodeJS.Timeout | null = null;
let notificationsSent = 0;
let notificationsFailed = 0;
let isCycleRunning = false;

// Health check server
const app = express();
app.get("/health", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "ok" : "degraded",
    service: "telegram-notification-worker",
    interval: INTERVAL,
    database: dbHealthy ? "connected" : "disconnected",
    isRunning: workerInterval !== null,
    notificationsSent,
    notificationsFailed,
    timestamp: new Date().toISOString(),
    isCycleRunning,
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Telegram Notification Worker health check on port ${PORT}`);
});

/**
 * Escape Telegram Markdown special characters in dynamic text
 * so that LLM explanations and reasons don't break parsing.
 */
function escapeTelegramMarkdown(text: string): string {
  if (!text) return text;
  // For classic "Markdown" mode, the main special chars are: _, *, [, ], `
  return text.replace(/([_*[\]`])/g, "\\$1");
}

async function processNotifications() {
  if (isCycleRunning) {
    console.log(
      "[TelegramNotification] ⏭️ Skipping cycle - previous cycle still running"
    );
    return;
  }

  isCycleRunning = true;

  console.log(
    "\n╔═══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║                                                               ║"
  );
  console.log(
    "║            📱 TELEGRAM NOTIFICATION WORKER                    ║"
  );
  console.log(
    "║                                                               ║"
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝\n"
  );

  const startTime = Date.now();

  try {
    console.log("[Step 1] Querying signals from last 24 hours...");

    const recentSignals = await prisma.signals.findMany({
      where: {
        created_at: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        deployment_id: {
          not: null, // Only signals linked to user deployments
        },
      },
      include: {
        agents: true,
        agent_deployments: {
          include: {
            agents: true,
          },
        },
        positions: true, // For position data when trade_executed = SUCCESS
      },
      orderBy: {
        created_at: "desc",
      },
    });

    console.log(`[Step 1] ✅ Found ${recentSignals.length} signals\n`);

    if (recentSignals.length === 0) {
      console.log("[NotificationWorker] ✅ No signals to process\n");
      return { success: true, notificationsSent: 0 };
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let waiting = 0;

    for (const signal of recentSignals) {
      try {
        console.log(`\n[Signal ${signal.id.slice(0, 8)}...] Processing...`);

        // Validate deployment exists
        if (!signal.agent_deployments) {
          console.log(`   ⚠️  No deployment found - skipping`);
          skipped++;
          continue;
        }

        const deployment = signal.agent_deployments;
        const userWallet = deployment.user_wallet;
        const agentName = deployment.agents?.name || "Unknown Agent";

        console.log(
          `   👤 User: ${userWallet.slice(0, 6)}...${userWallet.slice(-4)}`
        );
        console.log(`   🤖 Agent: ${agentName}`);

        // Check if THIS user was already notified for THIS signal
        const existingNotification = await prisma.notification_logs.findFirst({
          where: {
            signal_id: signal.id,
            user_wallet: userWallet.toLowerCase(),
            notification_type: {
              in: ["SIGNAL_EXECUTED", "SIGNAL_NOT_TRADED"],
            },
            status: "SENT", // Only consider successfully sent notifications
          },
        });

        if (existingNotification) {
          console.log(
            `   ⏭️  Already notified (${existingNotification.notification_type}) - skipping`
          );
          skipped++;
          continue;
        }

        const llmShouldTrade = signal.llm_should_trade;
        // Cast to any for fields that might not be in generated Prisma types yet
        const signalAny = signal as any;
        const tradeExecuted = signalAny.trade_executed as string | null; // NULL, "SUCCESS", "FAILED"
        const skippedReason = signal.skipped_reason;
        const executionResult = signalAny.execution_result as string | null;

        let notificationType: "SIGNAL_EXECUTED" | "SIGNAL_NOT_TRADED" | null =
          null;
        let statusIcon = "";
        let shouldSendNotification = true;
        let position: any = null;
        let failureReason: string | null = null;

        // Determine notification type based on llm_should_trade and trade_executed
        if (llmShouldTrade === false) {
          // Agent decided NOT to trade
          notificationType = "SIGNAL_NOT_TRADED";
          statusIcon = "📊";
          failureReason = skippedReason || "Agent decided not to trade";
          console.log(
            `   ${statusIcon} ${signal.token_symbol} ${signal.side} - NOT TRADED (llm_should_trade=false)`
          );
          if (skippedReason) {
            console.log(`   📝 Reason: ${skippedReason}`);
          }
        } else if (llmShouldTrade === true) {
          // Agent decided to trade - check trade_executed status
          if (tradeExecuted === null || tradeExecuted === undefined) {
            // Trade not executed yet - wait
            console.log(
              `   ⏳ ${signal.token_symbol} ${signal.side} - WAITING (trade_executed=NULL)`
            );
            shouldSendNotification = false;
            waiting++;
          } else if (tradeExecuted === "SUCCESS") {
            // Trade executed successfully
            position =
              signal.positions && signal.positions.length > 0
                ? signal.positions[0]
                : null;

            if (position) {
              notificationType = "SIGNAL_EXECUTED";
              statusIcon = "🎯";
              console.log(
                `   ${statusIcon} ${signal.token_symbol} ${signal.side} - EXECUTED`
              );
            } else {
              // trade_executed = SUCCESS but no position found (edge case)
              console.log(
                `   ⚠️  trade_executed=SUCCESS but no position found - waiting`
              );
              shouldSendNotification = false;
              waiting++;
            }
          } else if (tradeExecuted === "FAILED") {
            // Trade execution failed
            notificationType = "SIGNAL_NOT_TRADED";
            statusIcon = "❌";
            failureReason =
              executionResult || "Trade execution failed (unknown error)";
            console.log(
              `   ${statusIcon} ${signal.token_symbol} ${signal.side} - FAILED`
            );
            console.log(`   📝 Error: ${failureReason}`);
          } else {
            // Unknown trade_executed value - treat as waiting
            console.log(
              `   ⏳ ${signal.token_symbol} ${signal.side} - WAITING (trade_executed=${tradeExecuted})`
            );
            shouldSendNotification = false;
            waiting++;
          }
        } else {
          // llm_should_trade is null/undefined - signal still processing, wait
          console.log(
            `   ⏳ ${signal.token_symbol} ${signal.side} - WAITING (llm_should_trade=null)`
          );
          shouldSendNotification = false;
          waiting++;
        }

        // If we shouldn't send notification yet, skip this signal
        if (!shouldSendNotification || !notificationType) {
          console.log(
            `   ⏭️  Skipping notification for now - will check again in next run`
          );
          continue;
        }

        // Get user's Telegram connection
        const userTelegram =
          await prisma.user_telegram_notifications.findUnique({
            where: {
              user_wallet: userWallet.toLowerCase(),
            },
          });

        if (!userTelegram || !userTelegram.is_active) {
          console.log(`   ⏭️  No active Telegram connection - skipping`);
          skipped++;
          continue;
        }

        console.log(
          `   ✅ Telegram connected (@${userTelegram.telegram_username || userTelegram.telegram_user_id
          })`
        );

        // Format the appropriate message
        console.log(`   📝 Formatting ${notificationType} message...`);

        let message: string;
        if (notificationType === "SIGNAL_EXECUTED" && position) {
          message = formatSignalExecutedMessage(signal, position);
        } else {
          message = formatSignalNotTradedMessage(
            signal,
            failureReason,
            tradeExecuted === "FAILED"
          );
        }

        // Send the notification
        console.log(`   📤 Sending to Telegram...`);

        const result = await sendTelegramMessage(
          userTelegram.telegram_chat_id,
          message
        );

        if (result.success) {
          await prisma.notification_logs.create({
            data: {
              user_wallet: userWallet.toLowerCase(),
              position_id: position?.id || null,
              signal_id: signal.id,
              notification_type: notificationType,
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

          sent++;
          notificationsSent++;
          console.log(`   ✅ Sent successfully!`);
        } else {
          await prisma.notification_logs.create({
            data: {
              user_wallet: userWallet.toLowerCase(),
              position_id: position?.id || null,
              signal_id: signal.id,
              notification_type: notificationType,
              message_content: message,
              status: "FAILED",
              error_message: result.error,
              sent_at: new Date(),
            },
          });

          failed++;
          notificationsFailed++;
          console.error(`   ❌ Failed: ${result.error}`);
        }
      } catch (error: any) {
        console.error(
          `   ❌ Error processing signal ${signal.id}:`,
          error.message
        );
        failed++;
        notificationsFailed++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[NotificationWorker] 📊 Summary:`);
    console.log(`   ✅ Sent: ${sent}`);
    console.log(`   ⏳ Waiting: ${waiting} (trade not executed yet)`);
    console.log(`   ⏭️  Skipped: ${skipped} (already notified or no Telegram)`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️  Duration: ${duration}s\n`);

    return {
      success: true,
      notificationsSent: sent,
      notificationsWaiting: waiting,
      notificationsSkipped: skipped,
      notificationsFailed: failed,
    };
  } catch (error: any) {
    console.error("[NotificationWorker] ❌ Error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Format message for EXECUTED signal (position was created successfully)
 */
function formatSignalExecutedMessage(signal: any, position: any): string {
  const side = signal.side;
  const token = signal.token_symbol;
  const venue = signal.venue;
  const agentName = signal.agent_deployments?.agents?.name || "Unknown Agent";

  const sideEmoji = side === "LONG" ? "📈" : "📉";
  const venueEmoji =
    venue === "HYPERLIQUID" ? "🔵" : venue === "OSTIUM" ? "🟢" : "⚪";

  // Position details
  const entryPrice = parseFloat(
    position.entry_price?.toString() || "0"
  ).toFixed(4);
  const qty = parseFloat(position.qty?.toString() || "0").toFixed(4);

  // Build message
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

  // LLM decision from signal
  if (signal.llm_decision) {
    message += `\n💭 *Agent Decision:*\n${escapeTelegramMarkdown(
      signal.llm_decision
    )}`;
  }

  // Trade parameters
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
 * Format message for NOT TRADED signal (agent decided not to trade or trade failed)
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

  // Build message - different header for failed vs not traded
  let message: string;

  if (isFailed) {
    message = `❌ *Trade Execution Failed*\n\n`;
  } else {
    message = `📊 *Signal Generated (Not Traded)*\n\n`;
  }

  message += `${sideEmoji} ${side} ${token}\n`;
  message += `${venueEmoji} Venue: ${venue}\n`;
  message += `🤖 Agent: ${escapeTelegramMarkdown(agentName)}\n\n`;

  // Status and reason
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

  // LLM decision (useful context)
  if (signal.llm_decision) {
    message += `\n💭 *Agent Decision:*\n${escapeTelegramMarkdown(
      signal.llm_decision
    )}\n`;
  }

  // Trade parameters that were considered
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
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Telegram Notification Worker starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000}s)`);
  console.log(`🤖 Bot Token: ${BOT_TOKEN ? "✅ Configured" : "❌ Missing"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Run immediately on startup
  await processNotifications();

  // Then run on interval
  workerInterval = setInterval(async () => {
    await processNotifications();
  }, INTERVAL);
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping Telegram Notification Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown("Telegram Notification Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[NotificationWorker] ❌ Worker failed to start:", error);
    process.exit(1);
  });
}

export { processNotifications };
