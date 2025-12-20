import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import {
  createTelegramBot,
  type TelegramUpdate,
} from "../../../lib/telegram-bot";
import { createCommandParser } from "../../../lib/telegram-command-parser";
import { TradeExecutor } from "../../../lib/trade-executor";
const bot = createTelegramBot();
const parser = createCommandParser();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update: TelegramUpdate = req.body;
    console.log("[Telegram] Received update:", JSON.stringify(update, null, 2));

    // Handle text message
    if (update.message?.text) {
      await handleTextMessage(update);
    }

    // Handle button callback
    if (update.callback_query) {
      await handleCallback(update);
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("[Telegram] Webhook error:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleTextMessage(update: TelegramUpdate) {
  const message = update.message!;
  const chatId = message.chat.id;
  const telegramUserId = message.from.id.toString();
  const text = message.text!;

  console.log("[Telegram] Processing message from", telegramUserId, ":", text);

  // Check if user is linked to an agent deployment (for trading)
  const telegramUser = await prisma.telegram_users.findUnique({
    where: { telegram_user_id: telegramUserId },
    include: {
      agent_deployments: {
        include: {
          agents: true,
        },
      },
    },
  });

  // Handle /start command with deep link parameter (for Lazy Trading)
  if (text.startsWith("/start ")) {
    const code = text.split(" ")[1]?.toUpperCase();

    // Check if this is a Lazy Trading link code (starts with "LT")
    if (code && code.startsWith("LT")) {
      await handleLazyTradingLink(message, telegramUserId, chatId, code);
      return;
    }

    // For other /start codes, show welcome message
    await bot.sendMessage(
      chatId,
      "👋 *Welcome to Maxxit Alpha Bot!*\n\n" +
        "💡 *Share Alpha:* Send me your trading insights and signals. Agent creators can subscribe to your alpha!\n\n" +
        "📊 *Want to trade yourself?*\n" +
        "1. Create an agent at Maxxit\n" +
        "2. Deploy it\n" +
        "3. Use /link CODE to connect",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Handle /start command without parameter
  if (text === "/start") {
    await bot.sendMessage(
      chatId,
      "👋 *Welcome to Maxxit Alpha Bot!*\n\n" +
        "💡 *Share Alpha:* Send me your trading insights and signals. Agent creators can subscribe to your alpha!\n\n" +
        "📊 *Want to trade yourself?*\n" +
        "1. Create an agent at Maxxit\n" +
        "2. Deploy it\n" +
        "3. Use /link CODE to connect",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Handle /link command
  if (text.startsWith("/link ")) {
    const code = text.split(" ")[1]?.toUpperCase();
    if (!code) {
      await bot.sendMessage(
        chatId,
        "❌ Please provide a link code: /link ABC123"
      );
      return;
    }

    // Check if this is a Lazy Trading link code (starts with "LT")
    if (code.startsWith("LT")) {
      await handleLazyTradingLink(message, telegramUserId, chatId, code);
      return;
    }

    const result = await bot.linkUser(telegramUserId, code);
    if (result.success) {
      // Get the linked deployment to show agent details
      const deployment = await prisma.agent_deployments.findUnique({
        where: { id: result.deploymentId },
        include: { agents: true },
      });

      await bot.sendMessage(
        chatId,
        `✅ Successfully linked to *${deployment?.agents.name}* (${deployment?.agents.venue})\n\n` +
          `You can now trade via Telegram:\n` +
          `• "Buy 5 USDC of ETH"\n` +
          `• "Status" - View positions\n` +
          `• "Close ETH" - Close position\n\n` +
          `💡 To switch agents, just use /link with a new code.`,
        { parse_mode: "Markdown" }
      );
    } else {
      await bot.sendMessage(chatId, `❌ ${result.error}`);
    }
    return;
  }

  // Handle alpha messages (from users NOT linked to trading agents)
  // These become signal sources for agent creators
  if (!telegramUser) {
    // Check if message looks like alpha (not a basic command)
    const isBasicCommand =
      text.startsWith("/") ||
      /^(buy|sell|close|status|help)$/i.test(text.trim()) ||
      text.length < 15; // Too short to be meaningful alpha

    if (!isBasicCommand) {
      // This is an alpha message - classify and store it
      await handleAlphaMessage(message, telegramUserId, chatId);
      return;
    } else {
      // It's a command but user not linked
      await bot.sendMessage(
        chatId,
        "👋 *Welcome to Maxxit Alpha Bot!*\n\n" +
          "💡 *Share Alpha:* Send me your trading insights and signals. Agent creators can subscribe to your alpha!\n\n" +
          "📊 *Want to trade yourself?*\n" +
          "1. Create an agent at Maxxit\n" +
          "2. Deploy it\n" +
          "3. Use /link CODE to connect",
        { parse_mode: "Markdown" }
      );
      return;
    }
  }

  // User is linked - handle trading commands
  // Update last active
  await prisma.telegram_users.update({
    where: { id: telegramUser.id },
    data: { last_active_at: new Date() },
  });

  // Check if message is alpha (even from linked users)
  const intent = await parser.parseCommand(text);
  console.log("[Telegram] Parsed intent:", JSON.stringify(intent, null, 2));

  // If it's not a recognized command and long enough, treat as alpha
  if (intent.action === "UNKNOWN" && text.length > 20) {
    await handleAlphaMessage(message, telegramUserId, chatId);
    return;
  }

  // Handle trading commands
  switch (intent.action) {
    case "HELP":
      await bot.sendMessage(chatId, parser.formatConfirmation(intent), {
        parse_mode: "Markdown",
      });
      break;

    case "STATUS":
      await handleStatusCommand(chatId, telegramUser.deployment_id);
      break;

    case "BUY":
    case "SELL":
      if (!intent.token || !intent.amount) {
        await bot.sendMessage(
          chatId,
          `❌ Please specify token and amount.\n\nExample: "Buy 10 USDC of WETH"`
        );
        return;
      }

      // Store trade intent and ask for confirmation
      const trade = await prisma.telegram_trades.create({
        data: {
          telegram_user_id: telegramUser.id,
          deployment_id: telegramUser.deployment_id,
          message_id: message.message_id.toString(),
          command: text,
          parsed_intent: intent as any,
          status: "pending",
        },
      });

      // Get wallet balance for confirmation message
      const { createSafeWallet } = await import("../../../lib/safe-wallet");
      const safeWallet = createSafeWallet(
        telegramUser.agent_deployments.safe_wallet,
        42161
      );
      const balance = await safeWallet.getUSDCBalance();

      const confirmationMsg = parser.formatConfirmation(intent, balance);
      await bot.sendMessageWithButtons(chatId, confirmationMsg, [
        [
          { text: "✅ Confirm", callback_data: `confirm_${trade.id}` },
          { text: "❌ Cancel", callback_data: `cancel_${trade.id}` },
        ],
      ]);
      break;

    case "CLOSE":
      await handleCloseCommand(chatId, telegramUser, intent.token);
      break;

    case "UNKNOWN":
      await bot.sendMessage(
        chatId,
        `❓ I didn't understand that.\n\nTry:\n• "Buy 10 USDC of WETH"\n• "Close my WETH"\n• "Status"\n\nOr type "help" for more info.`
      );
      break;
  }
}

/**
 * Handle alpha messages from users (signal sources)
 * Stores raw messages - classification happens in telegram-alpha-worker service
 */
async function handleAlphaMessage(
  message: any,
  telegramUserId: string,
  chatId: number
) {
  try {
    const text = message.text;

    console.log("[Alpha] Processing alpha from user:", telegramUserId);

    // Get or create telegram_alpha_user
    let alphaUser = await prisma.telegram_alpha_users.findUnique({
      where: { telegram_user_id: telegramUserId },
    });

    if (!alphaUser) {
      // Create new alpha user
      alphaUser = await prisma.telegram_alpha_users.create({
        data: {
          telegram_user_id: telegramUserId,
          telegram_username: message.from.username || null,
          first_name: message.from.first_name || null,
          last_name: message.from.last_name || null,
          is_active: true,
          last_message_at: new Date(),
        },
      });

      console.log("[Alpha] Created new alpha user:", alphaUser.id);

      // Welcome message for first-time alpha provider
      await bot.sendMessage(
        chatId,
        "🎉 *Welcome to Maxxit Alpha!*\n\n" +
          "Your trading insights are now live! Agent creators can subscribe to your signals.\n\n" +
          "📊 Keep sharing quality alpha to build your reputation and following!",
        { parse_mode: "Markdown" }
      );
    } else {
      // Update last message time
      await prisma.telegram_alpha_users.update({
        where: { id: alphaUser.id },
        data: { last_message_at: new Date() },
      });
    }

    // Store ALL messages with NULL classification
    // Let the LLM worker decide what is/isn't a signal
    // This ensures consistent classification logic in one place
    const messageKey = `alpha_${telegramUserId}_${message.message_id}`;

    await prisma.telegram_posts.create({
      data: {
        alpha_user_id: alphaUser.id,
        source_id: null, // Not from a channel, from individual user
        message_id: messageKey,
        message_text: text,
        message_created_at: new Date(message.date * 1000),
        sender_id: telegramUserId,
        sender_username: message.from.username || null,
        is_signal_candidate: null, // NULL = not yet classified (worker will process)
        extracted_tokens: [],
        confidence_score: null,
        signal_type: null,
        processed_for_signals: false,
      },
    });

    console.log("[Alpha] Stored message (awaiting classification by worker)");

    // Give user feedback that message was received
    await bot.sendMessage(
      chatId,
      "✅ *Message received!*\n\n" +
        "Your alpha is being processed and will be available to agents following you shortly.",
      { parse_mode: "Markdown" }
    );
  } catch (error: any) {
    console.error("[Alpha] Error handling alpha message:", error);
    await bot.sendMessage(
      chatId,
      "⚠️ Message received but couldn't be processed. Try again!"
    );
  }
}

async function handleCallback(update: TelegramUpdate) {
  const callback = update.callback_query!;
  const chatId = callback.message.chat.id;
  const data = callback.data;

  console.log("[Telegram] Callback:", data);

  await bot.answerCallback(callback.id);

  if (data.startsWith("confirm_")) {
    const tradeId = data.replace("confirm_", "");
    await executeTrade(chatId, tradeId);
  } else if (data.startsWith("cancel_")) {
    const tradeId = data.replace("cancel_", "");
    await prisma.telegram_trades.update({
      where: { id: tradeId },
      data: { status: "cancelled" },
    });
    await bot.sendMessage(chatId, "❌ Trade cancelled");
  }
}

async function executeTrade(chatId: number, tradeId: string) {
  try {
    await bot.sendMessage(chatId, "⏳ Executing trade...");

    // CRITICAL FIX: Use atomic update to prevent race condition
    let trade;
    try {
      trade = await prisma.telegram_trades.update({
        where: {
          id: tradeId,
          status: "pending",
        },
        data: {
          status: "executing",
          confirmed_at: new Date(),
        },
        include: {
          agent_deployments: {
            include: {
              agents: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        await bot.sendMessage(
          chatId,
          "❌ Trade already processed or not found"
        );
        return;
      }
      throw error;
    }

    const intent = trade.parsed_intent as any;

    const uniqueTokenSymbol = `${intent.token}_MANUAL_${Date.now()}`;

    const sizeModel = {
      type: intent.amountType === "USDC" ? "fixed-usdc" : "balance-percentage",
      value: intent.amount || 5,
    };

    const signal = await prisma.signals.create({
      data: {
        agent_id: trade.agent_deployments.agent_id,
        token_symbol: uniqueTokenSymbol,
        venue: trade.agent_deployments.agents.venue,
        side: intent.action === "BUY" ? "LONG" : "SHORT",
        size_model: sizeModel,
        risk_model: {
          stopLoss: 0.1, // 10% stop loss
          takeProfit: 0.05, // 5% take profit
          leverage: 3, // Default leverage for perpetuals
        },
        source_tweets: [`telegram_manual_${trade.id}_${Date.now()}`],
      },
    });

    const executor = new TradeExecutor();
    const result = await executor.executeSignalForDeployment(
      signal.id,
      trade.deployment_id
    );

    if (result.success) {
      await prisma.telegram_trades.update({
        where: { id: tradeId },
        data: {
          status: "executed",
          executed_at: new Date(),
          signal_id: signal.id,
        },
      });

      if (result.positionId) {
        await prisma.positions.update({
          where: { id: result.positionId },
          data: {
            source: "telegram",
            manual_trade_id: tradeId,
          },
        });
      }

      await bot.sendMessage(
        chatId,
        `✅ Trade executed successfully!\n\n🔗 TX: https://arbiscan.io/tx/${result.txHash}\n\nType "status" to see your positions.`,
        { parse_mode: "Markdown" }
      );
    } else {
      await prisma.telegram_trades.update({
        where: { id: tradeId },
        data: {
          status: "failed",
          error_message: result.error || "Unknown error",
        },
      });

      await bot.sendMessage(
        chatId,
        `❌ Trade failed: ${result.error || "Unknown error"}`
      );
    }
  } catch (error: any) {
    console.error("[Telegram] Execute trade error:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

async function handleStatusCommand(chatId: number, deploymentId: string) {
  try {
    const positions = await prisma.positions.findMany({
      where: {
        deployment_id: deploymentId,
        source: "telegram",
        closed_at: null,
      },
      include: {
        signals: true,
      },
      orderBy: {
        opened_at: "desc",
      },
    });

    if (positions.length === 0) {
      await bot.sendMessage(
        chatId,
        '📊 No open manual positions.\n\nStart trading: "Buy 10 USDC of WETH"'
      );
      return;
    }

    let msg = `📊 *Your Manual Positions:*\n\n`;
    positions.forEach((pos, i) => {
      msg += `${i + 1}. ${pos.token_symbol} ${pos.side}\n`;
      msg += `   Qty: ${parseFloat(pos.qty.toString()).toFixed(4)}\n`;
      msg += `   Entry: $${parseFloat(pos.entry_price.toString()).toFixed(
        2
      )}\n`;
      msg += `   TX: ${pos.entry_tx_hash?.slice(0, 10)}...\n\n`;
    });

    msg += `To close: "Close my WETH"`;

    await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  } catch (error: any) {
    console.error("[Telegram] Status command error:", error);
    await bot.sendMessage(
      chatId,
      `❌ Error fetching positions: ${error.message}`
    );
  }
}

async function handleCloseCommand(
  chatId: number,
  telegramUser: any,
  token?: string
) {
  try {
    const positions = await prisma.positions.findMany({
      where: {
        deployment_id: telegramUser.deployment_id,
        source: "telegram",
        closed_at: null,
        ...(token && { token_symbol: token }),
      },
    });

    if (positions.length === 0) {
      await bot.sendMessage(
        chatId,
        `❌ No open ${token || ""} positions found.`
      );
      return;
    }

    await bot.sendMessage(
      chatId,
      `⏳ Closing ${positions.length} position(s)...`
    );

    const executor = new TradeExecutor();
    let successCount = 0;
    const errors: string[] = [];

    for (const position of positions) {
      const result = await executor.closePosition(position.id);
      if (result.success) {
        successCount++;
      } else {
        errors.push(
          `${position.token_symbol}: ${result.error || "Unknown error"}`
        );
      }
    }

    let msg = `${successCount > 0 ? "✅" : "❌"} Closed ${successCount}/${
      positions.length
    } positions successfully!`;

    if (errors.length > 0) {
      msg += "\n\n❌ Errors:\n" + errors.map((e) => `• ${e}`).join("\n");
    }

    await bot.sendMessage(chatId, msg);
  } catch (error: any) {
    console.error("[Telegram] Close command error:", error);
    await bot.sendMessage(
      chatId,
      `❌ Error closing positions: ${error.message}`
    );
  }
}

/**
 * Handle Lazy Trading link - creates/updates telegram_alpha_user as lazy trader
 * This is called when user clicks a deep link with LT prefix code
 */
async function handleLazyTradingLink(
  message: any,
  telegramUserId: string,
  chatId: number,
  linkCode: string
) {
  try {
    console.log(
      "[Telegram] Processing Lazy Trading link:",
      linkCode,
      "for user:",
      telegramUserId
    );

    // Check if user already exists as telegram_alpha_user
    let alphaUser = await prisma.telegram_alpha_users.findUnique({
      where: { telegram_user_id: telegramUserId },
    });

    if (alphaUser) {
      // User exists - update to be a lazy trader
      if (!alphaUser.lazy_trader) {
        alphaUser = await prisma.telegram_alpha_users.update({
          where: { id: alphaUser.id },
          data: {
            lazy_trader: true,
            telegram_username:
              message.from.username || alphaUser.telegram_username,
            first_name: message.from.first_name || alphaUser.first_name,
            last_name: message.from.last_name || alphaUser.last_name,
            is_active: true,
            last_message_at: new Date(),
          },
        });
        console.log(
          "[Telegram] Updated existing alpha user as lazy trader:",
          alphaUser.id
        );
      } else {
        console.log(
          "[Telegram] User already registered as lazy trader:",
          alphaUser.id
        );
      }
    } else {
      // Create new alpha user as lazy trader
      alphaUser = await prisma.telegram_alpha_users.create({
        data: {
          telegram_user_id: telegramUserId,
          telegram_username: message.from.username || null,
          first_name: message.from.first_name || null,
          last_name: message.from.last_name || null,
          lazy_trader: true,
          is_active: true,
          impact_factor: 0.5,
          last_message_at: new Date(),
        },
      });
      console.log(
        "[Telegram] Created new lazy trader alpha user:",
        alphaUser.id
      );
    }

    // Send success message
    const displayName = alphaUser.telegram_username
      ? `@${alphaUser.telegram_username}`
      : alphaUser.first_name || "there";

    await bot.sendMessage(
      chatId,
      `✅ *Lazy Trading Connected!*\n\n` +
        `Hey ${displayName}! Your Telegram is now linked for Lazy Trading.\n\n` +
        `🔄 *Please return to the Maxxit website to complete setup:*\n` +
        `• Configure your trading preferences\n` +
        `• Approve Ostium delegation\n` +
        `• Set USDC allowance\n\n` +
        `Once setup is complete, you can send trading signals here:\n` +
        `• "Long ETH 5x" - Open a long position\n` +
        `• "Short BTC 3x" - Open a short position\n` +
        `• "Close ETH" - Close a position`,
      { parse_mode: "Markdown" }
    );
  } catch (error: any) {
    console.error("[Telegram] Error handling lazy trading link:", error);
    await bot.sendMessage(
      chatId,
      "❌ Error connecting your Telegram for Lazy Trading. Please try again from the Maxxit website."
    );
  }
}
