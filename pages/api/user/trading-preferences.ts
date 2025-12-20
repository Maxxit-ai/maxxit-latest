/**
 * API: User Trading Preferences
 * 
 * GET: Retrieve user's trading preferences
 * POST: Save/update user's trading preferences
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getUserTradingPreferences,
  saveUserTradingPreferences,
  UserTradingPreferences,
} from '../../../lib/agent-how';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { wallet } = req.query;

      if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'Wallet address required' });
      }

      const preferences = await getUserTradingPreferences(wallet);

      return res.status(200).json({
        success: true,
        preferences,
      });
    } catch (error: any) {
      console.error('[TradingPreferences] GET error:', error);
      return res.status(500).json({
        error: error.message || 'Failed to fetch preferences',
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const { userWallet, preferences } = req.body;

      if (!userWallet) {
        return res.status(400).json({ error: 'User wallet required' });
      }

      if (!preferences) {
        return res.status(400).json({ error: 'Preferences required' });
      }

      // Validate preference values (0-100)
      const prefs: UserTradingPreferences = {
        risk_tolerance: Math.max(0, Math.min(100, preferences.risk_tolerance || 50)),
        trade_frequency: Math.max(0, Math.min(100, preferences.trade_frequency || 50)),
        social_sentiment_weight: Math.max(0, Math.min(100, preferences.social_sentiment_weight || 50)),
        price_momentum_focus: Math.max(0, Math.min(100, preferences.price_momentum_focus || 50)),
        market_rank_priority: Math.max(0, Math.min(100, preferences.market_rank_priority || 50)),
      };

      await saveUserTradingPreferences(userWallet, prefs);

      console.log('[TradingPreferences] Saved for user:', userWallet);

      return res.status(200).json({
        success: true,
        message: 'Preferences saved successfully',
        preferences: prefs,
      });
    } catch (error: any) {
      console.error('[TradingPreferences] POST error:', error);
      return res.status(500).json({
        error: error.message || 'Failed to save preferences',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

