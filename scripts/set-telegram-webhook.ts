/**
 * Set Telegram Webhook
 * 
 * Configures Telegram to send messages to your webhook endpoint
 * 
 * Usage:
 *   npx tsx scripts/set-telegram-webhook.ts <webhook-url>
 * 
 * Example:
 *   npx tsx scripts/set-telegram-webhook.ts https://your-app.railway.app/api/telegram/webhook
 *   npx tsx scripts/set-telegram-webhook.ts https://your-app.vercel.app/api/telegram/webhook
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.argv[2] || process.env.TELEGRAM_WEBHOOK_URL;

interface SetWebhookResponse {
  ok: boolean;
  result: boolean;
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

async function setTelegramWebhook() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║      🔗 TELEGRAM WEBHOOK SETUP                          ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (!BOT_TOKEN) {
    console.log('❌ TELEGRAM_BOT_TOKEN not found in .env file');
    console.log('\n💡 Add to .env:');
    console.log('   TELEGRAM_BOT_TOKEN=your-bot-token-here');
    return { success: false, error: 'Token missing' };
  }

  if (!WEBHOOK_URL) {
    console.log('❌ Webhook URL not provided');
    console.log('\n💡 Usage:');
    console.log('   npx tsx scripts/set-telegram-webhook.ts <webhook-url>');
    console.log('\n💡 Or set TELEGRAM_WEBHOOK_URL in .env');
    console.log('\n💡 Examples:');
    console.log('   https://your-app.railway.app/api/telegram/webhook');
    console.log('   https://your-app.vercel.app/api/telegram/webhook');
    console.log('   https://your-domain.com/api/telegram/webhook');
    return { success: false, error: 'Webhook URL missing' };
  }

  // Validate URL format
  try {
    new URL(WEBHOOK_URL);
  } catch (e) {
    console.log('❌ Invalid webhook URL format');
    console.log('   URL must start with https://');
    return { success: false, error: 'Invalid URL' };
  }

  // Must be HTTPS
  if (!WEBHOOK_URL.startsWith('https://')) {
    console.log('❌ Webhook URL must use HTTPS');
    console.log('   Telegram requires HTTPS for webhooks');
    return { success: false, error: 'URL must be HTTPS' };
  }

  console.log('🔑 Bot token: ' + BOT_TOKEN.substring(0, 10) + '...');
  console.log('🔗 Webhook URL: ' + WEBHOOK_URL);
  console.log('');

  try {
    // Check current webhook status
    console.log('📋 Step 1: Checking current webhook status...');
    const currentWebhookResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    const currentWebhook: WebhookInfo = await currentWebhookResponse.json();

    if (currentWebhook.ok && currentWebhook.result?.url) {
      console.log('   Current webhook: ' + currentWebhook.result.url);
      if (currentWebhook.result.url === WEBHOOK_URL) {
        console.log('   ✅ Webhook is already set to this URL');
      } else {
        console.log('   ⚠️  Webhook is set to a different URL');
      }
      
      if (currentWebhook.result.pending_update_count > 0) {
        console.log(`   ⚠️  ${currentWebhook.result.pending_update_count} pending updates`);
      }
      
      if (currentWebhook.result.last_error_message) {
        console.log('   ⚠️  Last error: ' + currentWebhook.result.last_error_message);
      }
    } else {
      console.log('   ℹ️  No webhook currently configured');
    }

    // Set new webhook
    console.log('\n📋 Step 2: Setting webhook...');
    const setWebhookResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          allowed_updates: ['message', 'callback_query'],
        }),
      }
    );

    const result: SetWebhookResponse = await setWebhookResponse.json();

    if (!result.ok) {
      console.log('❌ Failed to set webhook');
      console.log('   Error: ' + (result.description || 'Unknown error'));
      return { success: false, error: result.description };
    }

    console.log('✅ Webhook set successfully!');

    // Verify webhook
    console.log('\n📋 Step 3: Verifying webhook...');
    const verifyResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    const verifyInfo: WebhookInfo = await verifyResponse.json();

    if (verifyInfo.ok && verifyInfo.result) {
      const webhook = verifyInfo.result;
      console.log('✅ Webhook verified:');
      console.log('   URL: ' + webhook.url);
      console.log('   Pending updates: ' + webhook.pending_update_count);
      
      if (webhook.last_error_date) {
        const errorDate = new Date(webhook.last_error_date * 1000);
        console.log('   ⚠️  Last error: ' + errorDate.toISOString());
        console.log('   Error message: ' + webhook.last_error_message);
      } else {
        console.log('   ✅ No errors');
      }
    }

    // Test webhook
    console.log('\n📋 Step 4: Testing webhook...');
    console.log('   💡 Send a message to your bot now');
    console.log('   💡 Check your application logs for:');
    console.log('      [Telegram] Received update: ...');
    console.log('      [Telegram] Processing message from ...');

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║              ✅ WEBHOOK SETUP COMPLETE                   ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('Next Steps:');
    console.log('1. Send a message to your bot');
    console.log('2. Check your application logs for webhook requests');
    console.log('3. If no logs appear, check:');
    console.log('   - Is your app accessible at ' + WEBHOOK_URL + '?');
    console.log('   - Are there any firewall/security rules blocking requests?');
    console.log('   - Check Railway/Vercel logs for errors');

    return {
      success: true,
      webhookUrl: WEBHOOK_URL,
    };
  } catch (error: any) {
    console.error('\n❌ Error setting webhook:', error.message);
    return { success: false, error: error.message };
  }
}

// Run setup
if (require.main === module) {
  setTelegramWebhook()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ Webhook is ready!\n');
        process.exit(0);
      } else {
        console.log('\n❌ Webhook setup failed. Fix the issues above and try again.\n');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { setTelegramWebhook };
