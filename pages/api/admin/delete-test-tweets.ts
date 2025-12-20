import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
/**
 * DELETE /api/admin/delete-test-tweets
 * Removes all test tweets with IDs starting with "test_"
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[DeleteTestTweets] Starting cleanup...');
    
    // Delete ALL fake tweets:
    // 1. Test tweets: test_*
    // 2. Mock tweets: contain underscores (format: timestamp_uuid_number)
    // Real Twitter IDs are numeric only (e.g., "1983520353801691336")
    
    const result = await prisma.ctPost.deleteMany({
      where: {
        OR: [
          { tweetId: { startsWith: 'test_' } },
          { tweetId: { contains: '_' } }  // Catches mock tweets with underscores
        ]
      }
    });
    
    console.log(`[DeleteTestTweets] Deleted ${result.count} fake tweet(s)`);
    
    return res.status(200).json({
      success: true,
      deleted: result.count,
      message: `Deleted ${result.count} fake tweet(s) (test + mock)`
    });
    
  } catch (error: any) {
    console.error('[DeleteTestTweets] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

