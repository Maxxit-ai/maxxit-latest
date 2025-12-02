import type { NextApiRequest, NextApiResponse } from 'next';
import ingestTelegramMessages from '../../../workers/telegram-feed-ingestion';

/**
 * Admin API to manually trigger Telegram message ingestion
 * 
 * POST /api/admin/ingest-telegram
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[ADMIN] Manual Telegram ingestion triggered');
    
    await ingestTelegramMessages();
    
    return res.status(200).json({ 
      success: true, 
      message: 'Telegram message ingestion completed' 
    });
  } catch (error: any) {
    console.error('[ADMIN] Telegram ingestion error:', error);
    return res.status(500).json({ error: error.message });
  }
}

