import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { classifyTweet } from '../../../lib/llm-classifier';

/**
 * Admin endpoint to manually test tweet classification
 * 
 * POST /api/admin/classify-tweet
 * Body: { "tweetText": "..." }
 * 
 * OR
 * 
 * POST /api/admin/classify-tweet?ctPostId=xxx
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let tweetText: string;
    let ctPostId: string | undefined;

    // Option 1: Classify existing ct_post
    if (req.query.ctPostId) {
      ctPostId = req.query.ctPostId as string;
      
      const post = await prisma.ctPost.findUnique({
        where: { id: ctPostId },
      });

      if (!post) {
        return res.status(404).json({ error: 'CT post not found' });
      }

      tweetText = post.tweetText;
    }
    // Option 2: Classify provided tweet text
    else if (req.body.tweetText) {
      tweetText = req.body.tweetText;
    }
    else {
      return res.status(400).json({ 
        error: 'Either ctPostId query param or tweetText in body is required',
        usage: {
          option1: 'POST /api/admin/classify-tweet?ctPostId=xxx',
          option2: 'POST /api/admin/classify-tweet with body: { "tweetText": "..." }',
        },
      });
    }

    console.log(`[ClassifyTweet] Classifying: "${tweetText.substring(0, 100)}..."`);

    // Classify using LLM
    const classification = await classifyTweet(tweetText);

    console.log(`[ClassifyTweet] Result: isSignal=${classification.isSignalCandidate}, sentiment=${classification.sentiment}, confidence=${classification.confidence}, tokens=${classification.extractedTokens.join(', ')}`);

    // If we're classifying an existing post, update it
    if (ctPostId) {
      await prisma.ctPost.update({
        where: { id: ctPostId },
        data: {
          isSignalCandidate: classification.isSignalCandidate,
          extractedTokens: classification.extractedTokens,
        },
      });

      console.log(`[ClassifyTweet] Updated ct_post ${ctPostId}`);
    }

    return res.status(200).json({
      success: true,
      tweetText: tweetText.substring(0, 200) + (tweetText.length > 200 ? '...' : ''),
      classification: {
        isSignalCandidate: classification.isSignalCandidate,
        extractedTokens: classification.extractedTokens,
        sentiment: classification.sentiment,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      },
      updated: !!ctPostId,
      ctPostId,
    });
  } catch (error: any) {
    console.error('[ClassifyTweet] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to classify tweet',
    });
  }
}

