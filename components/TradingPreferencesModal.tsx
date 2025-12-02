/**
 * Trading Preferences Modal - Agent HOW Configuration
 * 
 * Allows users to personalize their trading behavior by setting preferences
 * These preferences adjust position sizing weights (Agent HOW layer)
 */

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface TradingPreferencesModalProps {
  userWallet: string;
  onClose: () => void;
  onSave?: () => void;
}

export function TradingPreferencesModal({
  userWallet,
  onClose,
  onSave,
}: TradingPreferencesModalProps) {
  const [preferences, setPreferences] = useState({
    risk_tolerance: 50,
    trade_frequency: 50,
    social_sentiment_weight: 50,
    price_momentum_focus: 50,
    market_rank_priority: 50,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadPreferences();
  }, [userWallet]);

  const loadPreferences = async () => {
    try {
      const response = await fetch(`/api/user/trading-preferences?wallet=${userWallet}`);
      if (response.ok) {
        const data = await response.json();
        if (data.preferences) {
          setPreferences(data.preferences);
        }
      }
    } catch (err) {
      console.error('Error loading preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/user/trading-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWallet,
          preferences,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      if (onSave) {
        onSave();
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getLabel = (value: number) => {
    if (value < 33) return 'Low';
    if (value < 67) return 'Medium';
    return 'High';
  };

  const getMomentumLabel = (value: number) => {
    if (value < 33) return 'Contrarian';
    if (value < 67) return 'Balanced';
    return 'Momentum';
  };

  const getFrequencyLabel = (value: number) => {
    if (value < 33) return 'Patient';
    if (value < 67) return 'Moderate';
    return 'Active';
  };

  const getRankLabel = (value: number) => {
    if (value < 33) return 'Any Coin';
    if (value < 67) return 'Balanced';
    return 'Top Only';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Trading Preferences</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Personalize your trading strategy (Agent HOW)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading preferences...</p>
            </div>
          ) : (
            <>
              {/* Risk Tolerance */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Risk Tolerance</h3>
                    <p className="text-sm text-muted-foreground">
                      How aggressive do you want your position sizing?
                    </p>
                  </div>
                  <span className="text-lg font-bold text-primary">
                    {getLabel(preferences.risk_tolerance)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-20">Conservative</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={preferences.risk_tolerance}
                    onChange={(e) =>
                      setPreferences({ ...preferences, risk_tolerance: parseInt(e.target.value) })
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground w-20 text-right">Aggressive</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {preferences.risk_tolerance < 33 && 'Smaller positions (0.5-3% of balance)'}
                  {preferences.risk_tolerance >= 33 && preferences.risk_tolerance < 67 && 'Moderate positions (2-7% of balance)'}
                  {preferences.risk_tolerance >= 67 && 'Larger positions (5-10% of balance)'}
                </p>
              </div>

              {/* Trade Frequency */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Trade Frequency</h3>
                    <p className="text-sm text-muted-foreground">
                      How often do you want to take trades?
                    </p>
                  </div>
                  <span className="text-lg font-bold text-primary">
                    {getFrequencyLabel(preferences.trade_frequency)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-20">Patient</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={preferences.trade_frequency}
                    onChange={(e) =>
                      setPreferences({ ...preferences, trade_frequency: parseInt(e.target.value) })
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground w-20 text-right">Active</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {preferences.trade_frequency < 33 && 'Only take high-confidence signals (>60% confidence)'}
                  {preferences.trade_frequency >= 33 && preferences.trade_frequency < 67 && 'Take moderate-confidence signals (>40% confidence)'}
                  {preferences.trade_frequency >= 67 && 'Take most signals, including lower confidence'}
                </p>
              </div>

              {/* Social Sentiment Weight */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Social Sentiment Impact</h3>
                    <p className="text-sm text-muted-foreground">
                      How much should social media sentiment matter?
                    </p>
                  </div>
                  <span className="text-lg font-bold text-primary">
                    {getLabel(preferences.social_sentiment_weight)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-20">Ignore</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={preferences.social_sentiment_weight}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        social_sentiment_weight: parseInt(e.target.value),
                      })
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground w-20 text-right">Follow</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {preferences.social_sentiment_weight < 33 && 'Social sentiment has minimal impact on position sizing'}
                  {preferences.social_sentiment_weight >= 33 && preferences.social_sentiment_weight < 67 && 'Balanced consideration of social signals'}
                  {preferences.social_sentiment_weight >= 67 && 'Strong weight on social media buzz and sentiment'}
                </p>
              </div>

              {/* Price Momentum Focus */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Price Momentum Strategy</h3>
                    <p className="text-sm text-muted-foreground">
                      Follow trends or buy dips?
                    </p>
                  </div>
                  <span className="text-lg font-bold text-primary">
                    {getMomentumLabel(preferences.price_momentum_focus)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-20">Contrarian</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={preferences.price_momentum_focus}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        price_momentum_focus: parseInt(e.target.value),
                      })
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground w-20 text-right">Momentum</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {preferences.price_momentum_focus < 33 && 'Prefer buying dips and fading rallies (contrarian)'}
                  {preferences.price_momentum_focus >= 33 && preferences.price_momentum_focus < 67 && 'Balanced approach to price action'}
                  {preferences.price_momentum_focus >= 67 && 'Follow strong trends and momentum (trend following)'}
                </p>
              </div>

              {/* Market Rank Priority */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Market Cap Preference</h3>
                    <p className="text-sm text-muted-foreground">
                      Stick to established coins or explore smaller caps?
                    </p>
                  </div>
                  <span className="text-lg font-bold text-primary">
                    {getRankLabel(preferences.market_rank_priority)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-20">Any Coin</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={preferences.market_rank_priority}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        market_rank_priority: parseInt(e.target.value),
                      })
                    }
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground w-20 text-right">Top Only</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {preferences.market_rank_priority < 33 && 'Trade any token regardless of market cap'}
                  {preferences.market_rank_priority >= 33 && preferences.market_rank_priority < 67 && 'Slight preference for established tokens'}
                  {preferences.market_rank_priority >= 67 && 'Strong preference for top-ranked, liquid tokens'}
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-primary mb-2">💡 How This Works</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Your preferences adjust position sizing weights (Agent HOW)</li>
                  <li>• Combines with LLM classification (Agent WHAT) and LunarCrush data</li>
                  <li>• Creates a personalized "trade clone" matching your style</li>
                  <li>• All your deployed agents will use these preferences</li>
                </ul>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-semibold hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

