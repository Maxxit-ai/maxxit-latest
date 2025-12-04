/**
 * Script to manually add a Telegram alpha user for testing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addTelegramAlphaUser() {
  const username = 'abhidavinci';
  const telegramUserId = '123456789'; // Placeholder ID for testing
  
  console.log(`\n📱 Adding Telegram Alpha User: @${username}\n`);

  try {
    // Check if user already exists
    const existing = await prisma.telegram_alpha_users.findFirst({
      where: { telegram_username: username }
    });

    if (existing) {
      console.log('⚠️  User already exists!');
      console.log('   ID:', existing.id);
      console.log('   Username:', existing.telegram_username);
      console.log('   Created:', existing.created_at);
      
      // Add a new sample message for existing user
      console.log('\n📝 Adding additional sample message...\n');
      
      const post = await prisma.telegram_posts.create({
        data: {
          alpha_user_id: existing.id,
          source_id: null,
          message_id: `test_${Date.now()}`,
          message_text: '🔥 $ETH looking strong at $3500. Expecting breakout to $4000. Good entry point with tight stops.',
          message_created_at: new Date(),
          sender_id: telegramUserId,
          sender_username: username,
          is_signal_candidate: true,
          extracted_tokens: ['ETH'],
          confidence_score: 0.82,
          signal_type: 'LONG',
          processed_for_signals: false,
        }
      });
      
      console.log('✅ Additional Message Created!\n');
      console.log('   Message ID:', post.id);
      console.log('   Tokens:', post.extracted_tokens);
      
      return;
    }

    // Create the user
    const alphaUser = await prisma.telegram_alpha_users.create({
      data: {
        telegram_user_id: telegramUserId,
        telegram_username: username,
        first_name: 'Abhi',
        last_name: 'Davinci',
        impact_factor: 0.7, // Higher impact for testing
        is_active: true,
        last_message_at: new Date(),
        created_at: new Date(),
      }
    });

    console.log('✅ Telegram Alpha User Created!\n');
    console.log('   ID:', alphaUser.id);
    console.log('   Username: @' + alphaUser.telegram_username);
    console.log('   Name:', alphaUser.first_name, alphaUser.last_name);
    console.log('   Impact Factor:', alphaUser.impact_factor);
    console.log('   Active:', alphaUser.is_active);

    // Add a sample message
    console.log('\n📝 Adding sample alpha message...\n');

    const post = await prisma.telegram_posts.create({
      data: {
        alpha_user_id: alphaUser.id,
        source_id: null,
        message_id: `test_${Date.now()}`,
        message_text: '🚀 $BTC breaking out above $90k! Strong momentum, targeting $95k. Consider longing with 3x leverage. Stop loss at $88k.',
        message_created_at: new Date(),
        sender_id: telegramUserId,
        sender_username: username,
        is_signal_candidate: true,
        extracted_tokens: ['BTC'],
        confidence_score: 0.85,
        signal_type: 'LONG',
        processed_for_signals: false,
      }
    });

    console.log('✅ Sample Message Created!\n');
    console.log('   Message ID:', post.id);
    console.log('   Tokens:', post.extracted_tokens);
    console.log('   Signal Type:', post.signal_type);
    console.log('   Confidence:', post.confidence_score);

    console.log('\n🎉 Test User Ready!\n');
    console.log('✨ You can now:');
    console.log('   1. Go to agent creation');
    console.log('   2. Navigate to Step 5 (Telegram Alpha)');
    console.log('   3. Select @abhidavinci');
    console.log('   4. Complete agent creation');
    console.log('   5. Run signal generator to see signals\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
addTelegramAlphaUser()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

