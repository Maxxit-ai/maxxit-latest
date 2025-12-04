-- Complete Migration for Vprime-telegram-clean
-- This migration:
-- 1. Creates user_agent_addresses table (one address per user)
-- 2. Creates user_trading_preferences table (Agent HOW)
-- 3. Removes old address fields from agent_deployments

BEGIN;

-- ============================================================================
-- 1. CREATE user_agent_addresses TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_agent_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_wallet TEXT UNIQUE NOT NULL,
  hyperliquid_agent_address TEXT UNIQUE,
  hyperliquid_agent_key_encrypted TEXT,
  hyperliquid_agent_key_iv TEXT,
  hyperliquid_agent_key_tag TEXT,
  ostium_agent_address TEXT UNIQUE,
  ostium_agent_key_encrypted TEXT,
  ostium_agent_key_iv TEXT,
  ostium_agent_key_tag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_agent_addresses_wallet 
  ON user_agent_addresses(user_wallet);
CREATE INDEX IF NOT EXISTS idx_user_agent_addresses_hyperliquid 
  ON user_agent_addresses(hyperliquid_agent_address);
CREATE INDEX IF NOT EXISTS idx_user_agent_addresses_ostium 
  ON user_agent_addresses(ostium_agent_address);

-- ============================================================================
-- 2. CREATE user_trading_preferences TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_trading_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_wallet TEXT UNIQUE NOT NULL,
  risk_tolerance INTEGER DEFAULT 50 CHECK (risk_tolerance >= 0 AND risk_tolerance <= 100),
  trade_frequency INTEGER DEFAULT 50 CHECK (trade_frequency >= 0 AND trade_frequency <= 100),
  social_sentiment_weight INTEGER DEFAULT 50 CHECK (social_sentiment_weight >= 0 AND social_sentiment_weight <= 100),
  price_momentum_focus INTEGER DEFAULT 50 CHECK (price_momentum_focus >= 0 AND price_momentum_focus <= 100),
  market_rank_priority INTEGER DEFAULT 50 CHECK (market_rank_priority >= 0 AND market_rank_priority <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_trading_preferences_wallet 
  ON user_trading_preferences(user_wallet);

-- Create update trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_trading_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_trading_preferences_updated_at ON user_trading_preferences;
CREATE TRIGGER trigger_user_trading_preferences_updated_at
  BEFORE UPDATE ON user_trading_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_trading_preferences_updated_at();

-- ============================================================================
-- 3. MIGRATE EXISTING DATA (if any) from agent_deployments to user_agent_addresses
-- ============================================================================

-- Migrate Hyperliquid addresses
INSERT INTO user_agent_addresses (
  user_wallet,
  hyperliquid_agent_address,
  hyperliquid_agent_key_encrypted,
  hyperliquid_agent_key_iv,
  hyperliquid_agent_key_tag,
  created_at
)
SELECT DISTINCT
  LOWER(user_wallet) as user_wallet,
  hyperliquid_agent_address,
  hyperliquid_agent_key_encrypted,
  hyperliquid_agent_key_iv,
  hyperliquid_agent_key_tag,
  NOW() as created_at
FROM agent_deployments
WHERE hyperliquid_agent_address IS NOT NULL
  AND hyperliquid_agent_key_encrypted IS NOT NULL
ON CONFLICT (user_wallet) DO UPDATE SET
  hyperliquid_agent_address = EXCLUDED.hyperliquid_agent_address,
  hyperliquid_agent_key_encrypted = EXCLUDED.hyperliquid_agent_key_encrypted,
  hyperliquid_agent_key_iv = EXCLUDED.hyperliquid_agent_key_iv,
  hyperliquid_agent_key_tag = EXCLUDED.hyperliquid_agent_key_tag,
  last_used_at = NOW();

-- Migrate Ostium addresses
UPDATE user_agent_addresses ua
SET 
  ostium_agent_address = ad.ostium_agent_address,
  ostium_agent_key_encrypted = ad.ostium_agent_key_encrypted,
  ostium_agent_key_iv = ad.ostium_agent_key_iv,
  ostium_agent_key_tag = ad.ostium_agent_key_tag,
  last_used_at = NOW()
FROM (
  SELECT DISTINCT
    LOWER(user_wallet) as user_wallet,
    ostium_agent_address,
    ostium_agent_key_encrypted,
    ostium_agent_key_iv,
    ostium_agent_key_tag
  FROM agent_deployments
  WHERE ostium_agent_address IS NOT NULL
    AND ostium_agent_key_encrypted IS NOT NULL
) ad
WHERE ua.user_wallet = ad.user_wallet
  AND ad.ostium_agent_address IS NOT NULL;

-- Insert Ostium-only addresses (if any user has Ostium but no Hyperliquid)
INSERT INTO user_agent_addresses (
  user_wallet,
  ostium_agent_address,
  ostium_agent_key_encrypted,
  ostium_agent_key_iv,
  ostium_agent_key_tag,
  created_at
)
SELECT DISTINCT
  LOWER(user_wallet) as user_wallet,
  ostium_agent_address,
  ostium_agent_key_encrypted,
  ostium_agent_key_iv,
  ostium_agent_key_tag,
  NOW() as created_at
FROM agent_deployments
WHERE ostium_agent_address IS NOT NULL
  AND ostium_agent_key_encrypted IS NOT NULL
  AND LOWER(user_wallet) NOT IN (SELECT user_wallet FROM user_agent_addresses)
ON CONFLICT (user_wallet) DO NOTHING;

-- ============================================================================
-- 4. REMOVE OLD ADDRESS FIELDS from agent_deployments
-- ============================================================================

-- Drop columns (if they exist)
ALTER TABLE agent_deployments 
  DROP COLUMN IF EXISTS hyperliquid_agent_address CASCADE,
  DROP COLUMN IF EXISTS hyperliquid_agent_key_encrypted CASCADE,
  DROP COLUMN IF EXISTS hyperliquid_agent_key_iv CASCADE,
  DROP COLUMN IF EXISTS hyperliquid_agent_key_tag CASCADE,
  DROP COLUMN IF EXISTS ostium_agent_address CASCADE,
  DROP COLUMN IF EXISTS ostium_agent_key_encrypted CASCADE,
  DROP COLUMN IF EXISTS ostium_agent_key_iv CASCADE,
  DROP COLUMN IF EXISTS ostium_agent_key_tag CASCADE;

-- Remove unique constraint on (user_wallet, agent_id) if it exists
-- This allows multiple deployments per user per agent
ALTER TABLE agent_deployments 
  DROP CONSTRAINT IF EXISTS agent_deployments_user_wallet_agent_id_key;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Count migrated addresses
DO $$
DECLARE
  user_addresses_count INTEGER;
  preferences_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_addresses_count FROM user_agent_addresses;
  SELECT COUNT(*) INTO preferences_count FROM user_trading_preferences;
  
  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  - user_agent_addresses: % rows', user_addresses_count;
  RAISE NOTICE '  - user_trading_preferences: % rows', preferences_count;
END $$;

COMMIT;

-- Show summary
SELECT 
  'user_agent_addresses' as table_name,
  COUNT(*) as row_count,
  COUNT(hyperliquid_agent_address) as hyperliquid_count,
  COUNT(ostium_agent_address) as ostium_count
FROM user_agent_addresses
UNION ALL
SELECT 
  'user_trading_preferences' as table_name,
  COUNT(*) as row_count,
  NULL as hyperliquid_count,
  NULL as ostium_count
FROM user_trading_preferences;

