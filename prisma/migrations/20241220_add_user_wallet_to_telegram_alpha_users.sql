-- Add user_wallet column to telegram_alpha_users table
-- This column links lazy traders to their wallet addresses
-- Only lazy traders will have this field populated

ALTER TABLE telegram_alpha_users 
ADD COLUMN IF NOT EXISTS user_wallet VARCHAR(255);

-- Add index for efficient querying by wallet
CREATE INDEX IF NOT EXISTS idx_telegram_alpha_users_user_wallet 
ON telegram_alpha_users(user_wallet);

-- Comment on column
COMMENT ON COLUMN telegram_alpha_users.user_wallet IS 'Wallet address for lazy traders - links telegram account to wallet';
