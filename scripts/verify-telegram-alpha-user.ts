/**
 * Verify telegram alpha user exists in database
 */

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();

async function verify() {
  console.log('\n🔍 Verifying Telegram Alpha User: @abhidavinci\n');

  try {
    const user = await prisma.telegram_alpha_users.findFirst({
      where: { telegram_username: 'abhidavinci' },
      include: {
        _count: {
          select: {
            telegram_posts: true,
            agent_telegram_users: true,
          }
        }
      }
    });

    if (!user) {
      console.log('❌ User not found in database');
      return;
    }

    console.log('✅ User Found!\n');
    console.log('   ID:', user.id);
    console.log('   Username: @' + user.telegram_username);
    console.log('   Name:', user.first_name, user.last_name);
    console.log('   Impact Factor:', user.impact_factor);
    console.log('   Active:', user.is_active);
    console.log('   Messages:', user._count.telegram_posts);
    console.log('   Agents Following:', user._count.agent_telegram_users);
    console.log('   Last Message:', user.last_message_at?.toISOString() || 'Never');

    // Check messages
    const messages = await prisma.telegram_posts.findMany({
      where: { alpha_user_id: user.id },
      orderBy: { message_created_at: 'desc' },
      take: 5,
    });

    if (messages.length > 0) {
      console.log('\n📝 Recent Messages:');
      messages.forEach((msg, i) => {
        console.log(`\n   ${i + 1}. ${msg.message_text.substring(0, 60)}...`);
        console.log('      Tokens:', msg.extracted_tokens.join(', '));
        console.log('      Signal:', msg.signal_type || 'N/A');
        console.log('      Confidence:', msg.confidence_score || 'N/A');
      });
    }

    console.log('\n✅ Verification Complete!\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verify()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

