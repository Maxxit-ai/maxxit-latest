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

  // Handle /start command with deep link parameter (for Lazy Trading or Notifications)
  if (text.startsWith("/start ")) {
    const code = text.split(" ")[1]?.toUpperCase();

    // Check if this is a Lazy Trading link code (starts with "LT")
    if (code && code.startsWith("LT")) {
      await handleLazyTradingLink(message, telegramUserId, chatId, code);
      return;
    }

    // Check if this is a Notification link code (starts with "NTF_")
    if (code && code.startsWith("NTF_")) {
      await handleNotificationLink(message, telegramUserId, chatId, code);
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
        '👋 *Welcome to Maxxit Alpha Bot!*\n\n' +
        '💡 *Share Alpha:* Send me your trading insights and signals.\n' +
        '⚠️ _Note: Max 5 tokens per message. Excess tokens are ignored._\n\n' +
        'Agent creators can subscribe to your alpha!\n\n' +
        '📊 *Want to trade yourself?*\n' +
        '1. Create an agent at Maxxit\n' +
        '2. Deploy it\n' +
        '3. Use /link CODE to connect',
        { parse_mode: 'Markdown' }
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
        '🎉 *Welcome to Maxxit Alpha!*\n\n' +
        'Your trading insights are now live! Agent creators can subscribe to your signals.\n\n' +
        '⚠️ *Important Rule:*\n' +
        'Each message can contain a *maximum of 5 tokens*.\n' +
        'If you mention more than 5, only the first 5 tokens will be processed.\n\n' +
        '📊 Keep sharing quality alpha to build your reputation and following!',
        { parse_mode: 'Markdown' }
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
        impact_factor_flag: false,
        impact_factor: 0,
      },
    });

    console.log("[Alpha] Stored message (awaiting classification by worker)");

    // Give user feedback that message was received
    await bot.sendMessage(
      chatId,
      '✅ *Message received!*\n\n' +
      'Your alpha is being processed and will be available to agents following you shortly.\n\n' +
      '⚠️ _Note: Max 5 tokens processed per signal. Excess tokens will be ignored._ we will process the first 5 tokens in the message if there are more than 5.\n\n' + 
      'If you want to process more tokens, please send a new message with the additional tokens.\n\n' +
      'Thank you for sharing your alpha!',
      { parse_mode: 'Markdown' }
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

    let msg = `${successCount > 0 ? "✅" : "❌"} Closed ${successCount}/${positions.length
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
  let alphaUser;
  let userWallet: string | null = null;

  try {
    console.log(
      "[Telegram] Processing Lazy Trading link:",
      linkCode,
      "for user:",
      telegramUserId
    );

    // Look up the wallet address from the link code cache
    try {
      // Find non-expired cache entry
      const cacheEntry = await prisma.lazy_trading_link_cache.findFirst({
        where: {
          link_code: linkCode,
          expires_at: { gt: new Date() },
        },
        select: { user_wallet: true },
      });

      if (cacheEntry) {
        userWallet = cacheEntry.user_wallet.toLowerCase();
        console.log(
          "[Telegram] ✅ Found wallet from link code cache:",
          userWallet,
          "for linkCode:",
          linkCode
        );

        // Delete the cache entry after use (one-time use)
        try {
          await prisma.lazy_trading_link_cache.delete({
            where: { link_code: linkCode },
          });
          console.log(
            "[Telegram] Deleted used link code from cache:",
            linkCode
          );
        } catch (deleteError: any) {
          console.warn(
            "[Telegram] Failed to delete cache entry (non-critical):",
            deleteError.message
          );
        }
      } else {
        console.warn(
          "[Telegram] ⚠️ Link code not found in cache or expired:",
          linkCode
        );
        // Try to see if the code exists but expired
        const expiredEntry = await prisma.lazy_trading_link_cache.findUnique({
          where: { link_code: linkCode },
          select: { user_wallet: true, expires_at: true },
        });
        if (expiredEntry) {
          console.warn(
            "[Telegram] Link code exists but expired at:",
            expiredEntry.expires_at
          );
        }
      }
    } catch (cacheError: any) {
      console.error(
        "[Telegram] ❌ Error looking up link code cache:",
        cacheError.message,
        "Code:",
        cacheError.code,
        "linkCode:",
        linkCode
      );
      // Don't fail the whole operation - user can still be marked as lazy trader
      // but without wallet association
    }

    // Check if user already exists as telegram_alpha_user
    alphaUser = await prisma.telegram_alpha_users.findUnique({
      where: { telegram_user_id: telegramUserId },
    });

    if (alphaUser) {
      // User exists - check if they're already linked to a DIFFERENT wallet
      // This prevents the same Telegram from being connected to multiple wallets
      if (alphaUser.user_wallet && userWallet && alphaUser.user_wallet.toLowerCase() !== userWallet.toLowerCase()) {
        // Telegram is already connected to a different wallet - don't allow override
        console.warn(
          "[Telegram] ❌ Telegram already connected to different wallet!",
          "Telegram ID:", telegramUserId,
          "Existing wallet:", alphaUser.user_wallet,
          "Attempted wallet:", userWallet
        );

        // Format wallet addresses for display
        const existingWalletShort = `${alphaUser.user_wallet.slice(0, 6)}...${alphaUser.user_wallet.slice(-4)}`;

        await bot.sendMessage(
          chatId,
          `❌ *Connection Failed*\n\n` +
          `This Telegram account is already connected to a different wallet address (${existingWalletShort}).\n\n` +
          `Each Telegram account can only be linked to one wallet address for Lazy Trading.\n\n` +
          `*Options:*\n` +
          `• Use the original wallet to continue setup\n` +
          `• Use a different Telegram account for this wallet`,
          { parse_mode: "Markdown" }
        );
        return; // Exit without updating
      }

      // Safe to update - either wallet is same, or one of them is null
      // If we have a wallet from cache, use it (takes precedence)
      // Otherwise, keep existing wallet if it exists
      const walletToStore = userWallet || alphaUser.user_wallet;

      alphaUser = await prisma.telegram_alpha_users.update({
        where: { id: alphaUser.id },
        data: {
          lazy_trader: true,
          user_wallet: walletToStore, // Always set wallet (from cache or existing)
          telegram_username:
            message.from?.username || alphaUser.telegram_username,
          first_name: message.from?.first_name || alphaUser.first_name,
          last_name: message.from?.last_name || alphaUser.last_name,
          is_active: true,
          last_message_at: new Date(),
        },
      });
      console.log(
        "[Telegram] Updated existing alpha user as lazy trader:",
        alphaUser.id,
        "wallet:",
        walletToStore || "not set",
        userWallet ? "(from cache)" : "(existing)"
      );
    } else {
      // Create new alpha user as lazy trader with wallet
      // First, check if another telegram account is already linked to this wallet
      // (This prevents wallet from being linked to multiple telegram accounts)
      if (userWallet) {
        const existingWalletLink = await prisma.telegram_alpha_users.findFirst({
          where: {
            user_wallet: userWallet,
            lazy_trader: true,
          },
        });

        if (existingWalletLink) {
          console.warn(
            "[Telegram] ⚠️ Wallet already has a different telegram linked!",
            "Wallet:", userWallet,
            "Existing Telegram ID:", existingWalletLink.telegram_user_id,
            "New Telegram ID:", telegramUserId
          );

          // This is actually OK - a wallet can switch to a new telegram
          // But we should inform the user that the old connection will be replaced
          // For now, we'll allow this and just log it
        }
      }

      if (!userWallet) {
        console.warn(
          "[Telegram] Creating new lazy trader but no wallet from cache!",
          "linkCode:",
          linkCode
        );
      }

      alphaUser = await prisma.telegram_alpha_users.create({
        data: {
          telegram_user_id: telegramUserId,
          telegram_username: message.from?.username || null,
          first_name: message.from?.first_name || null,
          last_name: message.from?.last_name || null,
          lazy_trader: true,
          user_wallet: userWallet, // Set wallet from cache
          is_active: true,
          impact_factor: 0.5,
          last_message_at: new Date(),
        },
      });
      console.log(
        "[Telegram] Created new lazy trader alpha user:",
        alphaUser.id,
        "wallet:",
        userWallet || "not set (cache lookup may have failed)"
      );
    }

    // ========================================================================
    // AUTO-SETUP NOTIFICATIONS: When connecting for lazy trading, also enable
    // trade notifications so user doesn't need to connect separately
    // ========================================================================
    if (userWallet) {
      try {
        console.log(
          "[Telegram] Auto-enabling notifications for lazy trading user:",
          userWallet
        );

        // Check if notification entry already exists for this wallet
        const existingNotification =
          await prisma.user_telegram_notifications.findUnique({
            where: { user_wallet: userWallet.toLowerCase() },
          });

        if (existingNotification) {
          // Update existing entry with telegram details
          await prisma.user_telegram_notifications.update({
            where: { user_wallet: userWallet.toLowerCase() },
            data: {
              telegram_chat_id: chatId.toString(),
              telegram_user_id: telegramUserId,
              telegram_username: message.from?.username || null,
              is_active: true,
              linked_at: new Date(),
              link_code: null, // Clear any pending link code
            },
          });
          console.log(
            "[Telegram] ✅ Updated existing notification connection for lazy trader"
          );
        } else {
          // Create new notification entry
          await prisma.user_telegram_notifications.create({
            data: {
              user_wallet: userWallet.toLowerCase(),
              telegram_chat_id: chatId.toString(),
              telegram_user_id: telegramUserId,
              telegram_username: message.from?.username || null,
              is_active: true,
              linked_at: new Date(),
            },
          });
          console.log(
            "[Telegram] ✅ Created new notification connection for lazy trader"
          );
        }
      } catch (notificationError: any) {
        // Don't fail the lazy trading setup if notification setup fails
        // User can still connect notifications separately later
        console.error(
          "[Telegram] ⚠️ Failed to auto-enable notifications (non-critical):",
          notificationError.message
        );
      }
    }

    // Send success message - wrap in try-catch to handle desktop app issues
    // Note: Don't include @ symbol in markdown messages as it can cause parsing errors
    const displayName =
      alphaUser.telegram_username || alphaUser.first_name || "there";

    try {
      await bot.sendMessage(
        chatId,
        `✅ *Lazy Trading Connected!*\n\n` +
        `Hey ${displayName}! Your Telegram is now linked for Lazy Trading.\n\n` +
        `📱 *Trade notifications are also enabled* - you'll receive alerts when positions open or close.\n\n` +
        `🔄 *Please return to the Maxxit website to complete setup:*\n` +
        `• Configure your trading preferences\n` +
        `• Approve Ostium delegation\n` +
        `• Set USDC allowance\n\n` +
        `Once setup is complete, you can send trading signals here.\n`,
        { parse_mode: "Markdown" }
      );
    } catch (sendError: any) {
      // If sending message fails (e.g., desktop app issue), log but don't fail the whole operation
      console.error("[Telegram] Failed to send success message:", sendError);
      // Try sending a simpler message without markdown
      try {
        await bot.sendMessage(
          chatId,
          `✅ Lazy Trading Connected!\n\nHey ${displayName}! Your Telegram is now linked for Lazy Trading and trade notifications.\n\nPlease return to the Maxxit website to complete setup.`
        );
      } catch (simpleSendError) {
        console.error(
          "[Telegram] Failed to send simple message:",
          simpleSendError
        );
        // Data is already saved, so we can continue
      }
    }
  } catch (error: any) {
    console.error("[Telegram] Error handling lazy trading link:", error);
    console.error("[Telegram] Error details:", {
      message: error.message,
      stack: error.stack,
      telegramUserId,
      linkCode,
      chatId,
    });

    // Try to send error message - but don't fail if this also fails
    try {
      await bot.sendMessage(
        chatId,
        "❌ Error connecting your Telegram for Lazy Trading. Please try again from the Maxxit website."
      );
    } catch (sendError) {
      console.error(
        "[Telegram] Failed to send error message to user:",
        sendError
      );
    }
  }
}

/**
 * Handle Notification link - connects telegram for trade notifications
 * This is called when user clicks a deep link with NTF_ prefix code
 * (Previously handled by separate telegram-notifications/webhook.ts)
 */
async function handleNotificationLink(
  message: any,
  telegramUserId: string,
  chatId: number,
  linkCode: string
) {
  try {
    console.log(
      "[Telegram] Processing Notification link:",
      linkCode,
      "for user:",
      telegramUserId
    );

    // Find user by link code
    const pendingLink = await prisma.user_telegram_notifications.findFirst({
      where: {
        link_code: linkCode,
        is_active: false,
      },
    });

    if (!pendingLink) {
      await bot.sendMessage(
        chatId,
        "❌ Invalid or expired link code. Please generate a new link from the Maxxit platform.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Check if this Telegram account is already linked to another wallet
    const existingLink = await prisma.user_telegram_notifications.findUnique({
      where: { telegram_chat_id: chatId.toString() },
    });

    if (existingLink && existingLink.user_wallet !== pendingLink.user_wallet) {
      await bot.sendMessage(
        chatId,
        "⚠️ This Telegram account is already linked to another wallet. Please disconnect first or use a different Telegram account.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Update the pending link with actual Telegram details
    await prisma.user_telegram_notifications.update({
      where: { id: pendingLink.id },
      data: {
        telegram_chat_id: chatId.toString(),
        telegram_user_id: telegramUserId,
        telegram_username: message.from?.username || null,
        is_active: true,
        linked_at: new Date(),
        link_code: null, // Clear link code after successful link
      },
    });

    console.log(
      `[Telegram Notifications] ✅ Linked user ${pendingLink.user_wallet
      } to Telegram @${message.from?.username || telegramUserId}`
    );

    await bot.sendMessage(
      chatId,
      `✅ *Successfully Connected!*\n\n` +
      `Your Telegram account is now linked to your Maxxit wallet.\n\n` +
      `You will receive notifications for:\n` +
      `• New positions opened\n` +
      `• Updates on your trades\n\n`,
      { parse_mode: "Markdown" }
    );
  } catch (error: any) {
    console.error("[Telegram] Error handling notification link:", error);
    console.error("[Telegram] Error details:", {
      message: error.message,
      stack: error.stack,
      telegramUserId,
      linkCode,
      chatId,
    });

    // Try to send error message
    try {
      await bot.sendMessage(
        chatId,
        "❌ Error connecting your Telegram for notifications. Please try again from the Maxxit platform."
      );
    } catch (sendError) {
      console.error(
        "[Telegram] Failed to send error message to user:",
        sendError
      );
    }
  }
}
