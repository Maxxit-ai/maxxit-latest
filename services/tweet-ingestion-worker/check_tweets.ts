import { prisma } from '@maxxit/database';

async function checkTweets() {
  try {
    const tweets = await prisma.$queryRaw<any[]>`
      SELECT 
          cp.tweet_id,
          cp.tweet_text,
          cp.tweet_created_at,
          cp.is_signal_candidate,
          cp.extracted_tokens,
          cp.signal_type,
          cp.confidence_score,
          cp.processed_for_signals,
          cp.created_at as ingested_at
      FROM ct_posts cp
      JOIN ct_accounts ca ON cp.ct_account_id = ca.id
      WHERE ca.username = 'Abhishe42402615'
      ORDER BY cp.tweet_created_at DESC
      LIMIT 10
    `;
    
    console.log('\n📊 RECENT TWEETS FROM Abhishe42402615\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    if (!tweets || tweets.length === 0) {
      console.log('❌ No tweets found for Abhishe42402615\n');
    } else {
      tweets.forEach((tweet, idx) => {
        console.log(`\n[${idx + 1}] Tweet ID: ${tweet.tweet_id}`);
        console.log(`📅 Created: ${new Date(tweet.tweet_created_at).toLocaleString()}`);
        console.log(`📝 Text: ${tweet.tweet_text}`);
        console.log(`🎯 Signal Candidate: ${tweet.is_signal_candidate ? '✅ YES' : '❌ NO'}`);
        if (tweet.is_signal_candidate) {
          console.log(`   Tokens: ${tweet.extracted_tokens?.join(', ') || 'none'}`);
          console.log(`   Side: ${tweet.signal_type || 'unknown'}`);
          console.log(`   Confidence: ${tweet.confidence_score || 0}`);
          console.log(`   Processed for Signals: ${tweet.processed_for_signals ? '✅ YES' : '⏳ PENDING'}`);
        }
        console.log(`⏰ Ingested: ${new Date(tweet.ingested_at).toLocaleString()}`);
        console.log('───────────────────────────────────────────────────────────────');
      });
      console.log(`\n📊 Total: ${tweets.length} tweets\n`);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTweets();
