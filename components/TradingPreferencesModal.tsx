/**
 * Trading Preferences Modal - Agent HOW Configuration
 * 
 * Allows users to personalize their trading behavior by setting preferences
 * These preferences adjust position sizing weights (Agent HOW layer)
 */

import { useState, useEffect } from 'react';
import { X, Activity } from 'lucide-react';

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

const SliderRow = ({
  title,
  helper,
  value,
  onChange,
  left,
  right,
  badge,
  description,
}: {
  title: string;
  helper: string;
  value: number;
  onChange: (val: number) => void;
  left: string;
  right: string;
  badge: string;
  description: string;
}) => (
  <div className="border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4 space-y-3 rounded">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-[var(--text-secondary)]">{helper}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--accent)] font-semibold">{badge}</span>
        <span className="px-3 py-1 border border-[var(--accent)]/60 text-sm font-mono text-[var(--accent)]">
          {value}
        </span>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--text-muted)] w-20">{left}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        onInput={(e) => onChange(parseInt((e.target as HTMLInputElement).value))}
        className="pref-slider flex-1 h-2 bg-[var(--border)]/70 rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
      />
      <span className="text-xs text-[var(--text-muted)] w-20 text-right">{right}</span>
    </div>
    <p className="text-xs text-[var(--text-secondary)]">{description}</p>
  </div>
);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-deep)] border border-[var(--accent)] max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b border-[var(--accent)] p-6 flex items-center justify-between">
          <div>
            <p className="data-label mb-2">AGENT HOW</p>
            <h2 className="font-display text-2xl text-[var(--accent)]">Trading Preferences</h2>
            <p className="text-sm text-[var(--text-secondary)]">Tune your sizing and filters</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 bg-[var(--bg-deep)]">
          {loading ? (
            <div className="text-center py-10 space-y-3">
              <Activity className="h-10 w-10 mx-auto text-[var(--accent)] animate-pulse" />
              <p className="text-sm text-[var(--text-muted)]">Loading preferences...</p>
            </div>
          ) : (
            <>
              <SliderRow
                title="Risk Tolerance"
                helper="How aggressive should sizing be?"
                value={preferences.risk_tolerance}
                onChange={(v) => setPreferences({ ...preferences, risk_tolerance: v })}
                left="Conservative"
                right="Aggressive"
                badge={getLabel(preferences.risk_tolerance)}
                description={
                  preferences.risk_tolerance < 33
                    ? 'Smaller positions (0.5-3% of balance)'
                    : preferences.risk_tolerance < 67
                    ? 'Moderate positions (2-7% of balance)'
                    : 'Larger positions (5-10% of balance)'
                }
              />

              <SliderRow
                title="Trade Frequency"
                helper="How often to take trades?"
                value={preferences.trade_frequency}
                onChange={(v) => setPreferences({ ...preferences, trade_frequency: v })}
                left="Patient"
                right="Active"
                badge={getFrequencyLabel(preferences.trade_frequency)}
                description={
                  preferences.trade_frequency < 33
                    ? 'Only high-confidence signals (>60%)'
                    : preferences.trade_frequency < 67
                    ? 'Moderate confidence (>40%)'
                    : 'Most signals, including lower confidence'
                }
              />

              <SliderRow
                title="Social Sentiment Impact"
                helper="Weight social media sentiment"
                value={preferences.social_sentiment_weight}
                onChange={(v) => setPreferences({ ...preferences, social_sentiment_weight: v })}
                left="Ignore"
                right="Follow"
                badge={getLabel(preferences.social_sentiment_weight)}
                description={
                  preferences.social_sentiment_weight < 33
                    ? 'Minimal impact on sizing'
                    : preferences.social_sentiment_weight < 67
                    ? 'Balanced consideration of social signals'
                    : 'Strong weight on social buzz'
                }
              />

              <SliderRow
                title="Price Momentum Strategy"
                helper="Trend follow or contrarian?"
                value={preferences.price_momentum_focus}
                onChange={(v) => setPreferences({ ...preferences, price_momentum_focus: v })}
                left="Contrarian"
                right="Momentum"
                badge={getMomentumLabel(preferences.price_momentum_focus)}
                description={
                  preferences.price_momentum_focus < 33
                    ? 'Prefer buying dips / fading rallies'
                    : preferences.price_momentum_focus < 67
                    ? 'Balanced approach to price action'
                    : 'Follow strong trends and momentum'
                }
              />

              <SliderRow
                title="Market Cap Preference"
                helper="Focus on large caps or any token"
                value={preferences.market_rank_priority}
                onChange={(v) => setPreferences({ ...preferences, market_rank_priority: v })}
                left="Any Coin"
                right="Top Only"
                badge={getRankLabel(preferences.market_rank_priority)}
                description={
                  preferences.market_rank_priority < 33
                    ? 'Trade any token regardless of market cap'
                    : preferences.market_rank_priority < 67
                    ? 'Slight preference for established tokens'
                    : 'Strong preference for top-ranked, liquid tokens'
                }
              />

              <div className="border border-[var(--accent)]/60 p-4 bg-[var(--accent)]/8">
                <p className="data-label mb-2">HOW THIS WORKS</p>
                <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                  <li>• Preferences adjust position sizing weights (Agent HOW)</li>
                  <li>• Combines with LLM classification and LunarCrush data</li>
                  <li>• Creates a personalized trade profile across deployments</li>
                </ul>
              </div>

              {error && (
                <div className="border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <style jsx>{`
        .pref-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 10px;
        }
        .pref-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: var(--accent);
          border: 2px solid var(--bg-deep);
          cursor: pointer;
          margin-top: -4px;
        }
        .pref-slider::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: var(--accent);
          border: 2px solid var(--bg-deep);
          cursor: pointer;
        }
        .pref-slider::-webkit-slider-runnable-track {
          height: 10px;
          border-radius: 9999px;
          background: var(--border);
        }
        .pref-slider::-moz-range-track {
          height: 10px;
          border-radius: 9999px;
          background: var(--border);
        }
      `}</style>
    </div>
  );
}

