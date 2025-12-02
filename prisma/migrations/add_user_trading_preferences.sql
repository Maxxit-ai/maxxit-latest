-- Migration: Add user_trading_preferences table
-- Adds Agent HOW personalization layer

CREATE TABLE IF NOT EXISTS user_trading_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_wallet TEXT UNIQUE NOT NULL,
  risk_tolerance INTEGER DEFAULT 50 CHECK (risk_tolerance >= 0 AND risk_tolerance <= 100),
  trade_frequency INTEGER DEFAULT 50 CHECK (trade_frequency >= 0 AND trade_frequency <= 100),
  social_sentiment_weight INTEGER DEFAULT 50 CHECK (social_sentiment_weight >= 0 AND social_sentiment_weight <= 100),
  price_momentum_focus INTEGER DEFAULT 50 CHECK (price_momentum_focus >= 0 AND price_momentum_focus <= 100),
  market_rank_priority INTEGER DEFAULT 50 CHECK (market_rank_priority >= 0 AND market_rank_priority <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_trading_preferences_wallet ON user_trading_preferences(user_wallet);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_trading_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_trading_preferences_updated_at
  BEFORE UPDATE ON user_trading_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_trading_preferences_updated_at();

