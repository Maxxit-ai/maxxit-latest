import type { NextApiRequest, NextApiResponse } from 'next';
import { TradeExecutor } from '../../../lib/trade-executor';

/**
 * Admin endpoint to execute a trade for a given signal
 * This calls the REAL TradeExecutor which executes on-chain
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { signalId } = req.body;

    if (!signalId || typeof signalId !== 'string') {
      return res.status(400).json({ error: 'signalId required in request body' });
    }

    console.log(`[ADMIN] Executing REAL trade for signal ${signalId}`);

    // Use the REAL TradeExecutor
    const executor = new TradeExecutor();
    const result = await executor.executeSignal(signalId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        reason: result.reason,
        executionSummary: result.executionSummary,
      });
    }

    console.log(`[ADMIN] Trade executed successfully:`, result);

    return res.status(200).json({
      success: true,
      txHash: result.txHash,
      positionId: result.positionId,
      message: 'Trade executed on-chain',
    });
  } catch (error: any) {
    console.error('[ADMIN] Trade execution error:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}