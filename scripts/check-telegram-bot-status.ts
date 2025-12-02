/**
 * Check Telegram Bot Status
 * 
 * Verifies:
 * - Bot token is valid
 * - Bot info (username, name)
 * - Webhook status
 * 
 * Run: npx tsx scripts/check-telegram-bot-status.ts
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface BotInfo {
  ok: boolean;
  result?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
    can_join_groups: boolean;
    can_read_all_group_messages: boolean;
    supports_inline_queries: boolean;
  };
  description?: string;
}

interface WebhookInfo {
  ok: boolean;
  result?: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    allowed_updates?: string[];
  };
}

async function checkTelegramBotStatus() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║      🤖 TELEGRAM BOT STATUS CHECK                        ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (!BOT_TOKEN) {
    console.log('❌ TELEGRAM_BOT_TOKEN not found in .env file');
    console.log('\n💡 Add to .env:');
    console.log('   TELEGRAM_BOT_TOKEN=your-bot-token-here');
    return { success: false, error: 'Token missing' };
  }

  console.log('🔑 Bot token found: ' + BOT_TOKEN.substring(0, 10) + '...\n');

  try {
    // Check bot info
    console.log('📋 Step 1: Checking Bot Info...');
    const botInfoResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getMe`
    );
    const botInfo: BotInfo = await botInfoResponse.json();

    if (!botInfo.ok) {
      console.log('❌ Invalid bot token or API error');
      console.log('   Error:', botInfo.description);
      return { success: false, error: botInfo.description };
    }

    const bot = botInfo.result!;
    console.log('✅ Bot is valid and active:');
    console.log(`   Bot ID: ${bot.id}`);
    console.log(`   Username: @${bot.username}`);
    console.log(`   Display Name: ${bot.first_name}`);
    console.log(`   Can join groups: ${bot.can_join_groups ? 'Yes' : 'No'}`);
    console.log(`   Can read group messages: ${bot.can_read_all_group_messages ? 'Yes' : 'No'}`);
    console.log(`   Supports inline queries: ${bot.supports_inline_queries ? 'Yes' : 'No'}`);

    // Check webhook status
    console.log('\n📋 Step 2: Checking Webhook Status...');
    const webhookResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    const webhookInfo: WebhookInfo = await webhookResponse.json();

    if (!webhookInfo.ok) {
      console.log('⚠️  Could not fetch webhook info');
    } else {
      const webhook = webhookInfo.result!;
      
      if (webhook.url) {
        console.log('✅ Webhook is configured:');
        console.log(`   URL: ${webhook.url}`);
        console.log(`   Pending updates: ${webhook.pending_update_count}`);
        
        if (webhook.last_error_date) {
          const errorDate = new Date(webhook.last_error_date * 1000);
          console.log(`   ⚠️  Last error: ${errorDate.toISOString()}`);
          console.log(`   Error message: ${webhook.last_error_message}`);
        } else {
          console.log('   ✅ No recent errors');
        }
      } else {
        console.log('⚠️  No webhook configured (using polling)');
        console.log('   This is OK for testing, but webhook is recommended for production');
      }
    }

    // Check for recent updates
    console.log('\n📋 Step 3: Checking Recent Updates...');
    const updatesResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=5`
    );
    const updatesData: any = await updatesResponse.json();

    if (updatesData.ok && updatesData.result.length > 0) {
      console.log(`✅ Found ${updatesData.result.length} recent update(s):`);
      for (const update of updatesData.result) {
        if (update.message) {
          const msg = update.message;
          const from = msg.from;
          const text = msg.text || '[media]';
          console.log(`   - From @${from.username || from.first_name}: "${text.substring(0, 50)}..."`);
          console.log(`     Chat ID: ${msg.chat.id}`);
          console.log(`     Date: ${new Date(msg.date * 1000).toISOString()}`);
        }
      }
    } else {
      console.log('⚠️  No recent messages/updates found');
      console.log('   Send a message to your bot to test');
    }

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  ✅ BOT STATUS: HEALTHY                   ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('Bot Details:');
    console.log(`  Username: @${bot.username}`);
    console.log(`  Bot Link: https://t.me/${bot.username}`);
    
    console.log('\n💡 How to Test:');
    console.log(`  1. Open Telegram and search for @${bot.username}`);
    console.log('  2. Start a chat with /start');
    console.log('  3. Send a trading signal:');
    console.log('     "ETH breaking $3500! Going LONG 🚀"');
    console.log('  4. Run this script again to see the update');

    console.log('\n💡 To Process Messages:');
    console.log('  1. Make sure user is registered as alpha provider:');
    console.log('     npx tsx scripts/add-telegram-alpha-user.ts <username>');
    console.log('  2. Start the Telegram worker:');
    console.log('     npm run dev:telegram-worker');
    console.log('  3. Worker will process messages every 2 minutes');

    return {
      success: true,
      bot: {
        id: bot.id,
        username: bot.username,
        name: bot.first_name,
      },
      webhook: webhookInfo.result,
    };
  } catch (error: any) {
    console.error('\n❌ Error checking bot status:', error.message);
    return { success: false, error: error.message };
  }
}

// Run check
if (require.main === module) {
  checkTelegramBotStatus()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ Bot is ready to receive messages!\n');
        process.exit(0);
      } else {
        console.log('\n❌ Bot check failed. Fix the issues above and try again.\n');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { checkTelegramBotStatus };

