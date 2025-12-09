import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { createMultiMethodXApiClient } from '../../../lib/x-api-multi';

/**
 * Admin endpoint to manually trigger tweet ingestion for a specific CT account or all accounts
 * GET /api/admin/ingest-tweets?ctAccountId=xxx
 * GET /api/admin/ingest-tweets (for all accounts)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ctAccountId } = req.query;

    // Get CT accounts to process (ONLY ACTIVE accounts to prevent LLM waste)
    let accounts;
    if (ctAccountId) {
      const account = await prisma.ctAccount.findUnique({
        where: { id: ctAccountId as string },
      });
      accounts = account ? [account] : [];
    } else {
      // ONLY process active accounts to prevent unnecessary LLM API calls
      accounts = await prisma.ctAccount.findMany({
        where: { is_active: true },
      });
    }

    if (accounts.length === 0) {
      return res.status(404).json({ 
        error: ctAccountId ? 'CT account not found' : 'No CT accounts found',
      });
    }

    const xApiClient = createMultiMethodXApiClient();
    const results = [];

    for (const account of accounts) {
      console.log(`[IngestTweets] Processing @${account.xUsername}...`);
      
      let tweets: Array<{ tweetId: string; tweetText: string; tweetCreatedAt: Date }> = [];
      
      // Try to fetch from X API (GAME API first, then bearer token)
      if (xApiClient) {
        try {
          // Get the last tweet we've seen for this account
          const lastTweet = await prisma.ctPost.findFirst({
            where: { ctAccountId: account.id },
            orderBy: { tweetCreatedAt: 'desc' },
          });

          const xTweets = await xApiClient.getUserTweets(account.xUsername, {
            maxResults: 50,
            sinceId: lastTweet?.tweetId,
          });

          tweets = xTweets.map(tweet => ({
            tweetId: tweet.id,
            tweetText: tweet.text,
            tweetCreatedAt: new Date(tweet.created_at),
          }));

          console.log(`[IngestTweets] Fetched ${tweets.length} tweets from X API for @${account.xUsername}`);
        } catch (error: any) {
          console.error(`[IngestTweets] X API error for @${account.xUsername}:`, error);
        }
      } else {
        // Use mock data if X API is not configured
        tweets = [
          {
            tweetId: `${Date.now()}_${account.id}_1`,
            tweetText: `$BTC breaking out! Strong momentum building. Time to accumulate? #Bitcoin`,
            tweetCreatedAt: new Date(),
          },
          {
            tweetId: `${Date.now()}_${account.id}_2`,
            tweetText: `$ETH looking bullish after breaking key resistance at $2,000. Next target $2,500.`,
            tweetCreatedAt: new Date(),
          },
        ];
        console.log(`[IngestTweets] Using mock tweets for @${account.xUsername}`);
      }

      // Create posts in database
      let createdCount = 0;
      let skippedCount = 0;

      for (const tweet of tweets) {
        try {
          await prisma.ctPost.create({
            data: {
              ctAccountId: account.id,
              tweetId: tweet.tweetId,
              tweetText: tweet.tweetText,
              tweetCreatedAt: tweet.tweetCreatedAt,
              isSignalCandidate: false,
              extractedTokens: [],
            },
          });
          createdCount++;
        } catch (error: any) {
          if (error.code === 'P2002') {
            // Duplicate tweet, skip
            skippedCount++;
          } else {
            console.error(`[IngestTweets] Error creating post:`, error);
          }
        }
      }

      // Update last seen timestamp
      await prisma.ctAccount.update({
        where: { id: account.id },
        data: { lastSeenAt: new Date() },
      });

      results.push({
        accountId: account.id,
        username: account.xUsername,
        fetched: tweets.length,
        created: createdCount,
        skipped: skippedCount,
      });

      console.log(`[IngestTweets] Completed @${account.xUsername}: ${createdCount} created, ${skippedCount} skipped`);
    }

    return res.status(200).json({
      success: true,
      processed: accounts.length,
      results,
      message: `Successfully ingested tweets from ${accounts.length} account(s)`,
    });
  } catch (error: any) {
    console.error('[IngestTweets] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to ingest tweets',
    });
  }
}

