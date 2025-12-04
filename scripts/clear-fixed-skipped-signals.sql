-- Clear skipped_reason for signals that failed due to errors we've fixed
-- This allows trade executor to retry them

-- 1. Clear cryptography errors (Ostium - now fixed)
UPDATE signals 
SET skipped_reason = NULL 
WHERE skipped_reason LIKE '%No module named ''cryptography''%'
AND NOT EXISTS (SELECT 1 FROM positions WHERE positions.signal_id = signals.id);

-- 2. Clear wallet pool errors (Ostium - old error, now fixed)
UPDATE signals 
SET skipped_reason = NULL 
WHERE skipped_reason LIKE '%not found in wallet pool%'
AND NOT EXISTS (SELECT 1 FROM positions WHERE positions.signal_id = signals.id);

-- Show what was cleared
SELECT 
  id,
  token_symbol,
  side,
  venue,
  skipped_reason,
  created_at
FROM signals
WHERE skipped_reason IS NULL
AND NOT EXISTS (SELECT 1 FROM positions WHERE positions.signal_id = signals.id)
ORDER BY created_at DESC
LIMIT 10;
