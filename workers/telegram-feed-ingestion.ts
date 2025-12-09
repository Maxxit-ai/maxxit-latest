/**
 * Telegram Feed Ingestion Worker
 * Monitors selected Telegram channels/groups for alpha signals
 * Similar to tweet-ingestion-worker but for Telegram sources
 */

import { createLLMClassifier } from '../lib/llm-classifier';
import { prisma } from '../lib/prisma';
import fetch from 'node-fetch';

// Telegram Bot API configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
    title?: string;
    username?: string;
    type: string;
  };
  from?: {
    id: number;
    username?: string;
    first_name: string;
  };
  text?: string;
  date: number;
}

/**
 * Fetch recent messages from a Telegram channel/group
 */
async function getChannelMessages(chatId: string): Promise<TelegramMessage[]> {
  try {
    // Note: This requires bot to be admin of channel/group
    // For channels: use getUpdates with channel_post
    // For groups: use getUpdates with message
    
    const response = await fetch(`${TELEGRAM_API_BASE}/getUpdates`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }

    const data: any = await response.json();
    
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }

    // Filter updates for this specific chat
    const messages: TelegramMessage[] = [];
    for (const update of data.result) {
      const msg = update.channel_post || update.message;
      if (msg && String(msg.chat.id) === chatId && msg.text) {
        messages.push(msg);
      }
    }

    return messages;
  } catch (error: any) {
    console.error(`[Telegram] Error fetching messages for chat ${chatId}:`, error.message);
    return [];
  }
}

/**
 * Ingest messages from all active Telegram sources
 */
async function ingestTelegramMessages() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║        📱 TELEGRAM FEED INGESTION WORKER                     ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not configured. Skipping ingestion.');
    return;
  }

  try {
    // Get all active Telegram sources
    const sources = await prisma.telegram_sources.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'asc' },
    });

    console.log(`🔍 Found ${sources.length} active Telegram sources\n`);

    if (sources.length === 0) {
      console.log('ℹ️  No active Telegram sources to monitor.');
      console.log('   Add sources via: /api/admin/telegram-sources\n');
      return;
    }

    let totalProcessed = 0;
    let totalSignals = 0;

    const classifier = createLLMClassifier();

    // Process each source
    for (const source of sources) {
      try {
        console.log(`\n📍 Processing: ${source.source_name}`);
        console.log(`   Type: ${source.source_type}`);
        console.log(`   Username: @${source.telegram_username || 'N/A'}`);

        if (!source.telegram_id) {
          console.log(`   ⚠️  No telegram_id configured, skipping...`);
          continue;
        }

        // Fetch messages from this source
        const messages = await getChannelMessages(source.telegram_id);
        console.log(`   Found: ${messages.length} new messages`);

        let processedCount = 0;
        let signalCount = 0;

        // Process each message
        for (const msg of messages) {
          try {
            // Check if message already exists
            const messageKey = `${source.telegram_id}_${msg.message_id}`;
            const existingPost = await prisma.telegram_posts.findUnique({
              where: { message_id: messageKey },
            });

            if (existingPost) {
              continue; // Skip duplicates
            }

            if (!msg.text || msg.text.trim().length === 0) {
              continue; // Skip empty messages
            }

            console.log(`   Processing: "${msg.text.substring(0, 50)}..."`);

            // Classify ALL messages using LLM (no pre-filtering)
            const classification = await classifier.classifyTweet(msg.text);

            // Store message with classification
            await prisma.telegram_posts.create({
              data: {
                source_id: source.id,
                message_id: messageKey,
                message_text: msg.text,
                message_created_at: new Date(msg.date * 1000),
                sender_id: msg.from?.id ? String(msg.from.id) : null,
                sender_username: msg.from?.username || null,
                is_signal_candidate: classification.isSignalCandidate,
                extracted_tokens: classification.extractedTokens,
                confidence_score: classification.confidence,
                signal_type: classification.sentiment === 'bullish' ? 'LONG' : 
                             classification.sentiment === 'bearish' ? 'SHORT' : null,
              },
            });

            processedCount++;

            if (classification.isSignalCandidate) {
              signalCount++;
              console.log(`   ✅ Signal detected: ${classification.extractedTokens.join(', ')} - ${classification.sentiment}`);
            }

          } catch (msgError: any) {
            console.error(`   ❌ Error processing message ${msg.message_id}:`, msgError.message);
          }
        }

        // Update last_fetched_at
        await prisma.telegram_sources.update({
          where: { id: source.id },
          data: { last_fetched_at: new Date() },
        });

        totalProcessed += processedCount;
        totalSignals += signalCount;

        console.log(`   ✅ Processed: ${processedCount} messages`);
        console.log(`   📊 Signals: ${signalCount}`);

      } catch (sourceError: any) {
        console.error(`   ❌ Error processing source ${source.source_name}:`, sourceError.message);
      }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                   INGESTION COMPLETE                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`Total Messages Processed: ${totalProcessed}`);
    console.log(`Total Signals Detected:   ${totalSignals}\n`);

  } catch (error: any) {
    console.error('❌ Ingestion failed:', error);
    throw error;
  }
}

// Run worker if executed directly
if (require.main === module) {
  console.log('Starting Telegram Feed Ingestion Worker...\n');
  
  // Run immediately
  ingestTelegramMessages()
    .then(() => {
      console.log('✅ Ingestion completed successfully');
    })
    .catch(error => {
      console.error('❌ Ingestion failed:', error);
      process.exit(1);
    });

  // Then run every 5 minutes
  setInterval(() => {
    ingestTelegramMessages().catch(error => {
      console.error('Ingestion error:', error);
    });
  }, 5 * 60 * 1000);
}

export default ingestTelegramMessages;

