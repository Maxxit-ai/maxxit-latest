/**
 * Time utilities for 6-hour bucketing and signal deduplication
 */

/**
 * Bucket a timestamp to the nearest 6-hour window (UTC)
 * Windows: 00:00, 06:00, 12:00, 18:00
 */
export function bucket6hUtc(timestamp: Date | string): Date {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const hours = date.getUTCHours();
  const bucketHour = Math.floor(hours / 6) * 6;
  
  const bucketed = new Date(date);
  bucketed.setUTCHours(bucketHour, 0, 0, 0);
  
  return bucketed;
}

/**
 * Get the current 6h bucket
 */
export function getCurrentBucket6h(): Date {
  return bucket6hUtc(new Date());
}

/**
 * Format bucket for display
 */
export function formatBucket(bucket: Date): string {
  return bucket.toISOString();
}
