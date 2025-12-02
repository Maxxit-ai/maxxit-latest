import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addTelegramSources() {
  console.log('\n📱 Adding Telegram Sources...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const sources = [
    {
      source_name: 'Meet Paladiya',
      telegram_username: 'meetpaladiya4436',
      source_type: 'CHANNEL' as const,
      description: 'Telegram channel: @meetpaladiya4436',
    },
    {
      source_name: 'P_9899',
      telegram_username: 'p_9899',
      source_type: 'CHANNEL' as const,
      description: 'Telegram channel: @p_9899',
    },
  ];

  for (const sourceData of sources) {
    try {
      // Check if source already exists
      const existing = await prisma.telegram_sources.findFirst({
        where: {
          OR: [
            { telegram_username: sourceData.telegram_username },
            { source_name: sourceData.source_name },
          ],
        },
      });

      if (existing) {
        console.log(`⚠️  Source already exists: ${sourceData.source_name}`);
        console.log(`   Username: ${sourceData.telegram_username}`);
        console.log(`   ID: ${existing.id}\n`);
        continue;
      }

      // Create new source
      const source = await prisma.telegram_sources.create({
        data: {
          source_name: sourceData.source_name,
          telegram_username: sourceData.telegram_username,
          source_type: sourceData.source_type,
          description: sourceData.description,
          is_active: true,
        },
      });

      console.log(`✅ Added Telegram source: ${source.source_name}`);
      console.log(`   Username: @${source.telegram_username}`);
      console.log(`   Type: ${source.source_type}`);
      console.log(`   ID: ${source.id}\n`);
    } catch (error: any) {
      console.error(`❌ Error adding ${sourceData.source_name}:`, error.message);
      if (error.code === 'P2002') {
        console.error(`   Source with this username or name already exists\n`);
      } else {
        console.error(`   ${error.message}\n`);
      }
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Summary:\n');

  // List all active sources
  const allSources = await prisma.telegram_sources.findMany({
    where: { is_active: true },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      source_name: true,
      telegram_username: true,
      source_type: true,
      is_active: true,
      created_at: true,
    },
  });

  console.log(`   Total active sources: ${allSources.length}\n`);
  for (const source of allSources) {
    console.log(`   • ${source.source_name} (@${source.telegram_username || 'N/A'})`);
    console.log(`     Type: ${source.source_type} | Active: ${source.is_active}`);
  }

  console.log('\n✅ Done!\n');
  await prisma.$disconnect();
}

if (require.main === module) {
  addTelegramSources().catch(console.error);
}

export { addTelegramSources };


