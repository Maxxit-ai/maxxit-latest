import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { classifyTweet } from '../../../lib/llm-classifier';

/**
 * Admin endpoint to classify all unclassified tweets
 * POST /api/admin/classify-all-tweets
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all unclassified tweets (or force re-classify all)
    // ONLY process tweets from ACTIVE accounts to prevent LLM credit waste
    const { forceAll } = req.query;
    
    // Get active account IDs
    const activeAccounts = await prisma.ct_accounts.findMany({
      where: { is_active: true },
      select: { id: true },
    });
    
    const activeAccountIds = activeAccounts.map(a => a.id);
    
    if (activeAccountIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active CT accounts found',
        processed: 0,
      });
    }
    
    const where: any = {
      ct_account_id: { in: activeAccountIds }, // ONLY active accounts
    };
    
    if (forceAll !== 'true') {
      where.is_signal_candidate = false; // Only unclassified
    }

    const unclassifiedTweets = await prisma.ct_posts.findMany({
      where,
      include: {
        ct_accounts: true,
      },
      orderBy: { tweet_created_at: 'desc' },
      take: 100, // Process up to 100 at a time
    });

    console.log(`[ClassifyAll] Found ${unclassifiedTweets.length} tweets to classify`);

    const results = [];
    let signalCount = 0;
    let nonSignalCount = 0;
    let errorCount = 0;

    for (const post of unclassifiedTweets) {
      try {
        const username = post.ct_accounts?.x_username || 'unknown';
        console.log(`[ClassifyAll] Classifying @${username}: "${post.tweet_text.substring(0, 60)}..."`);
        
        const classification = await classifyTweet(post.tweet_text);
        
        await prisma.ct_posts.update({
          where: { id: post.id },
          data: {
            is_signal_candidate: classification.isSignalCandidate,
            extracted_tokens: classification.extractedTokens,
          },
        });

        if (classification.isSignalCandidate) {
          signalCount++;
          console.log(`[ClassifyAll] ✅ SIGNAL: ${classification.extractedTokens.join(', ')} - ${classification.sentiment} (${classification.confidence.toFixed(2)})`);
        } else {
          nonSignalCount++;
          console.log(`[ClassifyAll] ❌ Not a signal`);
        }

        results.push({
          tweetId: post.tweet_id,
          tweetText: post.tweet_text.substring(0, 80),
          username: post.ct_accounts?.x_username,
          isSignalCandidate: classification.isSignalCandidate,
          extractedTokens: classification.extractedTokens,
          sentiment: classification.sentiment,
          confidence: classification.confidence,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        console.error(`[ClassifyAll] Error classifying ${post.id}:`, error);
        errorCount++;
      }
    }

    return res.status(200).json({
      success: true,
      processed: unclassifiedTweets.length,
      signalCount,
      nonSignalCount,
      errorCount,
      results,
      message: `Classified ${unclassifiedTweets.length} tweets: ${signalCount} signals, ${nonSignalCount} non-signals`,
    });
  } catch (error: any) {
    console.error('[ClassifyAll] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to classify tweets',
    });
  }
}
