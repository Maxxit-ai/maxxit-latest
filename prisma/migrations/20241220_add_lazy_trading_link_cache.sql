-- Create a temporary cache table for lazy trading link codes
-- This table maps link codes to wallet addresses so the webhook knows which wallet the telegram belongs to
-- Entries expire after 10 minutes

CREATE TABLE IF NOT EXISTS lazy_trading_link_cache (
  link_code VARCHAR(50) PRIMARY KEY,
  user_wallet VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_lazy_trading_link_cache_expires_at 
ON lazy_trading_link_cache(expires_at);

-- Comment
COMMENT ON TABLE lazy_trading_link_cache IS 'Temporary cache mapping lazy trading link codes to wallet addresses. Expires after 10 minutes.';
