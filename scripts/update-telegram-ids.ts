import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to manually update telegram_id for sources
 * 
 * Usage:
 *   npx tsx scripts/update-telegram-ids.ts
 * 
 * Or edit this file to add the chat IDs directly
 */

async function updateTelegramIds() {
  console.log('\n📝 Updating Telegram Chat IDs...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // EDIT THIS: Add your chat IDs here
  // Format: { username: 'chat_id' }
  // Chat IDs are usually negative numbers like: -1001234567890
  const chatIds: Record<string, string> = {
    'meetpaladiya4436': '', // Add chat ID here (e.g., '-1001234567890')
    'p_9899': '', // Add chat ID here (e.g., '-1001234567890')
  };

  console.log('📋 Chat IDs to update:');
  for (const [username, chatId] of Object.entries(chatIds)) {
    if (chatId) {
      console.log(`   @${username} → ${chatId}`);
    } else {
      console.log(`   @${username} → ❌ NOT SET`);
    }
  }
  console.log('');

  // Update sources
  for (const [username, chatId] of Object.entries(chatIds)) {
    if (!chatId) {
      console.log(`⏭️  Skipping @${username} (no chat ID provided)`);
      continue;
    }

    try {
      const source = await prisma.telegram_sources.findFirst({
        where: {
          telegram_username: username,
        },
      });

      if (!source) {
        console.log(`❌ Source not found: @${username}`);
        continue;
      }

      await prisma.telegram_sources.update({
        where: { id: source.id },
        data: { telegram_id: chatId },
      });

      console.log(`✅ Updated @${username} → ${chatId}`);
    } catch (error: any) {
      console.error(`❌ Error updating @${username}:`, error.message);
    }
  }

  // Show final status
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Current Sources:\n');

  const allSources = await prisma.telegram_sources.findMany({
    where: { is_active: true },
    select: {
      source_name: true,
      telegram_username: true,
      telegram_id: true,
      is_active: true,
    },
  });

  for (const source of allSources) {
    const status = source.telegram_id ? '✅' : '❌';
    console.log(`   ${status} ${source.source_name}`);
    console.log(`      Username: @${source.telegram_username || 'N/A'}`);
    console.log(`      ID: ${source.telegram_id || 'MISSING'}`);
    console.log(`      Active: ${source.is_active}`);
    console.log('');
  }

  const readySources = allSources.filter(s => s.telegram_id && s.is_active).length;
  console.log(`✅ ${readySources}/${allSources.length} sources ready for ingestion\n`);

  await prisma.$disconnect();
}

if (require.main === module) {
  updateTelegramIds().catch(console.error);
}

export { updateTelegramIds };


