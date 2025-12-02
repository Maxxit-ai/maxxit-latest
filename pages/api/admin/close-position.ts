/**
 * Close Position API
 * Manually close an open position
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createTradeExecutor } from '../../../lib/trade-executor';

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
        error: 'Missing required field: positionId',
      });
    }

    const executor = createTradeExecutor();
    const result = await executor.closePosition(positionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        reason: result.reason,
      });
    }

    return res.status(200).json({
      success: true,
      txHash: result.txHash,
      positionId: result.positionId,
      message: 'Position closed successfully',
    });
  } catch (error: any) {
    console.error('[ClosePosition] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to close position',
    });
  }
}
