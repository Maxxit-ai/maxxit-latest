/**
 * Admin API: Retry Position Closing
 * Helps retry failed or stuck position closing transactions
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { TradeExecutor } from '../../../lib/trade-executor';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { positionId } = req.body;
    
    if (!positionId) {
      return res.status(400).json({
        error: 'Missing required parameter: positionId',
      });
    }

    console.log(`[Admin] Retrying close position for: ${positionId}`);
    
    // Use TradeExecutor to retry closing
    const executor = new TradeExecutor();
    const result = await executor.closePosition(positionId);
    
    if (result.success) {
      console.log(`[Admin] Position closed successfully: ${result.txHash}`);
      return res.status(200).json({
        success: true,
        message: 'Position closed successfully',
        txHash: result.txHash,
        positionId,
      });
    } else {
      console.error(`[Admin] Position close failed: ${result.error}`);
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to close position',
        positionId,
      });
    }
  } catch (error: any) {
    console.error('[Admin] Retry close position error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
}
