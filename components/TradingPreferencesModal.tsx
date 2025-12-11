/**
 * Trading Preferences Modal - Agent HOW Configuration
 * 
 * Allows users to personalize their trading behavior by setting preferences
 * These preferences adjust position sizing weights (Agent HOW layer)
 */

import { useState, useEffect } from 'react';
import { X, Activity } from 'lucide-react';
import * as Slider from '@radix-ui/react-slider';

export interface TradingPreferences {
  risk_tolerance: number;
  trade_frequency: number;
  social_sentiment_weight: number;
  price_momentum_focus: number;
  market_rank_priority: number;
}

interface TradingPreferencesModalProps {
  userWallet: string;
  onClose: () => void;
  onSave?: () => void;
  /**
   * If true, preferences are returned via onSaveLocal instead of being saved to API.
   * Used when we want to collect preferences but save them later (e.g., after approvals)
   */
  localOnly?: boolean;
  /**
   * Callback when localOnly is true - returns preferences without saving to API
   */
  onSaveLocal?: (preferences: TradingPreferences) => void;
  /**
   * Initial preferences to pre-populate the form
   */
  initialPreferences?: TradingPreferences;
}

export function TradingPreferencesModal({
  userWallet,
  onClose,
  onSave,
  localOnly = false,
  onSaveLocal,
  initialPreferences,
}: TradingPreferencesModalProps) {
  const [preferences, setPreferences] = useState<TradingPreferences>(
    initialPreferences || {
      risk_tolerance: 50,
      trade_frequency: 50,
      social_sentiment_weight: 50,
      price_momentum_focus: 50,
      market_rank_priority: 50,
    }
  );
  const [loading, setLoading] = useState(!localOnly && !initialPreferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  useEffect(() => {
    // Only load from API if not in localOnly mode and no initial preferences provided
    if (!localOnly && !initialPreferences) {
      loadPreferences();
    }
  }, [userWallet, localOnly, initialPreferences]);

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
    // Force blur on any focused input to commit pending changes
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Small delay to ensure blur event completes
    await new Promise(resolve => setTimeout(resolve, 50));

    setSaving(true);
    setError('');

    try {
      // If localOnly mode, just return preferences via callback without saving to API
      if (localOnly) {
        console.log('[TradingPreferencesModal] Saving preferences:', preferences);
        if (onSaveLocal) {
          onSaveLocal(preferences);
          // Don't call onClose() here - onSaveLocal will handle closing the modal
          // Calling onClose() causes the fallback handler to trigger and reset to defaults
        } else {
          // Only close if there's no callback (shouldn't happen)
          onClose();
        }
        return;
      }

      // Otherwise, save to API as usual
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
}) => {
  const [inputValue, setInputValue] = useState(value.toString());
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Only sync input with slider value when input is not focused
  useEffect(() => {
    if (!isInputFocused) {
      setInputValue(value.toString());
    }
  }, [value, isInputFocused]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow empty string or valid numbers
    if (val === '' || /^\d+$/.test(val)) {
      setInputValue(val);
    }
  };

  const handleInputFocus = () => {
    setIsInputFocused(true);
  };

  const handleInputBlur = () => {
    setIsInputFocused(false);
    
    // Validate and correct on blur
    const num = parseInt(inputValue);
    if (isNaN(num) || num < 0 || inputValue === '') {
      onChange(0);
      setInputValue('0');
    } else if (num > 100) {
      onChange(100);
      setInputValue('100');
    } else {
      onChange(num);
      setInputValue(num.toString());
    }
  };

  return (
    <div className="border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-5 space-y-4 rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{helper}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--accent)] font-bold uppercase px-2 py-1 bg-[var(--accent)]/10 rounded">
            {badge}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleInputBlur();
                e.currentTarget.blur();
              }
            }}
            className="w-16 px-2 py-1.5 text-center border-2 border-[var(--accent)]/60 bg-black text-[var(--accent)] font-mono font-bold text-sm rounded hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none transition-colors"
            placeholder="0-100"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-400 px-1 font-medium">
          <span>{left}</span>
          <span>{right}</span>
        </div>
        
        <Slider.Root
          className="relative flex items-center select-none touch-none w-full h-8 group cursor-pointer"
          value={[value]}
          onValueChange={(vals) => onChange(vals[0])}
          max={100}
          min={0}
          step={1}
        >
          <Slider.Track className="bg-gray-400 relative grow rounded-full h-3 cursor-pointer hover:bg-gray-600 transition-colors">
            <Slider.Range className="absolute bg-gradient-to-r from-[var(--accent)]/70 to-[var(--accent)] h-full rounded-full" />
          </Slider.Track>
          <Slider.Thumb
            className="block w-7 h-7 bg-[var(--accent)] border-3 border-black rounded-full hover:scale-125 focus:outline-none focus:ring-4 focus:ring-[var(--accent)]/50 transition-all duration-150 cursor-grab active:cursor-grabbing active:scale-110 shadow-xl"
            aria-label={title}
          />
        </Slider.Root>

        <div className="flex justify-between text-xs text-gray-500 px-1 font-mono">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{description}</p>
    </div>
  );
};

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div 
        className="bg-[var(--bg-deep)] border border-[var(--accent)] max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--accent)] p-6 flex items-center justify-between flex-shrink-0">
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

        <div 
          className="p-6 space-y-4 bg-[var(--bg-deep)] overflow-y-auto flex-1 modal-scrollable"
          style={{ overscrollBehavior: 'contain' }}
          onWheel={(e) => {
            const target = e.currentTarget;
            const isAtTop = target.scrollTop === 0;
            const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
            
            if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
              e.stopPropagation();
            }
          }}
        >
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
                  {saving ? 'Saving...' : localOnly ? 'Continue' : 'Save Preferences'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

