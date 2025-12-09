/**
 * Tweet Ingestion Worker
 * Fetches tweets from X API and stores them in the database
 * Runs every 6 hours
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { createMultiMethodXApiClient } from '../lib/x-api-multi';
import { classifyTweet } from '../lib/llm-classifier';

async function ingestTweets() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📥 TWEET INGESTION WORKER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`[DEBUG] GAME_API_KEY: ${process.env.GAME_API_KEY ? process.env.GAME_API_KEY.substring(0,10)+'...' : 'NOT SET'}`);
  console.log(`[DEBUG] Prisma models available:`, Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')).sort());
  console.log();

  try {
    // Get only active CT accounts (optimized to reduce API calls)
    const accounts = await prisma.ct_accounts.findMany({
      where: { is_active: true }
    });

    if (accounts.length === 0) {
      console.log('⚠️  No active CT accounts found. Set is_active=true for accounts to monitor.');
      return;
    }

    console.log(`📋 Found ${accounts.length} active CT account(s) to process\n`);

    // Check if Twitter proxy is available before creating client
    const TWITTER_PROXY_URL = process.env.TWITTER_PROXY_URL || 'http://localhost:5002';
    let xApiClient = null;
    try {
      console.log(`Checking Twitter proxy at: ${TWITTER_PROXY_URL}`);
      const proxyCheck = await fetch(`${TWITTER_PROXY_URL}/health`, { 
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      if (proxyCheck.ok) {
        const healthData = await proxyCheck.json();
        console.log(`✅ Twitter proxy is available (client: ${healthData.client_initialized ? 'ready' : 'not initialized'})\n`);
        xApiClient = createMultiMethodXApiClient();
      } else {
        console.log('⚠️  Twitter proxy not responding - will process existing tweets\n');
      }
    } catch (error: any) {
      console.log(`⚠️  Twitter proxy not available (${error.message}) - will process existing tweets\n`);
    }

    const results = [];

    for (const account of accounts) {
      console.log(`[${account.x_username}] Processing...`);
      
      let tweets: Array<{ tweetId: string; tweetText: string; tweetCreatedAt: Date }> = [];
      
      // Try to fetch from X API (Python proxy with GAME API) only if client is available
      if (xApiClient) {
        try {
          // Get the last tweet we've seen for this account
          const lastTweet = await prisma.ct_posts.findFirst({
            where: { ct_account_id: account.id },
            orderBy: { tweet_created_at: 'desc' },
          });

          console.log(`[${account.x_username}] Fetching tweets from X API...`);
          if (lastTweet) {
            console.log(`[${account.x_username}] Last seen: ${lastTweet.tweet_id}`);
          }

          const xTweets = await xApiClient.getUserTweets(account.x_username, {
            maxResults: 15, // Optimized: reduced from 50 (most users don't tweet that much)
            sinceId: lastTweet?.tweetId,
          });

          tweets = xTweets.map(tweet => ({
            tweetId: tweet.id,
            tweetText: tweet.text,
            tweetCreatedAt: new Date(tweet.created_at),
          }));

          console.log(`[${account.x_username}] ✅ Fetched ${tweets.length} tweets from X API`);
        } catch (error: any) {
          console.log(`[${account.x_username}] ⚠️  X API error:`, error.message);
          console.log(`[${account.x_username}] No new tweets fetched - will process existing tweets from database`);
          tweets = []; // No new tweets, will process existing ones
        }
      } else {
        // X API client not initialized (proxy not available)
        console.log(`[${account.x_username}] No new tweets - processing existing tweets from database`);
        tweets = [];
      }

      // Create posts in database
      let createdCount = 0;
      let skippedCount = 0;

      for (const tweet of tweets) {
        try {
          // Check if tweet already exists beefore calling LLM
          const existingTweet = await prisma.ct_posts.findUnique({
            where: { tweet_id: tweet.tweetId },
          });

          if (existingTweet) {
            console.log(`[${account.x_username}] ⏭️  Tweet already classified, skipping: "${tweet.tweetText.substring(0, 30)}..."`);
            skippedCount++;
            continue;
          }

          // Quick pre-filter: Skip obvious non-signals to save LLM API calls
          const hasToken = /\$[A-Z]{2,10}\b|BTC|ETH|SOL|AVAX|ARB|OP|MATIC|LINK|UNI|AAVE/i.test(tweet.tweetText);
          const isShortNonSignal = tweet.tweetText.length < 30 && !hasToken;
          const isCommonChatter = /^(gm|gn|good morning|good night|hello|hi|hey|wagmi|lfg|lets go|thank you|thanks)$/i.test(tweet.tweetText.trim());

          if (isShortNonSignal || isCommonChatter) {
            console.log(`[${account.x_username}] ⏭️  Skipping obvious non-signal: "${tweet.tweetText.substring(0, 30)}..."`);
            // Still save it but mark as not a signal candidate
            await prisma.ct_posts.create({
              data: {
                ct_account_id: account.id,
                tweet_id: tweet.tweetId,
                tweet_text: tweet.tweetText,
                tweet_created_at: tweet.tweetCreatedAt,
                is_signal_candidate: false,
                extracted_tokens: [],
              },
            });
            createdCount++;
            continue;
          }

          // Classify tweet using LLM (only if it passes pre-filter AND doesn't exist)
          console.log(`[${account.x_username}] Classifying tweet: "${tweet.tweetText.substring(0, 50)}..."`);
          const classification = await classifyTweet(tweet.tweetText);

          console.log(`[${account.x_username}] → Signal: ${classification.isSignalCandidate}, Tokens: ${classification.extractedTokens.join(', ') || 'none'}, Sentiment: ${classification.sentiment}`);

          // Create post with classification
          await prisma.ct_posts.create({
            data: {
              ct_account_id: account.id,
              tweet_id: tweet.tweetId,
              tweet_text: tweet.tweetText,
              tweet_created_at: tweet.tweetCreatedAt,
              is_signal_candidate: classification.isSignalCandidate,
              extracted_tokens: classification.extractedTokens,
            },
          });
          createdCount++;
        } catch (error: any) {
          if (error.code === 'P2002') {
            // Duplicate tweet, skip (edge case - shouldn't happen due to check above)
            skippedCount++;
          } else {
            console.error(`[${account.x_username}] Error creating post:`, error.message);
          }
        }
      }

      // Update last seen timestamp
      await prisma.ct_accounts.update({
        where: { id: account.id },
        data: { last_seen_at: new Date() },
      });

      results.push({
        accountId: account.id,
        username: account.x_username,
        fetched: tweets.length,
        created: createdCount,
        skipped: skippedCount,
      });

      console.log(`[${account.x_username}] ✅ ${createdCount} created, ${skippedCount} skipped\n`);
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  📊 INGESTION SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

    console.log(`Accounts processed: ${accounts.length}`);
    console.log(`Tweets fetched: ${totalFetched}`);
    console.log(`New posts created: ${totalCreated}`);
    console.log(`Duplicates skipped: ${totalSkipped}`);
    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return {
      success: true,
      processed: accounts.length,
      totalFetched,
      totalCreated,
      totalSkipped,
    };
  } catch (error: any) {
    console.error('\n❌ ERROR during tweet ingestion:', error);
    throw error;
  }
  // Note: Don't disconnect - using singleton
}

// Run if executed directly
if (require.main === module) {
  ingestTweets()
    .then(() => {
      console.log('✅ Tweet ingestion worker completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Tweet ingestion worker failed:', error);
      process.exit(1);
    });
}

export { ingestTweets };

