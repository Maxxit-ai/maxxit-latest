import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

async function resolveTelegramIds() {
  console.log('\n🔍 Resolving Telegram Chat IDs from Usernames...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not configured');
    console.error('   Set it in your .env file\n');
    process.exit(1);
  }

  // Get sources without telegram_id
  const sourcesWithoutId = await prisma.telegram_sources.findMany({
    where: {
      is_active: true,
      telegram_id: null,
      telegram_username: { not: null },
    },
    select: {
      id: true,
      source_name: true,
      telegram_username: true,
      source_type: true,
    },
  });

  if (sourcesWithoutId.length === 0) {
    console.log('✅ All sources already have telegram_id configured\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${sourcesWithoutId.length} source(s) without telegram_id:\n`);

  for (const source of sourcesWithoutId) {
    try {
      console.log(`📍 Resolving: ${source.source_name}`);
      console.log(`   Username: @${source.telegram_username}`);

      // Try to get chat info using getChat API
      // Note: Bot must be a member of the channel/group for this to work
      const username = source.telegram_username!.replace('@', '');
      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: `@${username}`,
          }),
        }
      );

      const data: any = await response.json();

      if (data.ok && data.result) {
        const chatId = String(data.result.id);
        console.log(`   ✅ Found Chat ID: ${chatId}`);

        // Update the source with the chat ID
        await prisma.telegram_sources.update({
          where: { id: source.id },
          data: { telegram_id: chatId },
        });

        console.log(`   ✅ Updated database\n`);
      } else {
        console.log(`   ⚠️  Could not resolve chat ID`);
        console.log(`   Error: ${data.description || 'Unknown error'}`);
        console.log(`   💡 Make sure the bot is added to the channel/group as admin`);
        console.log(`   💡 For public channels, try forwarding a message to @getidsbot\n`);
      }
    } catch (error: any) {
      console.error(`   ❌ Error resolving ${source.source_name}:`, error.message);
      console.log('');
    }
  }

  // Show final status
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Final Status:\n');

  const allSources = await prisma.telegram_sources.findMany({
    where: { is_active: true },
    select: {
      source_name: true,
      telegram_username: true,
      telegram_id: true,
    },
  });

  for (const source of allSources) {
    const status = source.telegram_id ? '✅' : '❌';
    console.log(`   ${status} ${source.source_name}`);
    console.log(`      Username: @${source.telegram_username || 'N/A'}`);
    console.log(`      ID: ${source.telegram_id || 'MISSING'}`);
    console.log('');
  }

  const missingIds = allSources.filter(s => !s.telegram_id).length;
  if (missingIds > 0) {
    console.log('⚠️  Some sources still missing telegram_id');
    console.log('   Options to get chat IDs:');
    console.log('   1. Add bot to channel/group and run this script again');
    console.log('   2. Forward a message from channel to @getidsbot');
    console.log('   3. Use @username_to_id_bot to get the ID');
    console.log('   4. Manually update via API: PATCH /api/admin/telegram-sources/:id\n');
  } else {
    console.log('✅ All sources have telegram_id configured!\n');
  }

  await prisma.$disconnect();
}

if (require.main === module) {
  resolveTelegramIds().catch(console.error);
}

export { resolveTelegramIds };









