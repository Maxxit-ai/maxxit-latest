/**
 * Telegram Notification Worker
 * Sends Telegram notifications for ALL signals (both traded and untraded)
 * Interval: 30 seconds
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import { setupGracefulShutdown, registerCleanup } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const PORT = process.env.PORT || 5010;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "30000"); // 30 seconds default
const BOT_TOKEN = process.env.TELEGRAM_NOTIFICATION_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error(
    "❌ TELEGRAM_NOTIFICATION_BOT_TOKEN environment variable is required"
  );
  process.exit(1);
}

let workerInterval: NodeJS.Timeout | null = null;
let notificationsSent = 0;
let notificationsFailed = 0;

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
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Telegram Notification Worker health check on port ${PORT}`);
});

async function processNotifications() {
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
        positions: true, // Check if signal resulted in position
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

    for (const signal of recentSignals) {
      try {
        console.log(`\n[Signal ${signal.id.slice(0, 8)}...] Processing...`);

        const existingNotification = await prisma.notification_logs.findFirst({
          where: {
            signal_id: signal.id,
            notification_type: {
              in: ["SIGNAL_EXECUTED", "SIGNAL_NOT_TRADED"],
            },
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
        const skippedReason = signal.skipped_reason;
        const positionExists = signal.positions?.length > 0;
        const position = positionExists ? signal.positions[0] : null;

        let notificationType: string | null = null;
        let statusIcon = "";
        let shouldSendNotification = true;

        if (llmShouldTrade === true) {
          // Agent decided to trade
          if (positionExists) {
            // Position exists → Trade was executed
            notificationType = "SIGNAL_EXECUTED";
            statusIcon = "🎯";
            console.log(
              `   ${statusIcon} ${signal.token_symbol} ${signal.side} - EXECUTED`
            );
          } else {
            // Position doesn't exist yet → Trade might still be executing, wait
            console.log(
              `   ⏳ ${signal.token_symbol} ${signal.side} - SHOULD TRADE but position not created yet, waiting...`
            );
            shouldSendNotification = false;
          }
        } else if (llmShouldTrade === false) {
          // Agent decided NOT to trade
          notificationType = "SIGNAL_NOT_TRADED";
          statusIcon = "📊";
          console.log(
            `   ${statusIcon} ${signal.token_symbol} ${signal.side} - NOT TRADED (llm_should_trade=false)`
          );
        } else {
          // llm_should_trade is null/undefined - treat as not traded
          notificationType = "SIGNAL_NOT_TRADED";
          statusIcon = "📊";
          console.log(
            `   ${statusIcon} ${signal.token_symbol} ${signal.side} - NOT TRADED (llm_should_trade=null)`
          );
        }

        // If signal was skipped (has a reason), definitely send NOT TRADED
        if (skippedReason && skippedReason.trim()) {
          notificationType = "SIGNAL_NOT_TRADED";
          statusIcon = "🚫";
          shouldSendNotification = true;
          console.log(
            `   ${statusIcon} ${signal.token_symbol} ${signal.side} - SKIPPED: ${skippedReason}`
          );
        }

        // If we shouldn't send notification yet, skip this signal
        if (!shouldSendNotification) {
          console.log(
            `   ⏭️  Skipping notification for now - will check again in next run`
          );
          skipped++;
          continue;
        }

        if (!signal.agent_deployments) {
          console.log(`   ⚠️  No deployment found - skipping`);
          skipped++;
          continue;
        }

        // Get the agent_id from this deployment
        const agentId = signal.agent_deployments.agent_id;

        // Find ALL deployments for this agent (ALL users who deployed it)
        const allDeployments = await prisma.agent_deployments.findMany({
          where: {
            agent_id: agentId,
          },
          include: {
            agents: true,
          },
        });

        console.log(
          `   👥 Found ${allDeployments.length} users who deployed this agent`
        );

        if (allDeployments.length === 0) {
          console.log(`   ⚠️  No deployments found for agent - skipping`);
          skipped++;
          continue;
        }

        let signalSent = 0;
        let signalFailed = 0;

        for (const deployment of allDeployments) {
          const userWallet = deployment.user_wallet;

          console.log(
            `     └─ Processing user: ${userWallet.slice(
              0,
              6
            )}...${userWallet.slice(-4)}`
          );

          const userTelegram =
            await prisma.user_telegram_notifications.findUnique({
              where: {
                user_wallet: userWallet.toLowerCase(),
              },
            });

          if (!userTelegram || !userTelegram.is_active) {
            console.log(`       ⏭️  No Telegram connected - skipping`);
            continue;
          }

          console.log(
            `       ✅ Telegram connected (@${
              userTelegram.telegram_username || userTelegram.telegram_user_id
            })`
          );

          console.log(`       📝 Formatting ${notificationType} message...`);

          const message =
            notificationType === "SIGNAL_EXECUTED"
              ? await formatSignalExecutedMessage(signal, position)
              : await formatSignalNotTradedMessage(signal);

          console.log(`       📤 Sending to Telegram...`);

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
                notification_type: notificationType as any,
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

            signalSent++;
            console.log(`       ✅ Sent successfully!`);
          } else {
            await prisma.notification_logs.create({
              data: {
                user_wallet: userWallet.toLowerCase(),
                position_id: position?.id || null,
                signal_id: signal.id,
                notification_type: notificationType as any,
                message_content: message,
                status: "FAILED",
                error_message: result.error,
                sent_at: new Date(),
              },
            });

            signalFailed++;
            console.error(`       ❌ Failed: ${result.error}`);
          }
        }

        // Update counters for this signal
        sent += signalSent;
        failed += signalFailed;

        if (signalSent > 0) {
          notificationsSent += signalSent;
        }

        if (signalFailed > 0) {
          notificationsFailed += signalFailed;
        }

        console.log(
          `   📊 Signal ${signal.id.slice(
            0,
            8
          )}: Sent to ${signalSent} users, ${signalFailed} failed`
        );
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
    console.log(`   ⏭️  Skipped: ${skipped} (already notified or no Telegram)`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️  Duration: ${duration}s\n`);

    return {
      success: true,
      notificationsSent: sent,
      notificationsSkipped: skipped,
      notificationsFailed: failed,
    };
  } catch (error: any) {
    console.error("[NotificationWorker] ❌ Error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Format message for EXECUTED signal (position was created)
 */
async function formatSignalExecutedMessage(
  signal: any,
  position: any
): Promise<string> {
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
  message += `🤖 Agent: ${agentName}\n\n`;
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
    message += `\n💭 *Agent Decision:*\n${signal.llm_decision}`;
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

  // message += `\n\n⏰ ${new Date(position.opened_at).toLocaleString()}`;
  message += `\n\n💡 Track this trade on your [Maxxit Dashboard](https://maxxit.ai/my-trades)`;

  return message;
}

/**
 * Format message for NOT TRADED signal (no position created)
 */
async function formatSignalNotTradedMessage(signal: any): Promise<string> {
  const side = signal.side;
  const token = signal.token_symbol;
  const venue = signal.venue;
  const agentName = signal.agent_deployments?.agents?.name || "Unknown Agent";

  const sideEmoji = side === "LONG" ? "📈" : "📉";
  const venueEmoji =
    venue === "HYPERLIQUID" ? "🔵" : venue === "OSTIUM" ? "🟢" : "⚪";

  // Build message
  let message = `📊 *Signal Generated (Not Traded)*\n\n`;
  message += `${sideEmoji} ${side} ${token}\n`;
  message += `${venueEmoji} Venue: ${venue}\n`;
  message += `🤖 Agent: ${agentName}\n\n`;

  // Why not traded
  message += `ℹ️ *Status:* Signal generated but position not created\n\n`;

  if (signal.llm_should_trade === false) {
    message += `⚠️ *Reason:* Agent decided not to trade\n\n`;
  }

  // LLM decision
  if (signal.llm_decision) {
    message += `💭 *Agent Decision:*\n${signal.llm_decision}\n`;
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

  // message += `\n\n⏰ ${new Date(signal.created_at).toLocaleString()}`;
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
